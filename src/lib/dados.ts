import "server-only";
import { cache } from "react";
import { MODO_DEMO } from "./config";
import * as demo from "./demo";
import { iaConfigurada } from "./ia/openai";
import type { Filtros } from "./filtros";
import { criarClienteServidor } from "./supabase/servidor";
import { agoraDaRequisicao } from "./tempo";
import type {
  AnuncioCompleto,
  AnuncioResumo,
  DadosCard,
  Interessado,
  ItemModeracao,
  Match,
  MeuAnuncio,
  MeuPerfil,
  MinhaCurtida,
  Perfil,
  Usuario,
} from "./tipos";
import { UUID } from "./validacao";

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

/** Quem está logado (ou null). Validado pelo Supabase a cada visita. */
export const obterUsuario = cache(async (): Promise<Usuario | null> => {
  if (MODO_DEMO) return null;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return {
    id: claims.sub,
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
      "id, nome, tipo, foto, cidade, bairro, sobre, servicos, verificado, criado_em, suspenso_ate, contatos(whatsapp, email, receber_emails)",
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

export const ehModerador = cache(async () => {
  if (MODO_DEMO) return false;
  const usuario = await obterUsuario();
  if (!usuario) return false;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.rpc("eh_moderador");
  return data === true;
});

/** Botão "Melhorar texto": ligado no admin e com a chave da IA no servidor. */
export const ajudaDaIADisponivel = cache(async () => {
  if (MODO_DEMO || !iaConfigurada()) return false;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.rpc("config_publica");
  return Boolean(data?.[0]?.ia_melhorar_texto);
});

export async function buscarAnuncios(f: Filtros, agora: number): Promise<AnuncioResumo[]> {
  if (MODO_DEMO) return demo.buscarDemo(f, agora);
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("buscar_anuncios", {
    p_lat: f.lat,
    p_lng: f.lng,
    p_raio_km: f.raio,
    p_tipo: f.tipo,
    p_categoria: f.categoria,
    p_regime: f.regime,
    p_texto: f.q || null,
    p_ordem: f.ordem,
    p_limite: 60,
  });
  if (error) falha("anúncios", error);
  return data ?? [];
}

export const obterAnuncio = cache(async (id: string): Promise<AnuncioCompleto | null> => {
  if (MODO_DEMO) return demo.obterAnuncioDemo(id, await agoraDaRequisicao());
  if (!UUID.test(id)) return null;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("obter_anuncio", { p_id: id }).maybeSingle();
  if (error) falha("anúncio", error);
  return data ?? null;
});

export async function listarMeusAnuncios(): Promise<MeuAnuncio[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("meus_anuncios");
  if (error) falha("seus anúncios", error);
  return data ?? [];
}

export async function listarInteressados(anuncioId: string): Promise<Interessado[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("interessados", { p_anuncio: anuncioId });
  if (error) falha("interessados", error);
  return data ?? [];
}

export async function listarMinhasCurtidas(): Promise<MinhaCurtida[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("minhas_curtidas");
  if (error) falha("suas curtidas", error);
  return data ?? [];
}

export async function listarMatches(): Promise<Match[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("meus_matches");
  if (error) falha("matches", error);
  return data ?? [];
}

export const obterPerfilPublico = cache(async (id: string): Promise<{ perfil: Perfil; anuncios: DadosCard[] } | null> => {
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
      .select("id, nome, tipo, foto, cidade, bairro, sobre, servicos, verificado, criado_em, suspenso_ate")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("anuncios")
      .select(
        "id, tipo, titulo, categoria, regime, pagamento_valor, pagamento_unidade, beneficios, cidade, bairro, criado_em",
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
    })),
  };
});

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
