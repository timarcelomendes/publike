import "server-only";
import type { ClienteBanco } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/tipos-banco";
import { pdfNaoSalvoDe } from "@/lib/servidor/curriculo-pendente";
import { agoraDaRequisicao } from "@/lib/tempo";

// Leituras das páginas do admin e da moderação. O cliente vem de
// exigirAdminLocal() (chave secreta, só no computador do dono) ou de
// acessoDaEquipe() (moderador logado). O banco confere quem pode o quê.

type Funcoes = Database["public"]["Functions"];
type Linha<F extends keyof Funcoes> = Funcoes[F]["Returns"] extends (infer L)[] ? L : never;

export type UsuarioAdmin = Linha<"admin_listar_usuarios">;
export type AnuncioAdmin = Linha<"admin_listar_anuncios">;
export type ItemFila = Linha<"fila_moderacao">;
export type ModeloEmailAdmin = Linha<"admin_modelos_email">;
export type EmailDaFila = Linha<"admin_fila_emails">;
export type DecisaoIA = Linha<"admin_decisoes_ia">;
export type ItemRegistro = Linha<"admin_registro">;
export type Moderador = Linha<"admin_listar_moderadores">;
export type ChaveServidor = Linha<"admin_listar_chaves_servidor">;
export type OrigemContas = Linha<"admin_origens">;
export type ConfigSite = Database["public"]["Tables"]["config_site"]["Row"];
export type ResumoIA = Linha<"admin_ultimo_resumo">;

export type NumerosPainel = {
  contas: number;
  contas_7d: number;
  contas_30d: number;
  acessos_7d: number;
  sem_perfil: number;
  perfis: {
    total: number;
    pessoa: number;
    comercio: number;
    empresa: number;
    agencia: number;
    /** agências com o CNPJ ainda não conferido pela equipe */
    agencias_a_verificar: number;
    verificados: number;
  };
  anuncios: {
    total: number;
    no_ar: number;
    vagas_no_ar: number;
    servicos_no_ar: number;
    pausados: number;
    expirados: number;
    encerrados: number;
    em_analise: number;
    removidos: number;
    novos_7d: number;
  };
  curtidas: { total: number; novas_7d: number; matches: number; matches_7d: number };
  denuncias_abertas: number;
  denuncias_7d: number;
  suspensos: number;
  banidos: number;
  ia: { revisados_7d: number; retidos_7d: number; na_fila: number };
  emails: { enviados_7d: number; falhas_7d: number; na_fila: number };
  por_dia: { dia: string; contas: number; anuncios: number; curtidas: number }[];
  categorias: { nome: string; n: number }[];
  bairros: { nome: string; n: number }[];
};

export type Suspensao = {
  id: number;
  tipo: "suspensao" | "banimento";
  dias: number | null;
  motivo: string;
  inicio: string;
  fim: string;
  encerrada_em?: string | null;
  aplicada_por?: string | null;
  encerrada_por?: string | null;
};

export type FichaUsuario = {
  id: string;
  email: string | null;
  telefone: string | null;
  provedor: string;
  provedores: string[];
  criado_em: string;
  ultimo_acesso: string | null;
  login_bloqueado_ate: string | null;
  perfil: {
    nome: string;
    tipo: string;
    foto: string | null;
    cidade: string;
    bairro: string | null;
    sobre: string | null;
    servicos: string[];
    verificado: boolean;
    criado_em: string;
    /** só agências */
    cnpj: string | null;
  } | null;
  contato: { whatsapp: string | null; email: string | null; receber_emails: boolean };
  moderador: boolean;
  suspensao: Suspensao | null;
  historico: Suspensao[];
  numeros: {
    anuncios: number;
    no_ar: number;
    curtidas_feitas: number;
    curtidas_recebidas: number;
    matches: number;
    denuncias_recebidas: number;
    denuncias_procedentes: number;
    denuncias_feitas: number;
  };
};

export type FichaAnuncio = {
  id: string;
  status: string;
  nota_moderacao: string | null;
  autor: {
    id: string;
    nome: string;
    tipo: string;
    foto: string | null;
    verificado: boolean;
    suspenso_ate: string | null;
    email: string | null;
    anuncios: number;
    removidos: number;
  };
  curtidas: number;
  matches: number;
  denuncias: { id: number; motivo: string; detalhes: string | null; status: string; criado_em: string; quem: string | null }[];
  ia: { decisao: string; categorias: string[]; explicacao: string | null; modelo: string | null; criado_em: string }[];
  registro: { acao: string; detalhes: Record<string, unknown>; criado_em: string; quem: string | null }[];
};

function falha(onde: string, erro: { message: string }): never {
  throw new Error(`Publike: falha ao ler ${onde}: ${erro.message}`);
}

export const POR_PAGINA = 30;

export async function numerosDoPainel(c: ClienteBanco) {
  const { data, error } = await c.rpc("admin_resumo");
  if (error) falha("os números do painel", error);
  return data as unknown as NumerosPainel;
}

/** O começo de hoje em Goiânia (o banco conta os dias nesse fuso), em ISO. */
export function inicioDeHoje(agora: number) {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(agora));
  // Goiânia não tem horário de verão desde 2019: sempre -03:00
  return new Date(`${dia}T00:00:00-03:00`).toISOString();
}

/** Os números de hoje dos cartões do painel: contas, anúncios publicados, curtidas e matches. */
export async function numerosDeHoje(c: ClienteBanco, n: NumerosPainel, agora: number) {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(agora));
  const deHoje = n.por_dia.find((d) => d.dia === dia) ?? { contas: 0, anuncios: 0, curtidas: 0 };
  const { count, error } = await c
    .from("curtidas")
    .select("anuncio_id", { count: "exact", head: true })
    .eq("status", "match")
    .gte("respondida_em", inicioDeHoje(agora));
  if (error) console.warn(`Publike: sem os matches de hoje: ${error.message}`);
  return { contas: deHoje.contas, anuncios: deHoje.anuncios, curtidas: deHoje.curtidas, matches: count ?? 0 };
}

/** Quantas pessoas abriram o site, por dia (o banco não guarda quem). */
export type AcessosSite = {
  hoje: number;
  com_conta_hoje: number;
  ontem: number;
  /** média por dia dos 7 dias antes de hoje */
  media_7d: number;
  /** o primeiro dia contado (null: nada ainda) */
  desde: string | null;
  por_dia: { dia: string; visitantes: number }[];
};

/** null: a contagem ainda não existe neste banco (falta rodar a migração 20261019250000). */
export async function acessosDoSite(c: ClienteBanco): Promise<AcessosSite | null> {
  const { data, error } = await c.rpc("admin_acessos_site");
  if (error) {
    console.warn(`Publike: sem a contagem de acessos: ${error.message}`);
    return null;
  }
  return data as unknown as AcessosSite;
}

export async function listarUsuarios(c: ClienteBanco, busca: string | null, filtro: string, pagina: number) {
  const { data, error } = await c.rpc("admin_listar_usuarios", {
    p_busca: busca,
    p_filtro: filtro,
    p_limite: POR_PAGINA,
    p_deslocamento: (pagina - 1) * POR_PAGINA,
  });
  if (error) falha("as contas", error);
  const itens = data ?? [];
  return { itens, total: Number(itens[0]?.total ?? 0), curriculos: await curriculoDasContas(c, itens) };
}

/**
 * O currículo de cada pessoa da página: "salvo", "pdf" (mandou o PDF e não salvou o currículo) ou
 * "nao". Contas que não são de pessoa ficam de fora (não têm currículo).
 */
export type SituacaoCurriculo = "salvo" | "pdf" | "nao";
async function curriculoDasContas(
  c: ClienteBanco,
  itens: { id: string; tipo: string | null }[],
): Promise<Record<string, SituacaoCurriculo>> {
  const pessoas = itens.filter((u) => u.tipo === "pessoa").map((u) => u.id);
  if (!pessoas.length) return {};
  const { data, error } = await c.from("curriculos").select("perfil_id").in("perfil_id", pessoas);
  if (error) {
    console.warn(`Publike: sem a situação dos currículos: ${error.message}`);
    return {};
  }
  const comCurriculo = new Set((data ?? []).map((l) => l.perfil_id));
  const situacao: Record<string, SituacaoCurriculo> = {};
  const agora = await agoraDaRequisicao();
  await Promise.all(
    pessoas.map(async (id) => {
      if (comCurriculo.has(id)) return void (situacao[id] = "salvo");
      // o PDF fica na pasta da pessoa assim que ela envia, antes de salvar (o do chat não conta)
      situacao[id] = (await pdfNaoSalvoDe(c, id, agora).catch(() => null)) ? "pdf" : "nao";
    }),
  );
  return situacao;
}

export async function fichaUsuario(c: ClienteBanco, id: string) {
  const { data, error } = await c.rpc("admin_usuario", { p_id: id });
  if (error) falha("a conta", error);
  return (data as unknown as FichaUsuario | null) ?? null;
}

export async function listarAnuncios(
  c: ClienteBanco,
  f: { busca: string | null; status: string; tipo: string | null; autor: string | null; pagina: number },
) {
  const { data, error } = await c.rpc("admin_listar_anuncios", {
    p_busca: f.busca,
    p_status: f.status,
    p_tipo: f.tipo,
    p_autor: f.autor,
    p_limite: POR_PAGINA,
    p_deslocamento: (f.pagina - 1) * POR_PAGINA,
  });
  if (error) falha("os anúncios", error);
  return { itens: data ?? [], total: Number(data?.[0]?.total ?? 0) };
}

export async function fichaAnuncio(c: ClienteBanco, id: string) {
  const { data, error } = await c.rpc("admin_anuncio", { p_id: id });
  if (error) falha("o anúncio", error);
  return (data as unknown as FichaAnuncio | null) ?? null;
}

/** Advertências da pessoa (textos de avaliação retidos ou removidos). */
export async function advertenciasDe(c: ClienteBanco, usuarioId: string) {
  const { data, error } = await c.rpc("admin_advertencias", { p_usuario: usuarioId });
  if (error) falha("as advertências", error);
  return data ?? [];
}

/** Matches que a pessoa desfez e que desfizeram com ela, com a justificativa. */
export async function matchesDesfeitosDe(c: ClienteBanco, usuarioId: string) {
  const { data, error } = await c.rpc("admin_matches_desfeitos", { p_perfil: usuarioId });
  if (error) falha("os matches desfeitos", error);
  return data ?? [];
}

/** Avaliações retidas pela IA, sem revisão ou denunciadas pelo profissional. */
export async function filaDeAvaliacoes(c: ClienteBanco) {
  const { data, error } = await c.rpc("fila_avaliacoes");
  if (error) falha("a fila de avaliações", error);
  return data ?? [];
}

/** Recados retidos, denunciados ou que a IA não revisou. Sem a migração dos recados, lista vazia. */
export async function filaDeRecados(c: ClienteBanco) {
  const { data, error } = await c.rpc("fila_recados");
  if (error) {
    if (error.code === "PGRST202") return [];
    falha("a fila de recados", error);
  }
  return data ?? [];
}

export async function filaDaModeracao(c: ClienteBanco) {
  const { data, error } = await c.rpc("fila_moderacao");
  if (error) falha("a fila da moderação", error);
  return data ?? [];
}

export async function configDoSite(c: ClienteBanco): Promise<ConfigSite> {
  const { data, error } = await c.rpc("admin_config");
  if (error) falha("as configurações", error);
  const linha = data?.[0];
  if (!linha) throw new Error("Publike: configuração do site não encontrada. Rode a migração do admin.");
  return linha;
}

export async function modelosDeEmail(c: ClienteBanco) {
  const { data, error } = await c.rpc("admin_modelos_email");
  if (error) falha("os textos dos e-mails", error);
  return data ?? [];
}

/** Convites por e-mail: quantas contas recebem agora e quantas já receberam (sem a migração, nada). */
export async function convitesPorEmail(c: ClienteBanco) {
  const { data, error } = await c.rpc("admin_convites_por_email");
  if (error) {
    console.error("Publike: não deu para ler os convites por e-mail:", error.message);
    return null;
  }
  return data ?? [];
}

/** Os convites no sino (contas sem e-mail). Antes da migração, null: a página mostra só o e-mail. */
export async function avisosDeConvite(c: ClienteBanco) {
  const { data, error } = await c.rpc("admin_avisos_de_convite");
  if (error) return null;
  return data ?? [];
}

export async function ultimosEmails(c: ClienteBanco, limite = 40) {
  const { data, error } = await c.rpc("admin_fila_emails", { p_limite: limite });
  if (error) falha("a fila de e-mails", error);
  return data ?? [];
}

/** Os últimos e-mails de uma conta (para ver se chegou ou falhou). */
export async function emailsDoUsuario(c: ClienteBanco, usuarioId: string, limite = 15) {
  const { data, error } = await c.rpc("admin_emails_do_usuario", { p_usuario: usuarioId, p_limite: limite });
  // antes da migração das boas-vindas a função não existe: a página segue sem a lista
  if (error) return null;
  return data ?? [];
}

export async function decisoesDaIA(c: ClienteBanco, limite = 40) {
  const { data, error } = await c.rpc("admin_decisoes_ia", { p_limite: limite });
  if (error) falha("as decisões da IA", error);
  return data ?? [];
}

export async function ultimoResumo(c: ClienteBanco) {
  const { data, error } = await c.rpc("admin_ultimo_resumo");
  if (error) falha("o resumo da IA", error);
  return data?.[0] ?? null;
}

export async function registroDaEquipe(c: ClienteBanco, limite = 30, alvo: string | null = null) {
  const { data, error } = await c.rpc("admin_registro", { p_limite: limite, p_alvo: alvo });
  if (error) falha("o registro da equipe", error);
  return data ?? [];
}

export async function listarModeradores(c: ClienteBanco) {
  const { data, error } = await c.rpc("admin_listar_moderadores");
  if (error) falha("os moderadores", error);
  return data ?? [];
}

export async function listarChavesServidor(c: ClienteBanco) {
  const { data, error } = await c.rpc("admin_listar_chaves_servidor");
  if (error) falha("as chaves do servidor", error);
  return data ?? [];
}

/** Contas novas por campanha (o utm do link do anúncio) e quantas publicaram; "direto" são as sem campanha. */
export async function origensDasContas(c: ClienteBanco, desde: string | null) {
  const { data, error } = await c.rpc("admin_origens", desde ? { p_desde: desde } : {});
  if (error) falha("as campanhas", error);
  return data ?? [];
}

/** Um match para o admin: quem curtiu, o anúncio, quem publicou e quando. */
export type MatchAdmin = {
  quando: string;
  curtiu: { id: string; nome: string; tipo: string; bairro: string | null } | null;
  anuncio: { id: string; titulo: string; tipo: string } | null;
  publicou: { id: string; nome: string; tipo: string } | null;
};

/** Os matches desde `desde` (null: todos), do mais novo para o mais antigo (até 300). */
export async function matchesRecentes(c: ClienteBanco, desde: string | null): Promise<MatchAdmin[]> {
  let q = c
    .from("curtidas")
    .select("anuncio_id, perfil_id, respondida_em, criado_em")
    .eq("status", "match")
    .order("respondida_em", { ascending: false, nullsFirst: false })
    .limit(300);
  if (desde) q = q.gte("respondida_em", desde);
  const { data, error } = await q;
  if (error) falha("os matches", error);
  const linhas = data ?? [];
  const idsAnuncios = [...new Set(linhas.map((l) => l.anuncio_id))];
  const { data: anuncios, error: e1 } = idsAnuncios.length
    ? await c.from("anuncios").select("id, titulo, tipo, autor_id").in("id", idsAnuncios)
    : { data: [], error: null };
  if (e1) falha("os anúncios dos matches", e1);
  const porAnuncio = new Map((anuncios ?? []).map((a) => [a.id, a]));
  const idsPerfis = [...new Set([...linhas.map((l) => l.perfil_id), ...(anuncios ?? []).map((a) => a.autor_id)])];
  const { data: perfis, error: e2 } = idsPerfis.length
    ? await c.from("perfis").select("id, nome, tipo, bairro").in("id", idsPerfis)
    : { data: [], error: null };
  if (e2) falha("as contas dos matches", e2);
  const porPerfil = new Map((perfis ?? []).map((p) => [p.id, p]));
  return linhas.map((l) => {
    const a = porAnuncio.get(l.anuncio_id) ?? null;
    const autor = a ? (porPerfil.get(a.autor_id) ?? null) : null;
    return {
      quando: l.respondida_em ?? l.criado_em,
      curtiu: porPerfil.get(l.perfil_id) ?? null,
      anuncio: a ? { id: a.id, titulo: a.titulo, tipo: a.tipo } : null,
      publicou: autor ? { id: autor.id, nome: autor.nome, tipo: autor.tipo } : null,
    };
  });
}
