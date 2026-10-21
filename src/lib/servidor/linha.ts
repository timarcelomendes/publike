import "server-only";
import { cache } from "react";
import { vagaNoTurno, type Aderencia } from "@/lib/aderencia";
import {
  buscarAnuncios,
  listarMatches,
  obterUsuario,
  respostaDeQuemPublica,
  vagasSalvasEntre,
  type DetalhesDaVaga,
} from "@/lib/dados";
import { lerFiltros, type Filtros } from "@/lib/filtros";
import { ACEITE_NA_LINHA, marcaDaVisita, novidades, type ItemDaLinha } from "@/lib/linha-do-tempo";
import { obterLocal } from "@/lib/local";
import type { Local } from "@/lib/regioes";
import { partirDoLocal } from "@/lib/servidor/busca-salva";
import { fotosDosAutores } from "@/lib/servidor/fotos-autores";
import { matchDasVagas, origemDoTempo, quemProcura, requisitosDaLista } from "@/lib/servidor/lista-anuncios";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { obterIntencao } from "@/lib/servidor/intencao";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { AnuncioResumo, Match } from "@/lib/tipos";
import type { Resposta } from "@/lib/resposta";
import type { OrigemMapa, PontoMapa } from "@/components/mapa/mapa-anuncios";
import { deslocamentoCurto } from "@/lib/deslocamento";
import {
  formatarDistancia,
  formatarLugar,
  rotuloConta,
  rotuloModalidade,
  valorCurto,
  valorDoAnuncio,
} from "@/lib/formato";

/** As abas da linha (a de recados chega com os recados). */
export type AbaDaLinha = "tudo" | "vaga" | "servico";
export const ABAS_DA_LINHA: AbaDaLinha[] = ["tudo", "vaga", "servico"];

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
};

export type DadoDaLinha = { anuncio: AnuncioNaLinha } | { aceite: Match };

export type DadosDaLinha = {
  agora: number;
  local: Local | null;
  usuarioId: string | null;
  aba: AbaDaLinha;
  /** os filtros da busca (sem a ordem: a linha é sempre do mais novo para o mais antigo) */
  filtros: Filtros;
  /** os mesmos, antes de partir da casa (para a barra e os links) */
  filtrosDaBusca: Filtros;
  tempoDe: "casa" | "voce" | null;
  itens: ItemDaLinha<DadoDaLinha>[];
  marca: number | null;
  novas: { tudo: number; vaga: number; servico: number };
};

type Parametros = Record<string, string | string[] | undefined>;

/**
 * Tudo o que a linha do tempo da home mostra, numa leitura só por requisição (o topo, as abas, a
 * linha e o mapa usam o mesmo resultado). `chave` = os parâmetros da URL em JSON.
 */
export const dadosDaLinha = cache(async (chave: string): Promise<DadosDaLinha> => {
  const sp = JSON.parse(chave) as Parametros;
  const [agora, local, usuario, prefs] = await Promise.all([
    agoraDaRequisicao(),
    obterLocal(),
    obterUsuario(),
    preferenciasDaHome(),
  ]);
  const lidos = lerFiltros(sp);
  // a aba: a da URL; sem ela, a última escolhida; sem nada, a da resposta "O que você quer fazer"
  // (quem quer contratar um serviço abre em Serviços) ou Tudo
  const aba: AbaDaLinha =
    lidos.tipo ??
    (lidos.tudo
      ? "tudo"
      : (prefs.aba ?? ((await obterIntencao().catch(() => null)) === "contratar_servico" ? "servico" : "tudo")));
  const filtrosDaBusca: Filtros = {
    ...lidos,
    tipo: aba === "tudo" ? null : aba,
    tudo: aba === "tudo",
    ordem: "recentes",
    regime: aba === "servico" ? null : lidos.regime,
    turno: aba === "vaga" ? lidos.turno : null,
  };
  const filtros = partirDoLocal(filtrosDaBusca, local);
  const usuarioId = usuario?.id ?? null;

  const [encontrados, quem, matchesDaConta] = await Promise.all([
    buscarAnuncios(filtros, agora, local, usuarioId),
    usuario && aba !== "servico" ? quemProcura() : Promise.resolve(null),
    usuario ? listarMatches().catch(() => []) : Promise.resolve([]),
  ]);
  const marca = marcaDaVisita(prefs.vistaEm, prefs.marcaEm, agora);
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
  // os aceites de quem curtiu (o outro lado aceitou), dos últimos 7 dias, só em Tudo
  const aceites: ItemDaLinha<DadoDaLinha>[] = matchesDaConta
    .filter((m) => m.papel === "curti" && m.match_em && agora - Date.parse(m.match_em) <= ACEITE_NA_LINHA)
    .map((m) => ({ tipo: "aceite", id: m.anuncio_id, quando: m.match_em, dados: { aceite: m } }));
  if (aba === "tudo") itens.push(...aceites);

  // os números das abas contam vagas e serviços juntos: fora de Tudo, uma busca a mais (só com marca)
  let novas = novidades(itens, marca);
  if (aba !== "tudo" && marca !== null) {
    const todos = await buscarAnuncios(
      { ...filtros, tipo: null, tudo: true, regime: null, turno: null },
      agora,
      local,
      usuarioId,
    ).catch(() => []);
    novas = novidades(
      [
        ...todos.map(
          (a) =>
            ({ tipo: a.tipo === "servico" ? "servico" : "vaga", id: a.id, quando: a.criado_em, dados: null }) as const,
        ),
        ...aceites,
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
    filtrosDaBusca,
    tempoDe: origemDoTempo(filtros, local),
    itens,
    marca,
    novas,
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
