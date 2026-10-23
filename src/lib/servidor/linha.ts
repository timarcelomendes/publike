import "server-only";
import { cache } from "react";
import { vagaNoTurno, type Aderencia } from "@/lib/aderencia";
import {
  buscarAnuncios,
  listarMatches,
  obterMeuPerfil,
  obterUsuario,
  respostaDeQuemPublica,
  vagasSalvasEntre,
  type DetalhesDaVaga,
} from "@/lib/dados";
import { lerFiltros, type Filtros } from "@/lib/filtros";
import { ACEITE_NA_LINHA, marcaDaVisita, SESSAO_DA_HOME, novidades, type ItemDaLinha } from "@/lib/linha-do-tempo";
import { obterLocal } from "@/lib/local";
import type { Local } from "@/lib/regioes";
import { partirDoLocal } from "@/lib/servidor/busca-salva";
import { anunciosComContatoDireto } from "@/lib/servidor/contato-direto";
import { fotosDosAutores } from "@/lib/servidor/fotos-autores";
import { matchDasVagas, origemDoTempo, quemProcura, requisitosDaLista } from "@/lib/servidor/lista-anuncios";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { obterIntencao } from "@/lib/servidor/intencao";
import { noticiasPublicadas } from "@/lib/servidor/noticias";
import type { Noticia } from "@/lib/noticias";
import { recadosDaLinha, type Recado } from "@/lib/servidor/recados";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { AnuncioResumo, Match } from "@/lib/tipos";
import type { Resposta } from "@/lib/resposta";
import type { OrigemMapa, PontoMapa } from "@/components/mapa/mapa-anuncios";
import { deslocamentoCurto } from "@/lib/deslocamento";
import {
  formatarDistancia,
  formatarLugar,
  primeiro,
  rotuloConta,
  rotuloModalidade,
  valorCurto,
  valorDoAnuncio,
} from "@/lib/formato";
import { cidadeDaVisita } from "@/lib/servidor/cidade";

/** As abas da linha. */
export type AbaDaLinha = "tudo" | "vaga" | "servico" | "recado";
export const ABAS_DA_LINHA: AbaDaLinha[] = ["tudo", "vaga", "servico", "recado"];

/** Quantos anúncios a linha busca (do mais novo para o mais antigo). */
const LIMITE = 120;

/** O que fica guardado da home em `preferencias` (só a pessoa lê). */
export type PreferenciasDaHome = {
  vistaEm: string | null;
  marcaEm: string | null;
  aba: AbaDaLinha | null;
  fundo: string;
  fundoArquivo: string | null;
};

export const preferenciasDaHome = cache(async (): Promise<PreferenciasDaHome> => {
  const vazio: PreferenciasDaHome = { vistaEm: null, marcaEm: null, aba: null, fundo: "preto", fundoArquivo: null };
  const usuario = await obterUsuario();
  if (!usuario) return vazio;
  try {
    const supabase = await criarClienteServidor();
    const { data } = await supabase
      .from("preferencias")
      .select("home_vista_em, home_marca_em, home_aba, fundo, fundo_arquivo")
      .eq("perfil_id", usuario.id)
      .maybeSingle();
    if (!data) return vazio;
    return {
      vistaEm: data.home_vista_em,
      marcaEm: data.home_marca_em,
      aba: ABAS_DA_LINHA.includes(data.home_aba as AbaDaLinha) ? (data.home_aba as AbaDaLinha) : null,
      fundo: data.fundo,
      fundoArquivo: data.fundo_arquivo,
    };
  } catch {
    // sem a migração da home (ou o banco fora): a linha funciona sem marca e abre em Tudo
    return vazio;
  }
});

/** O começo da descrição numa linha só (o cartão corta em 2 linhas). */
const resumoDe = (texto: string | null | undefined) =>
  texto ? texto.replace(/\s+/g, " ").trim().slice(0, 240) || null : null;

/** A descrição dos serviços da linha (a busca não traz; as vagas já vêm com os requisitos). */
async function descricoesDosServicos(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  try {
    const supabase = await criarClienteServidor();
    const { data } = await supabase.from("anuncios").select("id, descricao").in("id", ids);
    return new Map((data ?? []).map((a) => [a.id, a.descricao]));
  } catch {
    return new Map();
  }
}

/** Um anúncio na linha, com o que o cartão precisa. */
export type AnuncioNaLinha = {
  anuncio: AnuncioResumo;
  foto: string | null;
  match: Aderencia | null;
  resposta: Resposta | null;
  requisitos: DetalhesDaVaga | null;
  salva: boolean | null;
  /** o começo da descrição (a introdução no cartão), numa linha só */
  resumo: string | null;
  /** quantas pessoas curtiram a vaga (só a partir de 3; quem curtiu nunca aparece) e quando foi a última */
  curtidas?: { total: number; ultima: string } | null;
};

type CurtidasDaVaga = { total: number | null; ultima: string };

/**
 * As curtidas das vagas: a hora da última de cada vaga curtida e o número, que o banco só devolve a
 * partir de 3 (nunca quem curtiu). Banco sem a migração: sem curtidas.
 */
async function curtidasDasVagas(ids: string[]): Promise<Map<string, CurtidasDaVaga>> {
  if (!ids.length) return new Map();
  const { data, error } = await (await criarClienteServidor()).rpc("curtidas_das_vagas", { p_ids: ids.slice(0, 200) });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao contar as curtidas das vagas: ${error.message}`);
    return new Map();
  }
  return new Map((data ?? []).map((l) => [l.anuncio_id, { total: l.curtidas, ultima: l.ultima }]));
}

/**
 * As vagas que sobem na linha: toda vaga curtida vale pela hora da última curtida. Essa é a hora da
 * vaga na linha e também a que conta como novidade: o que fica acima do "Você parou aqui" é novo.
 */
function horasQueSobem(curtidas: Map<string, CurtidasDaVaga>) {
  return new Map([...curtidas].map(([id, c]) => [id, c.ultima] as const));
}

/** Quantas notícias a linha lê, e até quantos dias depois da publicação (ou da atualização) elas ficam. */
const NOTICIAS_NA_LINHA = 12;
const NOTICIA_NA_LINHA = 30 * 24 * 60 * 60 * 1000;
/** Uma edição até 10 minutos depois de publicar é acerto, não atualização (não sobe de novo). */
const ACERTO_DA_NOTICIA = 10 * 60 * 1000;

/** A hora da notícia na linha: a da publicação ou, se mudou depois, a da última mudança. */
function horaDaNoticia(n: Noticia): { quando: string; atualizada: boolean } {
  const publicada = n.publicar_em ?? n.criado_em;
  const atualizada = Boolean(
    n.atualizado_em && Date.parse(n.atualizado_em) - Date.parse(publicada) > ACERTO_DA_NOTICIA,
  );
  return { quando: atualizada ? (n.atualizado_em as string) : publicada, atualizada };
}

/** A hora de uma vaga na linha: a da publicação ou, se ela subiu, a da última curtida. */
function horaDaVaga(publicada: string, subiu: string | undefined) {
  return subiu && Date.parse(subiu) > Date.parse(publicada) ? subiu : publicada;
}

export type DadoDaLinha =
  | { anuncio: AnuncioNaLinha }
  | { noticia: Noticia; /** mudou depois de publicada: entra na linha na hora da mudança */ atualizada: boolean }
  | { aceite: Match; /** contato direto: o match saiu na hora, sem aceite */ direto: boolean }
  | { recado: Recado };

export type DadosDaLinha = {
  agora: number;
  local: Local | null;
  usuarioId: string | null;
  aba: AbaDaLinha;
  /** os filtros da busca (a ordem: "ultimas", do mais novo para o mais antigo, ou "relevantes") */
  filtros: Filtros;
  /** "Mais relevantes": os anúncios mais curtidos e abertos em 30 dias, na ordem do banco (sem dias nem a marca) */
  relevantes: boolean;
  /** os mesmos, antes de partir da casa (para a barra e os links) */
  filtrosDaBusca: Filtros;
  tempoDe: "casa" | "voce" | null;
  itens: ItemDaLinha<DadoDaLinha>[];
  marca: number | null;
  /** esta abertura começa uma visita (a anterior foi há mais de 30 min): só aí o topo diz quantas novidades */
  visitaNova: boolean;
  novas: { tudo: number; vaga: number; servico: number; recado: number };
  /** a pessoa pode escrever recado (tem conta) e o que ela faz ("pessoa" escreve o que procura) */
  autorTipo: string | null;
};

type Parametros = Record<string, string | string[] | undefined>;

/**
 * Tudo o que a linha do tempo da home mostra, numa leitura só por requisição (o topo, as abas, a
 * linha e o mapa usam o mesmo resultado). `chave` = os parâmetros da URL em JSON.
 */
export const dadosDaLinha = cache(async (chave: string): Promise<DadosDaLinha> => {
  const sp = JSON.parse(chave) as Parametros;
  const [agora, local, usuario, prefs, visita] = await Promise.all([
    agoraDaRequisicao(),
    obterLocal(),
    obterUsuario(),
    preferenciasDaHome(),
    cidadeDaVisita(),
  ]);
  const lidos = lerFiltros(sp);
  // a aba: a da URL; sem ela, a última escolhida; sem nada, a da resposta "O que você quer fazer"
  // (quem quer contratar um serviço abre em Serviços) ou Tudo
  const aba: AbaDaLinha =
    primeiro(sp.tipo) === "recado"
      ? "recado"
      : (lidos.tipo ??
        (lidos.tudo
          ? "tudo"
          : (prefs.aba ?? ((await obterIntencao().catch(() => null)) === "contratar_servico" ? "servico" : "tudo"))));
  const filtrosDaBusca: Filtros = {
    ...lidos,
    tipo: aba === "vaga" || aba === "servico" ? aba : null,
    tudo: aba === "tudo" || aba === "recado",
    // do mais novo para o mais antigo, com as vagas curtidas na hora da última curtida; ou, se a pessoa
    // escolheu, as mais relevantes (curtidas e aberturas dos últimos 30 dias). As outras ordens abrem a lista.
    ordem: lidos.ordem === "relevantes" ? "relevantes" : "ultimas",
    regime: aba === "servico" ? null : lidos.regime,
    turno: aba === "vaga" ? lidos.turno : null,
  };
  const filtros = partirDoLocal(filtrosDaBusca, local, visita.praca.cidade);
  const relevantes = filtrosDaBusca.ordem === "relevantes";
  const usuarioId = usuario?.id ?? null;

  // na aba Recados, só os recados (os anúncios entram na conta das novidades mais abaixo)
  const [encontrados, quem, matchesDaConta, recados, perfil] = await Promise.all([
    aba === "recado" ? Promise.resolve([]) : buscarAnuncios(filtros, agora, local, usuarioId),
    usuario && (aba === "tudo" || aba === "vaga") ? quemProcura() : Promise.resolve(null),
    usuario ? listarMatches().catch(() => []) : Promise.resolve([]),
    usuario ? recadosDaLinha(filtros) : Promise.resolve([]),
    usuario ? obterMeuPerfil().catch(() => null) : Promise.resolve(null),
  ]);
  const marca = marcaDaVisita(prefs.vistaEm, prefs.marcaEm, agora);
  const visitaNova = prefs.vistaEm !== null && agora - new Date(prefs.vistaEm).getTime() > SESSAO_DA_HOME;
  const requisitos = await requisitosDaLista(encontrados).catch(() => null);
  const turno = filtros.turno;
  const anuncios = (
    turno && requisitos
      ? encontrados.filter((a) => {
          const v = requisitos.get(a.id);
          return a.tipo === "vaga" && v !== undefined && vagaNoTurno(v, turno);
        })
      : encontrados
  ).slice(0, LIMITE);
  const matches =
    usuarioId && quem && requisitos ? matchDasVagas(anuncios, requisitos, quem, usuarioId, agora) : new Map();
  const deOutros = anuncios.filter((a) => a.tipo === "vaga" && a.autor_id !== usuarioId);
  const [resposta, salvas, logos, textosDosServicos] = await Promise.all([
    respostaDeQuemPublica(deOutros.map((a) => a.autor_id)).catch(() => new Map<string, Resposta>()),
    usuarioId ? vagasSalvasEntre(deOutros.map((a) => a.id)).catch(() => null) : Promise.resolve(null),
    fotosDosAutores(anuncios.map((a) => a.autor_id)),
    descricoesDosServicos(anuncios.filter((a) => a.tipo === "servico").map((a) => a.id)),
  ]);

  const itens: ItemDaLinha<DadoDaLinha>[] = anuncios.map((a) => ({
    tipo: a.tipo === "servico" ? "servico" : "vaga",
    id: a.id,
    quando: a.criado_em,
    dados: {
      anuncio: {
        anuncio: a,
        foto: logos[a.autor_id] ?? null,
        match: matches.get(a.id) ?? null,
        resposta: a.tipo === "vaga" ? (resposta.get(a.autor_id) ?? null) : null,
        requisitos: requisitos?.get(a.id) ?? null,
        salva: a.tipo === "vaga" && salvas && a.autor_id !== usuarioId ? salvas.has(a.id) : null,
        resumo: resumoDe(a.tipo === "servico" ? textosDosServicos.get(a.id) : requisitos?.get(a.id)?.descricao),
      },
    },
  }));
  // as vagas que as pessoas curtiram: o número no cartão ("8 pessoas já curtiram", só a partir de 3)
  // e a hora da última curtida, para onde a vaga sobe. Antes de contar as novidades: a vaga que subiu
  // fica acima do "Você parou aqui" e conta como novidade (a saudação e as abas batem com a linha)
  if (aba === "tudo" || aba === "vaga") {
    const curtidas = await curtidasDasVagas(anuncios.filter((a) => a.tipo === "vaga").map((a) => a.id)).catch(
      () => new Map<string, CurtidasDaVaga>(),
    );
    const sobem = horasQueSobem(curtidas);
    for (const i of itens) {
      const c = curtidas.get(i.id);
      if (i.tipo !== "vaga" || !c || !("anuncio" in i.dados)) continue;
      if (c.total !== null) i.dados.anuncio.curtidas = { total: c.total, ultima: c.ultima };
      i.quando = horaDaVaga(i.quando, sobem.get(i.id));
    }
  }
  // os aceites de quem curtiu (o outro lado aceitou), dos últimos 7 dias, só em Tudo
  const recentes = matchesDaConta.filter(
    (m) => m.papel === "curti" && m.match_em && agora - Date.parse(m.match_em) <= ACEITE_NA_LINHA,
  );
  // contato direto: o match saiu na hora, sem aceite (o cartão e o link da mensagem mudam)
  const diretos =
    aba === "tudo" && recentes.length
      ? await anunciosComContatoDireto(recentes.map((m) => m.anuncio_id))
      : new Set<string>();
  const aceites: ItemDaLinha<DadoDaLinha>[] = recentes.map((m) => ({
    tipo: "aceite",
    id: m.anuncio_id,
    quando: m.match_em,
    dados: { aceite: m, direto: diretos.has(m.anuncio_id) },
  }));
  // nas mais relevantes, só os anúncios (na ordem do banco): aceites, recados e notícias não têm pontos
  if (aba === "tudo" && !relevantes) itens.push(...aceites);
  // os recados no ar (e os da pessoa em revisão): em Tudo e em Recados
  const itensDeRecado: ItemDaLinha<DadoDaLinha>[] = recados.map((r) => ({
    tipo: "recado",
    id: r.id,
    quando: r.quando,
    dados: { recado: r },
  }));
  if (aba === "recado" || (aba === "tudo" && !relevantes)) itens.push(...itensDeRecado);
  // as notícias do Publike, só em Tudo e sem busca nem filtro: na hora da publicação ou, se foram
  // atualizadas depois, na hora da atualização (sobem de novo, com "Atualizada")
  const semFiltro = !filtros.q && !filtros.categoria && !filtros.regime && !filtros.turno;
  const itensDeNoticia: ItemDaLinha<DadoDaLinha>[] = semFiltro
    ? (await noticiasPublicadas(NOTICIAS_NA_LINHA).catch(() => []))
        .map((n) => ({ n, ...horaDaNoticia(n) }))
        .filter(({ quando }) => agora - Date.parse(quando) <= NOTICIA_NA_LINHA)
        .map(({ n, quando, atualizada }) => ({
          tipo: "noticia",
          id: n.id,
          quando,
          dados: { noticia: n, atualizada },
        }))
    : [];
  if (aba === "tudo" && !relevantes) itens.push(...itensDeNoticia);
  // os da própria pessoa não contam como novidade
  const recadosDeOutros = itensDeRecado.filter((i) => "recado" in i.dados && !i.dados.recado.meu);

  // os números das abas contam tudo junto: fora de Tudo, uma busca a mais (só com marca)
  let novas = novidades(
    aba === "tudo" ? [...itens.filter((i) => i.tipo !== "recado"), ...recadosDeOutros] : itens,
    marca,
  );
  if (aba !== "tudo" && marca !== null) {
    const todos = await buscarAnuncios(
      { ...filtros, tipo: null, tudo: true, regime: null, turno: null },
      agora,
      local,
      usuarioId,
    ).catch(() => []);
    // as vagas que subiram contam pela hora da última curtida, como na linha
    const sobemDeTodas = horasQueSobem(
      await curtidasDasVagas(todos.filter((a) => a.tipo === "vaga").map((a) => a.id)).catch(
        () => new Map<string, CurtidasDaVaga>(),
      ),
    );
    novas = novidades(
      [
        ...todos.map(
          (a) =>
            ({
              tipo: a.tipo === "servico" ? "servico" : "vaga",
              id: a.id,
              quando: a.tipo === "vaga" ? horaDaVaga(a.criado_em, sobemDeTodas.get(a.id)) : a.criado_em,
              dados: null,
            }) as const,
        ),
        ...aceites,
        ...recadosDeOutros,
        ...itensDeNoticia,
      ],
      marca,
    );
  }
  return {
    agora,
    local,
    usuarioId,
    aba,
    filtros,
    relevantes,
    filtrosDaBusca,
    tempoDe: origemDoTempo(filtros, local),
    itens,
    marca,
    visitaNova,
    novas,
    autorTipo: perfil?.tipo ?? null,
  };
});

/** A chave do `dadosDaLinha` a partir dos parâmetros da página. */
export const chaveDaLinha = (sp: Parametros) =>
  JSON.stringify(Object.fromEntries(Object.entries(sp).sort(([a], [b]) => a.localeCompare(b))));

/** Os pontos do mapa da linha (os anúncios dela) e de onde contam as distâncias. */
export function mapaDaLinha(d: DadosDaLinha): { pontos: PontoMapa[]; origem: OrigemMapa } {
  const pontos: PontoMapa[] = [];
  for (const i of d.itens) {
    if (!("anuncio" in i.dados)) continue;
    const { anuncio: a, match } = i.dados.anuncio;
    const tempo = d.tempoDe && a.tipo === "vaga" ? deslocamentoCurto(a.distancia_km) : null;
    pontos.push({
      id: a.id,
      lat: a.lat,
      lng: a.lng,
      titulo: a.titulo,
      tipo: a.tipo,
      lugar: formatarLugar(a.bairro, a.cidade),
      valor: valorDoAnuncio(a),
      curto:
        a.tipo === "servico" && a.pagamento_valor != null
          ? `a partir de ${valorCurto(a.pagamento_valor, a.pagamento_unidade)}`
          : valorCurto(a.pagamento_valor, a.pagamento_unidade),
      modalidade: rotuloModalidade(a.tipo, a.regime),
      distancia: formatarDistancia(a.distancia_km),
      tempo: tempo ? `${tempo} ${d.tempoDe === "casa" ? "da sua casa" : "de onde você está"}` : null,
      autor: `${a.autor_nome} · ${rotuloConta(a.autor_tipo)}`,
      match: a.minha_curtida === "match" ? null : (match?.nota ?? null),
    });
  }
  const f = d.filtros;
  const origem: OrigemMapa =
    d.tempoDe === "casa"
      ? { lat: f.lat, lng: f.lng, rotulo: "Sua casa", tipo: "casa" }
      : d.tempoDe === "voce"
        ? { lat: f.lat, lng: f.lng, rotulo: "Você está aqui", tipo: "voce" }
        : null;
  return { pontos, origem };
}
