import "server-only";
import { cacheLife } from "next/cache";
import { after } from "next/server";
import { cache } from "react";
import type { CamposDaVaga } from "./aderencia";
import type { Resposta } from "./resposta";
import { MODO_DEMO } from "./config";
import { ETAPAS_CANDIDATO, etapaQueVale, VERSAO_TERMOS, type EtapaCandidato } from "./constantes";
import * as demo from "./demo";
import { iaConfigurada } from "./ia/openai";
import { raioDaBusca, type Filtros } from "./filtros";
import { chavesDaRegiao, type Local } from "./regioes";
import { fotosDosAutores } from "./servidor/fotos-autores";
import { criarClientePublico, criarClienteServidor } from "./supabase/servidor";
import { agoraDaRequisicao } from "./tempo";
import type {
  AnuncioCompleto,
  AnuncioDoPerfil,
  AnuncioResumo,
  AvaliacaoPublica,
  AvaliacaoRecebida,
  Curriculo,
  CurriculoDoInteressado,
  Experiencia,
  Interessado,
  ItemModeracao,
  Match,
  MeuAnuncio,
  MeuPerfil,
  MeuServico,
  MinhaAvaliacao,
  MinhaCurtida,
  Perfil,
  Usuario,
  VagaDescobrir,
} from "./tipos";
import { estudosDoBanco } from "./estudos";
import { UUID } from "./validacao";
import { perguntasDoBanco, respostasDoBanco, type Pergunta, type Respostas } from "./vaga-extra";

// Leituras do banco usadas pelas páginas (sempre no servidor).
// No modo demonstração, devolvem os dados de exemplo de demo.ts.

function falha(onde: string, erro: { message: string }): never {
  throw new Error(`Publike: falha ao ler ${onde}: ${erro.message}`);
}

/** Nome que veio da conta Google, Facebook ou LinkedIn, para sugerir no perfil. */
function nomeDaConta(meta: Record<string, unknown> | undefined): string | null {
  if (!meta) return null;
  const texto = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
  const nome =
    texto(meta.full_name) ||
    texto(meta.name) ||
    [texto(meta.given_name), texto(meta.family_name)].filter(Boolean).join(" ");
  return nome ? nome.slice(0, 80) : null;
}

/**
 * Quem está logado (ou null). Validado pelo Supabase a cada visita. Quem é da equipe de uma agência
 * e escolheu agir por ela tem no token a conta ("conta"): o `id` é o da agência (o banco faz o
 * mesmo, em conta_atual()). O papel vem do banco a cada visita: quem foi tirado da equipe volta na
 * hora para a própria conta, e quem mudou de papel já vê o novo.
 */
export const obterUsuario = cache(async (): Promise<Usuario | null> => {
  if (MODO_DEMO) return null;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  let conta =
    typeof claims.conta === "string" && UUID.test(claims.conta) && claims.conta !== claims.sub ? claims.conta : null;
  let papel: Usuario["papel"] = "dono";
  if (conta) {
    const { data: doBanco } = await supabase.rpc("papel_na_conta");
    if (doBanco === "admin" || doBanco === "recrutador") papel = doBanco;
    else conta = null;
  }
  return {
    id: conta ?? claims.sub,
    pessoaId: claims.sub,
    papel,
    email: typeof claims.email === "string" && claims.email ? claims.email : null,
    telefone: typeof claims.phone === "string" && claims.phone ? claims.phone : null,
    nome: nomeDaConta(claims.user_metadata as Record<string, unknown> | undefined),
  };
});

export const obterMeuPerfil = cache(async (): Promise<MeuPerfil | null> => {
  const usuario = await obterUsuario();
  if (!usuario) return null;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("perfis")
    .select(
      "id, nome, tipo, foto, cidade, bairro, sobre, servicos, verificado, criado_em, suspenso_ate, cnpj, contatos(whatsapp, email, receber_emails)",
    )
    .eq("id", usuario.id)
    .maybeSingle();
  if (error) falha("perfil", error);
  if (!data) return null;
  const { contatos, ...perfil } = data;
  return {
    ...perfil,
    whatsapp: contatos?.whatsapp ?? null,
    email: contatos?.email ?? null,
    receber_emails: contatos?.receber_emails ?? true,
  };
});

/** Perfil pronto para publicar e curtir: tem nome e um WhatsApp. */
export function perfilCompleto(perfil: MeuPerfil | null) {
  return Boolean(perfil && (perfil.whatsapp || perfil.email));
}

/**
 * A conta ainda não aceitou as regras e a política de privacidade desta versão
 * (conta criada pela equipe no admin). Sem a função no banco, segue sem pedir.
 */
export async function aceitePendente() {
  if (MODO_DEMO) return false;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("aceite_pendente", { p_versao: VERSAO_TERMOS });
  return !error && data === true;
}

export const ehModerador = cache(async () => {
  if (MODO_DEMO) return false;
  const usuario = await obterUsuario();
  if (!usuario) return false;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.rpc("eh_moderador");
  return data === true;
});

/** Quem a equipe liberou (e-mail @publike.org, em Admin › Moderadores) vê os números do Painel em /equipe. */
export const possoVerPainelNoSite = cache(async () => {
  if (MODO_DEMO) return false;
  const usuario = await obterUsuario();
  if (!usuario) return false;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("posso_ver_painel_no_site");
  return !error && data === true;
});

/** Botão "Melhorar texto": ligado no admin e com a chave da IA no servidor. */
export const ajudaDaIADisponivel = cache(async () => {
  if (MODO_DEMO || !iaConfigurada()) return false;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.rpc("config_publica");
  return Boolean(data?.[0]?.ia_melhorar_texto);
});

/**
 * A mesma conta de `ajudaDaIADisponivel`, sem sessão e guardada por 1 hora: para a
 * home, que não pode ler o banco a cada visita (a faixa "Tem a arte da vaga?").
 */
export async function iaLigadaNoSite(): Promise<boolean> {
  "use cache";
  // a página inteira vale pelo tempo mais curto guardado nela: "minutes" a regravava a cada minuto na Vercel
  cacheLife("hours");
  if (MODO_DEMO || !iaConfigurada()) return false;
  const { data } = await criarClientePublico().rpc("config_publica");
  return Boolean(data?.[0]?.ia_melhorar_texto);
}

/** Busca da página inicial. Com `local`, os anúncios do bairro, da região e da cidade vêm primeiro. */
/** Com o CEP de casa e medindo a partir de casa, a ordem é só pela distância. */
function porDistancia(f: Filtros, local: Local | null) {
  return Boolean(local?.ponto) && f.lat === local!.ponto!.lat && f.lng === local!.ponto!.lng;
}

export async function buscarAnuncios(
  f: Filtros,
  agora: number,
  local: Local | null = null,
  /** com `f.meus`: só os anúncios desta conta */
  autorId: string | null = null,
): Promise<AnuncioResumo[]> {
  if (f.meus && !autorId) return [];
  if (MODO_DEMO) {
    const lista = demo.buscarDemo(f, agora, local).filter((a) => !f.quem || a.autor_tipo === f.quem);
    return f.meus ? lista.filter((a) => a.autor_id === autorId) : lista;
  }
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("buscar_anuncios", {
    p_lat: f.lat,
    p_lng: f.lng,
    // "Só os meus": a região toda (o banco limita a 100 km e 200 anúncios), e o filtro vem depois
    p_raio_km: f.meus ? 100 : raioDaBusca(f),
    p_tipo: f.tipo,
    p_categoria: f.categoria,
    p_regime: f.regime,
    p_texto: f.q || null,
    // "combina" ordena depois, pelo % de match (aqui vem do mais perto)
    p_ordem: f.ordem === "recentes" || f.ordem === "relevantes" || f.ordem === "ultimas" ? f.ordem : "perto",
    // com turno ou quem publicou, o filtro vem depois: busca mais para sobrarem bastantes
    p_limite: f.meus || f.turno || f.quem ? 200 : 120,
    p_cidade: local?.cidade ?? null,
    p_bairro: local?.bairro || null,
    p_bairros_regiao: local?.regiao ? chavesDaRegiao(local.regiao) : null,
    p_regiao: local?.regiao ?? null,
    // com o CEP de casa (e medindo de casa), vale só a distância
    p_por_distancia: porDistancia(f, local),
  });
  if (error) falha("anúncios", error);
  // quem publicou (empresa, comércio, agência ou pessoa): pelo tipo da conta de cada anúncio
  const lista = f.quem ? (data ?? []).filter((a) => a.autor_tipo === f.quem) : (data ?? []);
  return f.meus ? lista.filter((a) => a.autor_id === autorId) : lista;
}

export const obterAnuncio = cache(async (id: string): Promise<AnuncioCompleto | null> => {
  if (MODO_DEMO) return demo.obterAnuncioDemo(id, await agoraDaRequisicao());
  if (!UUID.test(id)) return null;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("obter_anuncio", { p_id: id }).maybeSingle();
  if (error) falha("anúncio", error);
  return data ?? null;
});

// em cache: o menu do painel e a página leem na mesma requisição
export const listarMeusAnuncios = cache(async (): Promise<MeuAnuncio[]> => {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("meus_anuncios");
  if (error) falha("seus anúncios", error);
  return data ?? [];
});

/** Se quem está logado tem anúncio no ar (para mostrar o filtro "Só os meus" só a quem publica). */
export async function temAnuncioNoAr(usuarioId: string): Promise<boolean> {
  const supabase = await criarClienteServidor();
  const { count, error } = await supabase
    .from("anuncios")
    .select("id", { count: "exact", head: true })
    .eq("autor_id", usuarioId)
    .eq("status", "ativo");
  return !error && (count ?? 0) > 0;
}

/** Os serviços de quem está logado, para o cadastro "Meus serviços". */
export async function listarMeusServicos(): Promise<MeuServico[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("meus_servicos");
  if (error) falha("seus serviços", error);
  return data ?? [];
}

/**
 * As curtidas aceitas que esperam o currículo (vaga que pede currículo, pessoa que
 * ainda não mandou), por "anúncio:perfil", com a hora do aceite. O banco só entrega
 * as minhas e as das minhas vagas. Sem a migração do aceite, nenhuma.
 */
const aceitasEsperandoCurriculo = cache(async (): Promise<Map<string, string>> => {
  if (MODO_DEMO) return new Map();
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("curtidas")
    .select("anuncio_id, perfil_id, aceita_em")
    .eq("status", "pendente")
    .not("aceita_em", "is", null);
  if (error) {
    console.error(`Publike: falha ao ler os aceites que esperam o currículo: ${error.message}`);
    return new Map();
  }
  return new Map(
    (data ?? []).flatMap((l) => (l.aceita_em ? [[`${l.anuncio_id}:${l.perfil_id}`, l.aceita_em] as const] : [])),
  );
});

/** Das vagas da lista, as que pedem currículo (de quem não publicou, só as que estão no ar aparecem). */
export async function vagasQuePedemCurriculo(anuncioIds: string[]): Promise<Set<string>> {
  const ids = anuncioIds.filter((id) => UUID.test(id));
  if (MODO_DEMO || !ids.length) return new Set();
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("anuncios").select("id").in("id", ids).eq("pede_curriculo", true);
  return new Set((data ?? []).map((a) => a.id));
}

/** Quem publicou esta vaga já me aceitou e falta só o meu currículo? */
export async function aceitoEsperandoMeuCurriculo(anuncioId: string): Promise<boolean> {
  if (MODO_DEMO || !UUID.test(anuncioId)) return false;
  const usuario = await obterUsuario();
  if (!usuario) return false;
  return (await aceitasEsperandoCurriculo()).has(`${anuncioId}:${usuario.id}`);
}

export async function listarInteressados(anuncioId: string): Promise<Interessado[]> {
  const supabase = await criarClienteServidor();
  const [{ data, error }, aceitas] = await Promise.all([
    supabase.rpc("interessados", { p_anuncio: anuncioId }),
    aceitasEsperandoCurriculo(),
  ]);
  if (error) falha("interessados", error);
  return (data ?? []).map((l) => ({ ...l, aceita_em: aceitas.get(`${anuncioId}:${l.perfil_id}`) ?? null }));
}

/** Etapa e anotação de cada interessado de uma vaga minha (só eu vejo). */
export async function listarEtapasDosCandidatos(
  anuncioId: string,
): Promise<Map<string, { etapa: EtapaCandidato; nota: string | null; atualizado_em: string }>> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("etapas_dos_candidatos", { p_anuncio: anuncioId });
  // sem a migração das etapas, a lista dos interessados continua funcionando (todos em "Novo")
  if (error) {
    console.error(`Publike: falha ao ler etapas dos candidatos: ${error.message}`);
    return new Map();
  }
  return new Map(
    (data ?? []).map((l) => [
      l.perfil_id,
      {
        etapa: (l.etapa in ETAPAS_CANDIDATO ? l.etapa : "novo") as EtapaCandidato,
        nota: l.nota,
        atualizado_em: l.atualizado_em,
      },
    ]),
  );
}

/**
 * As respostas dos candidatos às perguntas das vagas, por "anúncio:perfil".
 * O banco só entrega as curtidas das minhas vagas (e as minhas).
 */
export async function listarRespostasDosCandidatos(anuncioIds: string[]): Promise<Map<string, Respostas>> {
  const ids = anuncioIds.filter((id) => UUID.test(id));
  if (MODO_DEMO || !ids.length) return new Map();
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("curtidas").select("anuncio_id, perfil_id, respostas").in("anuncio_id", ids);
  if (error) {
    console.error(`Publike: falha ao ler as respostas dos candidatos: ${error.message}`);
    return new Map();
  }
  return new Map((data ?? []).map((l) => [`${l.anuncio_id}:${l.perfil_id}`, respostasDoBanco(l.respostas)]));
}

/** A minha entrevista (a mais recente) numa vaga que curti. */
export async function minhaEntrevista(anuncioId: string) {
  if (MODO_DEMO || !UUID.test(anuncioId)) return null;
  const usuario = await obterUsuario();
  if (!usuario) return null;
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("entrevistas")
    .select("id, quando, formato, local, obs, situacao, duracao_min, atualizado_em")
    .eq("anuncio_id", anuncioId)
    .eq("perfil_id", usuario.id)
    .order("atualizado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** As minhas entrevistas que ainda vão acontecer (página Hoje, modo Trabalhar). */
export async function minhasProximasEntrevistas(agora: number) {
  if (MODO_DEMO) return [];
  const usuario = await obterUsuario();
  if (!usuario) return [];
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("entrevistas")
    .select("id, anuncio_id, quando, formato, situacao")
    .eq("perfil_id", usuario.id)
    .in("situacao", ["marcada", "confirmada", "remarcar"])
    .gte("quando", new Date(agora - 2 * 3600e3).toISOString())
    .order("quando")
    .limit(10);
  if (error) console.error(`Publike: falha ao ler suas entrevistas: ${error.message}`);
  return data ?? [];
}

/** Talentos: quem deixou as empresas acharem o currículo, para uma vaga minha (sem contato). */
export async function talentosParaVaga(anuncioId: string) {
  if (MODO_DEMO || !UUID.test(anuncioId)) return [];
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("talentos_para_vaga", { p_anuncio: anuncioId });
  if (error) falha("talentos", error);
  return (data ?? []).map((t) => ({
    ...t,
    experiencias: lerExperiencias(t.experiencias),
    estudos: estudosDoBanco(t.estudos),
  }));
}

/** Se eu deixei as empresas acharem meu currículo (Talentos). */
export async function meuCurriculoVisivel(): Promise<boolean> {
  if (MODO_DEMO) return false;
  const usuario = await obterUsuario();
  if (!usuario) return false;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("curriculo_visivel").select("perfil_id").eq("perfil_id", usuario.id).maybeSingle();
  return Boolean(data);
}

/** Se quem está logado aparece na aba Talentos da busca (o resumo, aberto a quem visita). */
export async function meuCurriculoNaVitrine(): Promise<boolean> {
  if (MODO_DEMO) return false;
  const usuario = await obterUsuario();
  if (!usuario) return false;
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("curriculo_na_vitrine")
    .select("perfil_id")
    .eq("perfil_id", usuario.id)
    .maybeSingle();
  return Boolean(data);
}

/** Conta uma visita à vaga (quem publicou e robôs de busca não contam). Roda depois da resposta. */
export async function contarVisita(anuncioId: string, agente: string | null) {
  if (MODO_DEMO || !UUID.test(anuncioId)) return;
  if (!agente || /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|headless/i.test(agente)) return;
  const supabase = await criarClienteServidor();
  after(async () => {
    const { error } = await supabase.rpc("contar_visita", { p_anuncio: anuncioId });
    if (error) console.error(`Publike: falha ao contar a visita: ${error.message}`);
  });
}

/** As perguntas de cada vaga (planilha de todos os candidatos). */
export async function perguntasDasVagas(anuncioIds: string[]): Promise<Map<string, Pergunta[]>> {
  const ids = anuncioIds.filter((id) => UUID.test(id));
  if (MODO_DEMO || !ids.length) return new Map();
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("anuncios").select("id, perguntas").in("id", ids);
  return new Map((data ?? []).map((a) => [a.id, perguntasDoBanco(a.perguntas)]));
}

/** Todos os candidatos das minhas vagas, com a etapa (página "Candidatos" do painel). */
export async function listarMeusCandidatos() {
  const supabase = await criarClienteServidor();
  const [{ data, error }, aceitas] = await Promise.all([supabase.rpc("meus_candidatos"), aceitasEsperandoCurriculo()]);
  // sem a migração das etapas a página avisa, em vez de quebrar
  if (error) {
    console.error(`Publike: falha ao ler seus candidatos: ${error.message}`);
    return null;
  }
  return (data ?? []).map((l) => ({
    ...l,
    // esperando resposta, etapa adiante de "Em análise" não vale (ver etapaQueVale)
    etapa: etapaQueVale("vaga", l.status, (l.etapa in ETAPAS_CANDIDATO ? l.etapa : "novo") as EtapaCandidato),
    aceita_em: aceitas.get(`${l.anuncio_id}:${l.perfil_id}`) ?? null,
  }));
}

/** A etapa de cada coisa que eu curti (quem publicou marca; a anotação não vem). */
export async function listarMinhasEtapas(): Promise<Map<string, { etapa: EtapaCandidato; atualizado_em: string }>> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("minhas_etapas");
  if (error) {
    console.error(`Publike: falha ao ler suas etapas: ${error.message}`);
    return new Map();
  }
  return new Map(
    (data ?? [])
      .filter((l) => l.etapa in ETAPAS_CANDIDATO)
      .map((l) => [l.anuncio_id, { etapa: l.etapa as EtapaCandidato, atualizado_em: l.atualizado_em }]),
  );
}

export type MensagemConversa = {
  id: number;
  autor_id: string;
  texto: string;
  criado_em: string;
  lida_em: string | null;
  /** currículo anexado pelo chat (PDF no Storage, pasta de quem mandou) */
  anexo?: string | null;
  anexo_nome?: string | null;
};

/** Experiências vindas do banco (jsonb), já no formato das telas. */
export function lerExperiencias(valor: unknown): Experiencia[] {
  if (!Array.isArray(valor)) return [];
  const t = (v: unknown) => (typeof v === "string" ? v : "");
  return valor.map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return { cargo: t(o.cargo), onde: t(o.onde), inicio: t(o.inicio), fim: t(o.fim) || null, descricao: t(o.descricao) };
  });
}

/** O currículo de quem está logado (ou null se ainda não preencheu). */
export const obterMeuCurriculo = cache(async (): Promise<Curriculo | null> => {
  if (MODO_DEMO) return null;
  const usuario = await obterUsuario();
  if (!usuario) return null;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("curriculos")
    .select(
      "escolaridade, curso, experiencias, cursos, cnh, disponibilidade, arquivo, atualizado_em, titulo, habilidades, estudos",
    )
    .eq("perfil_id", usuario.id)
    .maybeSingle();
  if (error) falha("seu currículo", error);
  return data
    ? { ...data, experiencias: lerExperiencias(data.experiencias), estudos: estudosDoBanco(data.estudos) }
    : null;
});

/** O jeito de responder de cada um (só quem tem 5 curtidas ou mais nos últimos 180 dias). */
export async function respostaDeQuemPublica(autores: string[]): Promise<Map<string, Resposta>> {
  const ids = [...new Set(autores)].filter((id) => UUID.test(id)).slice(0, 100);
  if (MODO_DEMO || !ids.length) return new Map();
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("resposta_de_quem_publica", { p_autores: ids });
  if (error) falha("quanto cada um responde", error);
  return new Map(
    (data ?? []).map((r) => [r.autor_id, { taxa: Number(r.taxa), horas: r.horas === null ? null : Number(r.horas) }]),
  );
}

/** As buscas com aviso de quem está logado (no máximo 10). */
export async function minhasBuscasSalvas() {
  if (MODO_DEMO) return [];
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("buscas_salvas")
    .select("id, texto, categoria, regime, turno, lat, lng, raio_km, rotulo, caminho, criado_em")
    .order("criado_em", { ascending: false });
  if (error) falha("as suas buscas", error);
  return data ?? [];
}

/** O que cada vaga pede e o que mostra no cartão da busca (benefícios, quantas vagas, até quando fica no ar). */
export type DetalhesDaVaga = CamposDaVaga & {
  id: string;
  pede_curriculo: boolean;
  beneficios_lista: string[];
  vagas: number;
  expira_em: string;
  preenchida_em: string | null;
  /** comissão, bônus, gorjeta... (jsonb) */
  ganhos_extras: unknown;
  /** quem curte já vê o WhatsApp de quem publicou (a etiqueta "Contato direto" no cartão) */
  contato_direto?: boolean;
};

/** O que cada vaga pede (escolaridade, experiência, CNH, horário...), para o % de match e o cartão da busca. */
export async function requisitosDasVagas(ids: string[]): Promise<DetalhesDaVaga[]> {
  if (MODO_DEMO || !ids.length) return [];
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("anuncios")
    .select(
      "id, titulo, descricao, escolaridade_minima, experiencia, cnh, cidade, bairro, jornada, horario_detalhe, horario, pede_curriculo, beneficios_lista, vagas, expira_em, preenchida_em, ganhos_extras, contato_direto",
    )
    .in("id", ids);
  if (error) falha("o que as vagas pedem", error);
  return data ?? [];
}

/** Link temporário (1 hora) para abrir o PDF de um currículo. */
const VALIDADE_LINK_PDF = 60 * 60;

/** O PDF do próprio currículo, para conferir o que foi enviado. */
export async function linkDoMeuPdf(arquivo: string | null): Promise<string | null> {
  if (!arquivo || MODO_DEMO) return null;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.storage.from("curriculos").createSignedUrl(arquivo, VALIDADE_LINK_PDF);
  return data?.signedUrl ?? null;
}

/** Currículos de quem curtiu uma vaga minha (o banco confere se a vaga é minha). */
export async function listarCurriculosDosInteressados(anuncioId: string): Promise<Map<string, CurriculoDoInteressado>> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("curriculos_dos_interessados", { p_anuncio: anuncioId });
  if (error) falha("currículos", error);
  const linhas = data ?? [];
  const arquivos = linhas.map((l) => l.arquivo).filter((a): a is string => !!a);
  const links = new Map<string, string>();
  if (arquivos.length) {
    const { data: assinados } = await supabase.storage.from("curriculos").createSignedUrls(arquivos, VALIDADE_LINK_PDF);
    for (const a of assinados ?? []) if (a.path && a.signedUrl) links.set(a.path, a.signedUrl);
  }
  return new Map(
    linhas.map((l) => [
      l.perfil_id,
      {
        ...l,
        experiencias: lerExperiencias(l.experiencias),
        estudos: estudosDoBanco(l.estudos),
        link_pdf: l.arquivo ? (links.get(l.arquivo) ?? null) : null,
      },
    ]),
  );
}

/** Match desfeito: quem desfez (eu ou a outra pessoa) e o motivo. */
export type Desfeito = { porMim: boolean; motivo: string | null; em: string | null; futuro: boolean };

/** Para quem publicou: os matches desfeitos de um anúncio, por pessoa que curtiu. */
/** Bloqueios que me envolvem: quem eu bloqueei (`eu`) e quem me bloqueou (`ele`). */
export async function listarMeusBloqueios(): Promise<Map<string, { eu: boolean; ele: boolean }>> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("meus_bloqueios");
  if (error) {
    console.error(`Publike: falha ao ler bloqueios: ${error.message}`);
    return new Map();
  }
  return new Map((data ?? []).map((b) => [b.outro_id, { eu: b.eu_bloqueei, ele: b.me_bloqueou }]));
}

export async function listarDesfeitosDoAnuncio(anuncioId: string): Promise<Map<string, Desfeito>> {
  const usuario = await obterUsuario();
  if (!usuario || !UUID.test(anuncioId)) return new Map();
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("curtidas")
    .select("perfil_id, desfeito_por, desfeito_motivo, desfeito_em, desfeito_futuro")
    .eq("anuncio_id", anuncioId)
    .eq("status", "desfeito");
  if (error) falha("matches desfeitos", error);
  return new Map(
    (data ?? []).map((c) => [
      c.perfil_id,
      {
        porMim: c.desfeito_por === usuario.id,
        motivo: c.desfeito_motivo,
        em: c.desfeito_em,
        futuro: c.desfeito_futuro === true,
      },
    ]),
  );
}

/** Para quem curtiu: as curtidas que viraram match desfeito, por anúncio. */
export async function listarMeusDesfeitos(): Promise<Map<string, Desfeito>> {
  const usuario = await obterUsuario();
  if (!usuario) return new Map();
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("curtidas")
    .select("anuncio_id, desfeito_por, desfeito_motivo, desfeito_em, desfeito_futuro")
    .eq("perfil_id", usuario.id)
    .eq("status", "desfeito");
  if (error) falha("matches desfeitos", error);
  return new Map(
    (data ?? []).map((c) => [
      c.anuncio_id,
      {
        porMim: c.desfeito_por === usuario.id,
        motivo: c.desfeito_motivo,
        em: c.desfeito_em,
        futuro: c.desfeito_futuro === true,
      },
    ]),
  );
}

export async function listarMinhasCurtidas(): Promise<MinhaCurtida[]> {
  const supabase = await criarClienteServidor();
  const [{ data, error }, usuario, aceitas] = await Promise.all([
    supabase.rpc("minhas_curtidas"),
    obterUsuario(),
    aceitasEsperandoCurriculo(),
  ]);
  if (error) falha("suas curtidas", error);
  return (data ?? []).map((c) => ({
    ...c,
    aceita_em: usuario ? (aceitas.get(`${c.anuncio_id}:${usuario.id}`) ?? null) : null,
  }));
}

export async function listarMatches(): Promise<Match[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("meus_matches");
  if (error) falha("matches", error);
  return data ?? [];
}

export const obterPerfilPublico = cache(async (id: string): Promise<{ perfil: Perfil; anuncios: AnuncioDoPerfil[] } | null> => {
  const agora = await agoraDaRequisicao();
  if (MODO_DEMO) {
    const perfil = demo.perfilDemo(id, agora);
    return perfil ? { perfil, anuncios: demo.anunciosDoPerfilDemo(id, agora) } : null;
  }
  if (!UUID.test(id)) return null;
  const supabase = await criarClienteServidor();
  const [{ data: perfil, error }, { data: anuncios }] = await Promise.all([
    supabase
      .from("perfis")
      .select("id, nome, tipo, foto, cidade, bairro, sobre, servicos, verificado, criado_em, suspenso_ate, cnpj")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("anuncios")
      .select(
        "id, tipo, titulo, categoria, regime, pagamento_valor, pagamento_unidade, beneficios, cidade, bairro, criado_em, oficio, fotos, atende",
      )
      .eq("autor_id", id)
      .eq("status", "ativo")
      .gt("expira_em", new Date(agora).toISOString())
      .order("criado_em", { ascending: false })
      .limit(30),
  ]);
  if (error) falha("perfil", error);
  if (!perfil) return null;
  return {
    perfil,
    anuncios: (anuncios ?? []).map((a) => ({
      ...a,
      autor_id: perfil.id,
      autor_nome: perfil.nome,
      autor_tipo: perfil.tipo,
      autor_verificado: perfil.verificado,
      minha_curtida: null,
      distancia_km: null,
      foto: a.fotos[0] ?? null,
    })),
  };
});

/** Avaliações publicadas de um profissional (perfil e página do serviço). */
export const listarAvaliacoesPublicas = cache(async (profissionalId: string): Promise<AvaliacaoPublica[]> => {
  if (MODO_DEMO) return demo.avaliacoesDemo(profissionalId, await agoraDaRequisicao());
  if (!UUID.test(profissionalId)) return [];
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("avaliacoes_publicas", { p_profissional: profissionalId });
  if (error) falha("avaliações", error);
  return data ?? [];
});

/** Média e total das avaliações publicadas de um profissional. */
export const obterNotaDoProfissional = cache(
  async (profissionalId: string): Promise<{ media: number | null; total: number }> => {
    if (MODO_DEMO) return demo.notaDemo(profissionalId);
    if (!UUID.test(profissionalId)) return { media: null, total: 0 };
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("nota_do_profissional", { p_profissional: profissionalId }).maybeSingle();
    if (error) falha("nota do profissional", error);
    return { media: data?.media ?? null, total: data?.total ?? 0 };
  },
);

/** A avaliação que eu dei a um serviço (ou null). */
export async function obterMinhaAvaliacao(anuncioId: string): Promise<MinhaAvaliacao | null> {
  if (MODO_DEMO || !UUID.test(anuncioId)) return null;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("minha_avaliacao", { p_anuncio: anuncioId }).maybeSingle();
  if (error) falha("sua avaliação", error);
  return data ?? null;
}

/** As avaliações que o profissional logado recebeu (para responder). */
export async function listarAvaliacoesRecebidas(): Promise<AvaliacaoRecebida[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("minhas_avaliacoes_recebidas");
  if (error) falha("avaliações recebidas", error);
  return data ?? [];
}

export async function filaModeracao(): Promise<ItemModeracao[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("fila_moderacao");
  if (error) falha("fila de moderação", error);
  return data ?? [];
}

/** Contato de quem publicou, só quando a curtida virou match. */
export async function contatoDoMatch(anuncioId: string) {
  if (MODO_DEMO) return null;
  const curtidas = await listarMinhasCurtidas();
  const c = curtidas.find((x) => x.anuncio_id === anuncioId && x.status === "match");
  return c ? { whatsapp: c.autor_whatsapp, email: c.autor_email } : null;
}

// ---------------------------------------------------------------- Descobrir

/** Vagas no ar para o Descobrir, com as marcas de quem está logado (salva, passou, curtiu). */
export async function listarVagasParaDescobrir(): Promise<VagaDescobrir[]> {
  if (MODO_DEMO) return demo.vagasDescobrirDemo(await agoraDaRequisicao());
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("vagas_para_descobrir", { p_limite: 300 });
  if (error) falha("vagas do Descobrir", error);
  const vagas = data ?? [];
  if (!vagas.length) return vagas;
  // vaga preenchida não entra no Descobrir (na busca, ela aparece com a marcação)
  const ids = vagas.map((v) => v.id);
  const [{ data: extras }, logos] = await Promise.all([
    supabase.from("anuncios").select("id, preenchida_em, contato_direto").in("id", ids),
    // o logo de quem publicou, no alto do cartão
    fotosDosAutores(vagas.map((v) => v.autor_id)),
  ]);
  const fora = new Set((extras ?? []).filter((e) => e.preenchida_em).map((e) => e.id));
  const diretas = new Set((extras ?? []).filter((e) => e.contato_direto).map((e) => e.id));
  return vagas
    .filter((v) => !fora.has(v.id))
    .map((v) => ({ ...v, autor_foto: logos[v.autor_id] ?? null, contato_direto: diretas.has(v.id) }));
}

/** "O que você procura?" de quem está logado. */
export async function obterProcuro(): Promise<string | null> {
  if (MODO_DEMO) return null;
  const usuario = await obterUsuario();
  if (!usuario) return null;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("preferencias").select("procuro").eq("perfil_id", usuario.id).maybeSingle();
  return data?.procuro ?? null;
}

/**
 * Quantas vagas no ar a pessoa salvou (as mesmas da aba "Salvas" do Descobrir).
 * null se não deu para contar.
 */
export async function contarMinhasSalvas(): Promise<number | null> {
  if (MODO_DEMO) return 0;
  const usuario = await obterUsuario();
  if (!usuario) return 0;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("salvas")
    .select("anuncio_id")
    .eq("perfil_id", usuario.id)
    .order("criado_em", { ascending: false })
    .limit(150);
  if (error) {
    console.error(`Publike: falha ao contar as vagas salvas: ${error.message}`);
    return null;
  }
  const ids = (data ?? []).map((s) => s.anuncio_id);
  if (ids.length === 0) return 0;
  // só as que ainda estão no ar
  const agora = await agoraDaRequisicao();
  const { count, error: erroNoAr } = await supabase
    .from("anuncios")
    .select("id", { count: "exact", head: true })
    .in("id", ids)
    .eq("tipo", "vaga")
    .eq("status", "ativo")
    .gt("expira_em", new Date(agora).toISOString());
  if (erroNoAr) {
    console.error(`Publike: falha ao contar as vagas salvas: ${erroNoAr.message}`);
    return null;
  }
  return count ?? 0;
}

/** O CEP de casa de quem está logado (ponto arredondado, ~300 m). */
export const obterMinhaCasa = cache(async () => {
  if (MODO_DEMO) return null;
  const usuario = await obterUsuario();
  if (!usuario) return null;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.rpc("minha_casa").maybeSingle();
  return data ?? null;
});

/** O último endereço que a pessoa pôs numa vaga, para a próxima já vir preenchida. */
export async function obterMeuUltimoEndereco() {
  if (MODO_DEMO) return null;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.rpc("meu_ultimo_endereco").maybeSingle();
  return data ?? null;
}

/** Quais destas vagas quem está logado salvou (para a estrela dos cartões da busca). */
export async function vagasSalvasEntre(ids: string[]): Promise<Set<string>> {
  const validos = ids.filter((id) => UUID.test(id)).slice(0, 200);
  if (MODO_DEMO || !validos.length) return new Set();
  const usuario = await obterUsuario();
  if (!usuario) return new Set();
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("salvas")
    .select("anuncio_id")
    .eq("perfil_id", usuario.id)
    .in("anuncio_id", validos);
  if (error) falha("as vagas salvas", error);
  return new Set((data ?? []).map((s) => s.anuncio_id));
}

/** Esta vaga está salva por quem está logado? */
export async function vagaSalva(anuncioId: string): Promise<boolean> {
  if (MODO_DEMO || !UUID.test(anuncioId)) return false;
  const usuario = await obterUsuario();
  if (!usuario) return false;
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("salvas")
    .select("anuncio_id")
    .eq("perfil_id", usuario.id)
    .eq("anuncio_id", anuncioId)
    .maybeSingle();
  return Boolean(data);
}
