import "server-only";
import { cache } from "react";
import { MODO_DEMO } from "./config";
import * as demo from "./demo";
import { iaConfigurada } from "./ia/openai";
import type { Filtros } from "./filtros";
import { chavesDaRegiao, type Local } from "./regioes";
import { criarClienteServidor } from "./supabase/servidor";
import { agoraDaRequisicao } from "./tempo";
import type {
  AnuncioCompleto,
  AnuncioDoPerfil,
  AnuncioResumo,
  AvaliacaoPublica,
  AvaliacaoRecebida,
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

/** Busca da página inicial. Com `local`, os anúncios do bairro, da região e da cidade vêm primeiro. */
export async function buscarAnuncios(f: Filtros, agora: number, local: Local | null = null): Promise<AnuncioResumo[]> {
  if (MODO_DEMO) return demo.buscarDemo(f, agora, local);
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
    p_cidade: local?.cidade ?? null,
    p_bairro: local?.bairro || null,
    p_bairros_regiao: local?.regiao ? chavesDaRegiao(local.regiao) : null,
    p_regiao: local?.regiao ?? null,
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

/** Os serviços de quem está logado, para o cadastro "Meus serviços". */
export async function listarMeusServicos(): Promise<MeuServico[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("meus_servicos");
  if (error) falha("seus serviços", error);
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
      .select("id, nome, tipo, foto, cidade, bairro, sobre, servicos, verificado, criado_em, suspenso_ate")
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
