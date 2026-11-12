import "server-only";
import type { Conquista, ConquistaPendente } from "@/lib/conquistas";
import { conquistasDaLinha, conquistasPendentes } from "@/lib/servidor/conquistas";
import { SEM_COMENTARIOS, type RespostaNoFeed, type ResumoComentarios } from "@/lib/comentarios";
import { cookies } from "next/headers";
import { cache } from "react";
import { vagaNoTurno, type Aderencia } from "@/lib/aderencia";
import {
  buscarAnuncios,
  listarMatches,
  listarMinhasCurtidas,
  minhasBuscasSalvas,
  obterMeuCurriculo,
  obterMeuPerfil,
  obterProcuro,
  obterUsuario,
  respostaDeQuemPublica,
  vagasSalvasEntre,
  type DetalhesDaVaga,
} from "@/lib/dados";
import { meusSeguidos } from "@/lib/dados-social";
import { semAcento } from "@/lib/descobrir";
import { lerFiltros, RAIOS, type Filtros } from "@/lib/filtros";
import {
  ACEITE_NA_LINHA,
  COOKIE_ORDEM_DA_LINHA,
  marcaDaVisita,
  SESSAO_DA_HOME,
  novidades,
  type ItemDaLinha,
} from "@/lib/linha-do-tempo";
import {
  categoriasDasCurtidas,
  ordenarPorRelevancia,
  porQueDaOrdem,
  SEM_SINAIS,
  type SinaisDaPessoa,
} from "@/lib/relevancia";
import { obterLocal } from "@/lib/local";
import type { Local } from "@/lib/regioes";
import { partirDoLocal, textoDaOrigem } from "@/lib/servidor/busca-salva";
import { anunciosComContatoDireto } from "@/lib/servidor/contato-direto";
import { fotosDosAutores } from "@/lib/servidor/fotos-autores";
import { matchDasVagas, origemDoTempo, quemProcura, requisitosDaLista } from "@/lib/servidor/lista-anuncios";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { obterIntencao } from "@/lib/servidor/intencao";
import { perfilDeUso } from "@/lib/servidor/perfil-de-uso";
import { recadosDaLinha, type Recado } from "@/lib/servidor/recados";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { AnuncioResumo, Match, MeuPerfil } from "@/lib/tipos";
import type { Resposta } from "@/lib/resposta";
import type { OrigemMapa, PontoMapa } from "@/components/mapa/mapa-anuncios";
import { deslocamentoProvavel } from "@/lib/deslocamento";
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
import { comPertoGuardado } from "@/lib/servidor/perto";

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
  /** quantas pessoas curtiram a vaga e quantas viraram match (só os números; quem curtiu nunca aparece) */
  curtidas?: { total: number; matches: number; ultima: string } | null;
  /** quantos comentários no ar a vaga tem e o último (o feed mostra e abre a conversa ali mesmo) */
  comentarios?: ResumoComentarios;
};

type CurtidasDaVaga = { total: number | null; matches: number; ultima: string };

/**
 * As curtidas das vagas: a hora da última, o número e quantas viraram match (migração 20261205120000;
 * nunca quem curtiu). Banco sem a migração: sem curtidas.
 */
export async function curtidasDasVagas(ids: string[]): Promise<Map<string, CurtidasDaVaga>> {
  if (!ids.length) return new Map();
  const { data, error } = await (await criarClienteServidor()).rpc("curtidas_das_vagas", { p_ids: ids.slice(0, 200) });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao contar as curtidas das vagas: ${error.message}`);
    return new Map();
  }
  return new Map(
    (data ?? []).map((l) => [l.anuncio_id, { total: l.curtidas, matches: l.matches ?? 0, ultima: l.ultima }]),
  );
}

/** As respostas de quem publicou, uma por vaga, dos últimos 7 dias (migração 20270324120000; sem ela, nada). */
export async function respostasDasVagas(ids: string[]): Promise<RespostaNoFeed[]> {
  if (!ids.length) return [];
  try {
    const { data, error } = await (await criarClienteServidor()).rpc("respostas_recentes_das_vagas", {
      p_ids: ids.slice(0, 200),
    });
    return error ? [] : (data ?? []);
  } catch {
    return [];
  }
}

/**
 * Quantos comentários no ar cada vaga tem, se aceita comentários e o último (migração 20270319120000; sem ela,
 * nada).
 */
export async function comentariosDasVagas(ids: string[]): Promise<Map<string, ResumoComentarios>> {
  if (!ids.length) return new Map();
  const { data, error } = await (await criarClienteServidor()).rpc("comentarios_das_vagas", { p_ids: ids.slice(0, 200) });
  if (error) return new Map();
  return new Map(
    (data ?? []).map((l) => [
      l.anuncio_id,
      {
        total: Number(l.comentarios),
        ligados: l.ligados !== false,
        ultimo: l.ultimo_texto ? { nome: l.ultimo_nome ?? "Conta do Publike", texto: l.ultimo_texto } : null,
      },
    ]),
  );
}

export type DadoDaLinha =
  | { anuncio: AnuncioNaLinha }
  | { aceite: Match; /** contato direto: o match saiu na hora, sem aceite */ direto: boolean }
  | { recado: Recado }
  | { conquista: Conquista }
  | { resposta: RespostaNoFeed };

export type DadosDaLinha = {
  agora: number;
  local: Local | null;
  usuarioId: string | null;
  aba: AbaDaLinha;
  /** os filtros da busca (a ordem: "ultimas", do mais novo para o mais antigo, ou "relevantes") */
  filtros: Filtros;
  /**
   * "Relevantes para você": os anúncios na ordem desta pessoa (o currículo, perto de casa, o que ela segue
   * e o que é novo: `ordenarPorRelevancia`), sem dias nem a marca
   */
  relevantes: boolean;
  /** nas relevantes, o que a ordem leva em conta (a linha embaixo do título) */
  porQue: string | null;
  /** os mesmos, antes de partir da casa (para a barra e os links) */
  filtrosDaBusca: Filtros;
  tempoDe: "casa" | "voce" | null;
  itens: ItemDaLinha<DadoDaLinha>[];
  /**
   * Na aba Recados, a linha não tem vagas nem serviços, mas o mapa do lado continua com os de perto
   * (sem ele, o mapa ficava vazio). Nas outras abas, null: o mapa usa os itens da linha.
   */
  doMapa: AnuncioResumo[] | null;
  marca: number | null;
  /** esta abertura começa uma visita (a anterior foi há mais de 30 min): só aí o topo diz quantas novidades */
  visitaNova: boolean;
  novas: { tudo: number; vaga: number; servico: number; recado: number };
  /** a pessoa pode escrever recado (tem conta) e o que ela faz ("pessoa" escreve o que procura) */
  autorTipo: string | null;
  /** as perguntas da conquista da pessoa ("Deu certo?", "Mostrar no Publike?"), no alto do feed */
  conquistasPendentes: ConquistaPendente[];
  /** o nome da pessoa (o "Mostrar no Publike?" mostra como a conquista aparece) */
  meuNome: string | null;
  /** de onde conta a distância ("da sua casa", "do meio de Setor Bueno"), para a linha do raio */
  origemDoRaio: string;
  /** o que o raio deixou de fora: quantos há em cada distância maior e de que cidades (null: nada de fora) */
  maisLonge: MaisLonge | null;
};

/** O que ficou fora do raio: `faixas` = quantos aparecem a mais com cada raio maior (só os que somam). */
export type MaisLonge = { total: number; cidades: string[]; faixas: { raio: number; quantos: number }[] };

type Parametros = Record<string, string | string[] | undefined>;

/**
 * Tudo o que a linha do tempo da home mostra, numa leitura só por requisição (o topo, as abas, a
 * linha e o mapa usam o mesmo resultado). `chave` = os parâmetros da URL em JSON.
 */
export const dadosDaLinha = cache(async (chave: string): Promise<DadosDaLinha> => {
  // com o "Perto de mim" guardado (24 h), conta de onde a pessoa estava
  const sp = await comPertoGuardado(JSON.parse(chave) as Parametros);
  const [agora, local, usuario, prefs, visita] = await Promise.all([
    agoraDaRequisicao(),
    obterLocal(),
    obterUsuario(),
    preferenciasDaHome(),
    cidadeDaVisita(),
  ]);
  const lidos = lerFiltros(sp);
  // a aba: a da URL; sem ela, a última que a pessoa escolheu (vale para todo mundo, 09/11/2026). Quem nunca
  // escolheu: quem procura trabalho abre em Vagas; quem quer contratar um serviço (a resposta "O que você quer
  // fazer"), em Serviços; o resto (quem contrata, quem presta serviço, quem visita), em Tudo
  // a aba Posts não vira a de abertura (ainda tem poucos posts): quem tocou nela por último abre pela regra de sempre
  const abaGuardada = prefs.aba === "recado" ? null : prefs.aba;
  const semEscolha = !lidos.tipo && !lidos.tudo && primeiro(sp.tipo) !== "recado" && !abaGuardada;
  const abaDoUso = usuario && semEscolha ? await perfilDeUso() : null;
  const aba: AbaDaLinha =
    primeiro(sp.tipo) === "recado"
      ? "recado"
      : (lidos.tipo ??
        (lidos.tudo
          ? "tudo"
          : (abaGuardada ??
            (abaDoUso === "trabalho"
              ? "vaga"
              : (await obterIntencao().catch(() => null)) === "contratar_servico"
                ? "servico"
                : "tudo"))));
  const filtrosDaBusca: Filtros = {
    ...lidos,
    tipo: aba === "vaga" || aba === "servico" ? aba : null,
    tudo: aba === "tudo" || aba === "recado",
    // "Relevantes para você" (o padrão) ou "Recentes" (do mais novo para o mais antigo, com as vagas
    // curtidas na hora da última curtida): a da URL; sem ela, a última que a pessoa escolheu (o cookie,
    // que o botão da ordem guarda). As outras ordens abrem a lista.
    ordem: ordemDaLinha(primeiro(sp.ordem), (await cookies()).get(COOKIE_ORDEM_DA_LINHA)?.value),
    regime: aba === "servico" ? null : lidos.regime,
    turno: aba === "vaga" ? lidos.turno : null,
    ja: aba === "vaga" ? lidos.ja : false,
  };
  const filtros = partirDoLocal(filtrosDaBusca, local, visita.praca.cidade);
  const relevantes = filtrosDaBusca.ordem === "relevantes";
  const usuarioId = usuario?.id ?? null;

  // na aba Recados, só os recados na linha; os anúncios de perto vão para o mapa do lado e para a
  // conta das novidades mais abaixo (uma busca só, já começada aqui)
  const deTudo =
    aba === "recado"
      ? buscarAnuncios(
          { ...filtros, tipo: null, tudo: true, regime: null, turno: null },
          agora,
          local,
          usuarioId,
        ).catch(() => [])
      : null;
  // o raio esconde os anúncios mais longe sem a pessoa perceber (de Goiânia, Anápolis fica a mais de 50 km): a
  // mesma busca até o maior raio diz quantos ficaram de fora e de onde (03/11/2026)
  const maiorRaio = RAIOS[RAIOS.length - 1];
  const ateOMaior =
    aba !== "recado" && !filtros.tempo && filtros.raio < maiorRaio
      ? buscarAnuncios({ ...filtros, raio: maiorRaio, ordem: "perto" }, agora, local, usuarioId).catch(() => [])
      : Promise.resolve([] as AnuncioResumo[]);
  const [encontrados, quem, matchesDaConta, recados, perfil, conquistas, conquistasPendentesDaConta] = await Promise.all([
    aba === "recado"
      ? Promise.resolve([])
      : relevantes
        ? anunciosParaRelevantes(filtros, agora, local, usuarioId)
        : buscarAnuncios(filtros, agora, local, usuarioId),
    usuario && (aba === "tudo" || aba === "vaga") ? quemProcura() : Promise.resolve(null),
    usuario ? listarMatches().catch(() => []) : Promise.resolve([]),
    usuario ? recadosDaLinha(filtros) : Promise.resolve([]),
    usuario ? obterMeuPerfil().catch(() => null) : Promise.resolve(null),
    usuario && (aba === "tudo" || aba === "recado") ? conquistasDaLinha(filtros) : Promise.resolve([] as Conquista[]),
    usuario ? conquistasPendentes() : Promise.resolve([] as ConquistaPendente[]),
  ]);
  const marca = marcaDaVisita(prefs.vistaEm, prefs.marcaEm, agora);
  const visitaNova = prefs.vistaEm !== null && agora - new Date(prefs.vistaEm).getTime() > SESSAO_DA_HOME;
  const [requisitos, sinais] = await Promise.all([
    requisitosDaLista(encontrados).catch(() => null),
    relevantes && usuario
      ? sinaisDaPessoa(
          perfil,
          encontrados.map((a) => a.id),
        ).catch(() => SEM_SINAIS)
      : Promise.resolve(SEM_SINAIS),
  ]);
  const turno = filtros.turno;
  // "Começa já" também é filtrado aqui (a busca do banco não sabe dele)
  const ja = filtros.ja;
  const filtrados =
    (turno || ja) && requisitos
      ? encontrados.filter((a) => {
          const v = requisitos.get(a.id);
          return (
            a.tipo === "vaga" && v !== undefined && (!turno || vagaNoTurno(v, turno)) && (!ja || Boolean(v.comeca_ja))
          );
        })
      : encontrados;
  // o % de match de todas (nas relevantes, ele entra na ordem antes de cortar a lista)
  const matches =
    usuarioId && quem && requisitos ? matchDasVagas(filtrados, requisitos, quem, usuarioId, agora) : new Map();
  // nas relevantes, as curtidas recentes entram na ordem ("em alta"): contadas antes de cortar a lista
  const curtidasDaOrdem =
    relevantes && (aba === "tudo" || aba === "vaga")
      ? await curtidasDasVagas(filtrados.filter((a) => a.tipo === "vaga").map((a) => a.id)).catch(
          () => new Map<string, CurtidasDaVaga>(),
        )
      : null;
  // e quem responde as curtidas sobe (o mesmo número do selo de quem responde rápido)
  const respostaDaOrdem = curtidasDaOrdem
    ? await respostaDeQuemPublica(
        filtrados.filter((a) => a.tipo === "vaga" && a.autor_id !== usuarioId).map((a) => a.autor_id),
      ).catch(() => new Map<string, Resposta>())
    : null;
  const naOrdem = relevantes
    ? ordenarDaPessoa(filtrados, requisitos, sinais, matches, agora, curtidasDaOrdem, respostaDaOrdem)
    : filtrados;
  const anuncios = naOrdem.slice(0, LIMITE);
  const deOutros = anuncios.filter((a) => a.tipo === "vaga" && a.autor_id !== usuarioId);
  const [resposta, salvas, logos, textosDosServicos, comentarios] = await Promise.all([
    respostaDaOrdem
      ? Promise.resolve(respostaDaOrdem)
      : respostaDeQuemPublica(deOutros.map((a) => a.autor_id)).catch(() => new Map<string, Resposta>()),
    usuarioId ? vagasSalvasEntre(deOutros.map((a) => a.id)).catch(() => null) : Promise.resolve(null),
    fotosDosAutores(anuncios.map((a) => a.autor_id)),
    descricoesDosServicos(anuncios.filter((a) => a.tipo === "servico").map((a) => a.id)),
    comentariosDasVagas(anuncios.filter((a) => a.tipo === "vaga").map((a) => a.id)).catch(
      () => new Map<string, ResumoComentarios>(),
    ),
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
        comentarios: comentarios.get(a.id) ?? SEM_COMENTARIOS,
      },
    },
  }));
  // as vagas que as pessoas curtiram: o número de curtidas e de matches no cartão. A vaga não muda de
  // lugar em Recentes (vale a publicação); nas relevantes, as curtidas recentes já entraram na ordem
  if (aba === "tudo" || aba === "vaga") {
    const curtidas =
      curtidasDaOrdem ??
      (await curtidasDasVagas(anuncios.filter((a) => a.tipo === "vaga").map((a) => a.id)).catch(
        () => new Map<string, CurtidasDaVaga>(),
      ));
    for (const i of itens) {
      const c = curtidas.get(i.id);
      if (i.tipo !== "vaga" || !c || !c.total || !("anuncio" in i.dados)) continue;
      i.dados.anuncio.curtidas = { total: c.total, matches: c.matches, ultima: c.ultima };
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
  // os aceites: nas relevantes, em cima de tudo (ninguém é mais relevante do que quem aceitou você); nas
  // recentes, na hora. Recados e notícias ficam só nas recentes (não têm como medir para a pessoa)
  if (aba === "tudo") {
    if (relevantes) itens.unshift(...aceites);
    else itens.push(...aceites);
  }
  // as respostas de quem publicou aos comentários (uma por vaga do feed, dos últimos 7 dias): só em Tudo; nas
  // recentes, na hora; nas relevantes, a mais nova entra depois do 4º item
  if (aba === "tudo") {
    const respostas = await respostasDasVagas(anuncios.filter((a) => a.tipo === "vaga").map((a) => a.id)).catch(
      () => [] as RespostaNoFeed[],
    );
    const itensDeResposta: ItemDaLinha<DadoDaLinha>[] = respostas.map((r) => ({
      tipo: "resposta",
      id: `resposta-${r.anuncio_id}`,
      quando: r.quando,
      dados: { resposta: r },
    }));
    if (!relevantes) itens.push(...itensDeResposta);
    else if (itensDeResposta.length) {
      const maisNova = [...itensDeResposta].sort((a, b) => b.quando.localeCompare(a.quando))[0];
      itens.splice(Math.min(4, itens.length), 0, maisNova);
    }
  }
  // os recados no ar (e os da pessoa em revisão): em Tudo e em Recados
  const itensDeRecado: ItemDaLinha<DadoDaLinha>[] = recados.map((r) => ({
    tipo: "recado",
    id: r.id,
    quando: r.quando,
    dados: { recado: r },
  }));
  if (aba === "recado" || (aba === "tudo" && !relevantes)) itens.push(...itensDeRecado);
  // as conquistas (quem começou a trabalhar pelo Publike): em Posts e nas recentes de Tudo, na hora; nas relevantes,
  // as 2 mais novas da semana entram logo depois dos 2 primeiros itens (são poucas, e é o que dá vontade de curtir)
  const itensDeConquista: ItemDaLinha<DadoDaLinha>[] = conquistas.map((c) => ({
    tipo: "conquista",
    id: `${c.anuncio_id}:${c.perfil_id}`,
    quando: c.quando,
    dados: { conquista: c },
  }));
  if (aba === "recado" || (aba === "tudo" && !relevantes)) itens.push(...itensDeConquista);
  else if (aba === "tudo") {
    const daSemana = itensDeConquista.filter((i) => agora - Date.parse(i.quando) <= 7 * 24 * 3600 * 1000).slice(0, 2);
    itens.splice(Math.min(2, itens.length), 0, ...daSemana);
  }
  // as notícias do Publike não entram na linha (ficam em /noticias, no menu da conta)
  // os da própria pessoa não contam como novidade
  const recadosDeOutros = [
    ...itensDeRecado.filter((i) => "recado" in i.dados && !i.dados.recado.meu),
    ...itensDeConquista.filter((i) => "conquista" in i.dados && !i.dados.conquista.minha),
  ];

  // os números das abas contam tudo junto: fora de Tudo, uma busca a mais (só com marca)
  let novas = novidades(
    aba === "tudo" ? [...itens.filter((i) => i.tipo !== "recado" && i.tipo !== "conquista"), ...recadosDeOutros] : itens,
    marca,
  );
  if (aba !== "tudo" && marca !== null) {
    const todos =
      (await deTudo) ??
      (await buscarAnuncios(
        { ...filtros, tipo: null, tudo: true, regime: null, turno: null },
        agora,
        local,
        usuarioId,
      ).catch(() => []));
    // as vagas que subiram contam pela hora da última curtida, como na linha
    novas = novidades(
      [
        ...todos.map(
          (a) =>
            ({
              tipo: a.tipo === "servico" ? "servico" : "vaga",
              id: a.id,
              quando: a.criado_em,
              dados: null,
            }) as const,
        ),
        ...aceites,
        ...recadosDeOutros,
      ],
      marca,
    );
  }
  // os de fora do raio (com o turno, só vagas): quantos, por faixa de distância, e as cidades mais perto
  const dentro = new Set(encontrados.map((a) => a.id));
  const deLonge = (await ateOMaior).filter(
    (a) => !dentro.has(a.id) && (a.distancia_km ?? 0) > filtros.raio && (!filtros.turno || a.tipo === "vaga"),
  );
  const faixas = RAIOS.filter((r) => r > filtros.raio)
    .map((r) => ({ raio: r, quantos: deLonge.filter((a) => (a.distancia_km ?? 0) <= r).length }))
    .filter((f, i, todas) => f.quantos > 0 && (i === 0 || f.quantos > todas[i - 1].quantos));
  const maisLonge: MaisLonge | null = deLonge.length
    ? {
        total: deLonge.length,
        cidades: [...new Set(deLonge.map((a) => a.cidade).filter(Boolean))].slice(0, 3),
        faixas,
      }
    : null;
  return {
    agora,
    local,
    usuarioId,
    aba,
    filtros,
    relevantes,
    porQue: relevantes ? porQueDaOrdem(sinais, Boolean(quem)) : null,
    filtrosDaBusca,
    tempoDe: origemDoTempo(filtros, local),
    itens,
    doMapa: deTudo ? (await deTudo).slice(0, LIMITE) : null,
    marca,
    visitaNova,
    novas,
    autorTipo: perfil?.tipo ?? null,
    conquistasPendentes: conquistasPendentesDaConta,
    meuNome: perfil?.nome ?? null,
    origemDoRaio: textoDaOrigem(filtros, local, visita.praca.cidade),
    maisLonge,
  };
});

/** A ordem da linha: a da URL ("relevantes" ou "ultimas"); sem ela, a guardada; sem nada, as relevantes. */
function ordemDaLinha(daUrl: string | undefined, guardada: string | undefined): "relevantes" | "ultimas" {
  if (daUrl === "relevantes" || daUrl === "ultimas") return daUrl;
  return guardada === "ultimas" ? "ultimas" : "relevantes";
}

/**
 * Os anúncios para a ordem da pessoa: os mais novos, os mais perto e os mais curtidos (três buscas, sem
 * repetir), para a conta dela escolher entre eles.
 */
async function anunciosParaRelevantes(
  filtros: Filtros,
  agora: number,
  local: Local | null,
  usuarioId: string | null,
): Promise<AnuncioResumo[]> {
  const [novos, perto, emAlta] = await Promise.all([
    buscarAnuncios({ ...filtros, ordem: "ultimas" }, agora, local, usuarioId),
    buscarAnuncios({ ...filtros, ordem: "perto" }, agora, local, usuarioId).catch(() => []),
    // as mais curtidas e abertas dos últimos 30 dias: a curtida recente conta na ordem da pessoa
    buscarAnuncios({ ...filtros, ordem: "relevantes" }, agora, local, usuarioId).catch(() => []),
  ]);
  const vistos = new Set<string>();
  return [...novos, ...perto, ...emAlta].filter((a) => !vistos.has(a.id) && Boolean(vistos.add(a.id)));
}

/**
 * O que a linha sabe da pessoa para a ordem dela: o que ela faz e procura (como no Descobrir), quem e onde
 * ela segue, as buscas com aviso, as categorias do que já curtiu e as vagas salvas entre `ids`.
 */
async function sinaisDaPessoa(perfil: MeuPerfil | null, ids: string[]): Promise<SinaisDaPessoa> {
  const [curriculo, procuro, seguidos, buscas, curtidas, salvas] = await Promise.all([
    obterMeuCurriculo().catch(() => null),
    obterProcuro().catch(() => null),
    meusSeguidos().catch(() => []),
    minhasBuscasSalvas().catch(() => []),
    listarMinhasCurtidas().catch(() => []),
    vagasSalvasEntre(ids).catch(() => new Set<string>()),
  ]);
  const empresa = Boolean(perfil && perfil.tipo !== "pessoa");
  return {
    empresa,
    eu: perfil?.id ?? null,
    quem: empresa
      ? null
      : {
          servicos: [
            ...(perfil?.servicos ?? []),
            ...(curriculo?.titulo ? [curriculo.titulo] : []),
            ...(curriculo?.habilidades ?? []),
          ],
          cargos: curriculo?.experiencias.map((e) => e.cargo) ?? [],
          cursos: curriculo?.cursos ?? [],
          curso: curriculo?.curso ?? null,
          escolaridade: curriculo?.escolaridade ?? null,
          cnh: curriculo?.cnh ?? null,
          disponibilidade: curriculo?.disponibilidade ?? [],
          procuro,
          temCurriculo: Boolean(curriculo),
        },
    autores: new Set(seguidos.map((x) => x.alvo_perfil).filter((x): x is string => Boolean(x))),
    bairros: new Set(seguidos.map((x) => x.bairro_chave).filter((x): x is string => Boolean(x))),
    buscas: buscas.map((b) => ({ texto: b.texto ? semAcento(b.texto).trim() || null : null, categoria: b.categoria })),
    categorias: categoriasDasCurtidas(curtidas),
    salvas,
  };
}

/** Os anúncios na ordem da pessoa (a vaga leva a descrição, para a área de quem não tem currículo). */
function ordenarDaPessoa(
  anuncios: AnuncioResumo[],
  requisitos: Map<string, DetalhesDaVaga> | null,
  sinais: SinaisDaPessoa,
  matches: Map<string, Aderencia>,
  agora: number,
  curtidas: Map<string, CurtidasDaVaga> | null = null,
  resposta: Map<string, Resposta> | null = null,
): AnuncioResumo[] {
  const porId = new Map(anuncios.map((a) => [a.id, a]));
  const comDescricao = anuncios.map((a) => {
    const c = curtidas?.get(a.id);
    return {
      ...a,
      descricao: requisitos?.get(a.id)?.descricao ?? null,
      emAlta: c?.total ? { total: c.total, ultima: c.ultima } : null,
      resposta: resposta?.get(a.autor_id) ?? null,
    };
  });
  return ordenarPorRelevancia(comDescricao, sinais, matches, agora).map((a) => porId.get(a.id)!);
}

/** A chave do `dadosDaLinha` a partir dos parâmetros da página. */
export const chaveDaLinha = (sp: Parametros) =>
  JSON.stringify(Object.fromEntries(Object.entries(sp).sort(([a], [b]) => a.localeCompare(b))));

/** Os pontos do mapa da linha (os anúncios dela) e de onde contam as distâncias. */
export function mapaDaLinha(d: DadosDaLinha): { pontos: PontoMapa[]; origem: OrigemMapa } {
  const pontos: PontoMapa[] = [];
  for (const i of d.itens) {
    if (!("anuncio" in i.dados)) continue;
    const { anuncio: a, match } = i.dados.anuncio;
    pontos.push(pontoDoMapa(a, a.minha_curtida === "match" ? null : (match?.nota ?? null), d.tempoDe));
  }
  // na aba Recados: as vagas e os serviços de perto (a linha só tem recados)
  for (const a of d.doMapa ?? []) pontos.push(pontoDoMapa(a, null, d.tempoDe));
  const f = d.filtros;
  const origem: OrigemMapa =
    d.tempoDe === "casa"
      ? { lat: f.lat, lng: f.lng, rotulo: "Sua casa", tipo: "casa" }
      : d.tempoDe === "voce"
        ? { lat: f.lat, lng: f.lng, rotulo: "Você está aqui", tipo: "voce" }
        : null;
  return { pontos, origem };
}

/** Um anúncio no mapa da linha: a etiqueta (valor, distância e tempo) e o cartão. */
function pontoDoMapa(a: AnuncioResumo, match: number | null, tempoDe: DadosDaLinha["tempoDe"]): PontoMapa {
  const trajeto = tempoDe && a.tipo === "vaga" && a.distancia_km != null ? deslocamentoProvavel(a.distancia_km) : null;
  return {
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
    tempo: trajeto ? `${trajeto.texto} ${tempoDe === "casa" ? "da sua casa" : "de onde você está"}` : null,
    minutos: trajeto?.minutos ?? null,
    aPe: trajeto?.jeito === "pe",
    autor: `${a.autor_nome} · ${rotuloConta(a.autor_tipo)}`,
    match,
  };
}
