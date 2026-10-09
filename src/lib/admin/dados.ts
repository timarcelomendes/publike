import "server-only";
import type { ClienteBanco } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/tipos-banco";

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
export type ConfigSite = Database["public"]["Tables"]["config_site"]["Row"];
export type ResumoIA = Linha<"admin_ultimo_resumo">;

export type NumerosPainel = {
  contas: number;
  contas_7d: number;
  contas_30d: number;
  acessos_7d: number;
  sem_perfil: number;
  perfis: { total: number; pessoa: number; comercio: number; empresa: number; verificados: number };
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

export async function listarUsuarios(c: ClienteBanco, busca: string | null, filtro: string, pagina: number) {
  const { data, error } = await c.rpc("admin_listar_usuarios", {
    p_busca: busca,
    p_filtro: filtro,
    p_limite: POR_PAGINA,
    p_deslocamento: (pagina - 1) * POR_PAGINA,
  });
  if (error) falha("as contas", error);
  return { itens: data ?? [], total: Number(data?.[0]?.total ?? 0) };
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

export async function ultimosEmails(c: ClienteBanco, limite = 40) {
  const { data, error } = await c.rpc("admin_fila_emails", { p_limite: limite });
  if (error) falha("a fila de e-mails", error);
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
