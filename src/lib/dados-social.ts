import "server-only";
import { cache } from "react";
import { MODO_DEMO } from "./config";
import { obterUsuario } from "./dados";
import { criarClienteServidor } from "./supabase/servidor";

// Leituras do "social a serviço do emprego": quem a pessoa segue,
// recomendações e contratações públicas. Erro aqui nunca derruba a página:
// a parte some (as tabelas podem ainda não existir antes da migração).

export type Seguido = {
  id: number;
  alvo_perfil: string | null;
  alvo_nome: string | null;
  cidade: string | null;
  bairro: string | null;
  /** chave de comparação do bairro (como chaveBairro) */
  bairro_chave: string | null;
};

/** O que eu sigo (perfis com o nome, e bairros). */
export const meusSeguidos = cache(async (): Promise<Seguido[]> => {
  if (MODO_DEMO || !(await obterUsuario())) return [];
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("seguindo")
    .select("id, alvo_perfil, cidade, bairro, bairro_chave")
    .order("criado_em", { ascending: false })
    .limit(200);
  if (error || !data) return [];
  const ids = data.map((s) => s.alvo_perfil).filter((x): x is string => Boolean(x));
  const nomes = new Map<string, string>();
  if (ids.length) {
    const { data: perfis } = await supabase.from("perfis").select("id, nome").in("id", ids);
    for (const p of perfis ?? []) nomes.set(p.id, p.nome);
  }
  return data.map((s) => ({ ...s, alvo_nome: s.alvo_perfil ? (nomes.get(s.alvo_perfil) ?? null) : null }));
});

export type Recomendacao = {
  id: number;
  autor_id: string;
  autor_nome: string;
  autor_foto: string | null;
  relacao: string;
  texto: string;
  oculta: boolean;
  criado_em: string;
};

export async function recomendacoesDoPerfil(perfilId: string): Promise<Recomendacao[]> {
  if (MODO_DEMO) return [];
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("recomendacoes_do_perfil", { p_perfil: perfilId });
  return error ? [] : (data ?? []);
}

export type ContratacaoPublica = {
  anuncio_id: string;
  titulo: string;
  pessoa_id: string;
  pessoa_nome: string;
  empresa_id: string;
  empresa_nome: string;
  bairro: string | null;
  cidade: string;
  publicado_em: string;
};

export async function contratacoesRecentes(
  filtro: { empresa?: string; pessoa?: string; limite?: number } = {},
): Promise<ContratacaoPublica[]> {
  if (MODO_DEMO) return [];
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("contratacoes_recentes", {
    p_empresa: filtro.empresa ?? null,
    p_pessoa: filtro.pessoa ?? null,
    p_limite: filtro.limite ?? 12,
  });
  return error ? [] : (data ?? []);
}

/** As contratações em que estou (dos dois lados), por "anúncio:pessoa". */
export const minhasContratacoesPublicas = cache(
  async (): Promise<Map<string, { ok_empresa: boolean; ok_pessoa: boolean }>> => {
    const mapa = new Map<string, { ok_empresa: boolean; ok_pessoa: boolean }>();
    if (MODO_DEMO || !(await obterUsuario())) return mapa;
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("minhas_contratacoes_publicas");
    if (error) return mapa;
    for (const c of data ?? []) mapa.set(`${c.anuncio_id}:${c.perfil_id}`, { ok_empresa: c.ok_empresa, ok_pessoa: c.ok_pessoa });
    return mapa;
  },
);
