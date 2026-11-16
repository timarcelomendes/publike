import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { MODO_DEMO } from "@/lib/config";
import { CONTEUDOS, conteudoDoSlug, type Conteudo } from "@/lib/conteudos";
import { lerDadosDoConteudo, type DadosDoConteudo } from "@/lib/conteudos/atualizacao";
import { criarClientePublico } from "@/lib/supabase/servidor";

// Os conteúdos como o site mostra (migração 20270705120000): o artigo do repositório com, por cima, a última versão
// com os números atualizados que o admin publicou em Admin › Conteúdos. Guardado por uma hora; publicar limpa
// (a etiqueta "conteudos").

type Publicado = { dados: DadosDoConteudo; em: string };

async function lerPublicados(): Promise<Record<string, Publicado>> {
  "use cache";
  cacheLife("hours");
  cacheTag("conteudos");
  if (MODO_DEMO) return {};
  const { data, error } = await criarClientePublico().rpc("conteudos_publicados");
  // a falha sai como erro (e não fica guardada): a próxima visita tenta de novo
  if (error) throw new Error(`${error.code ?? "erro"}: ${error.message}`);
  const lista: Record<string, Publicado> = {};
  for (const l of data ?? []) {
    const dados = lerDadosDoConteudo(l.dados);
    if (dados) lista[l.slug] = { dados, em: String(l.publicado_em ?? "").slice(0, 10) };
  }
  return lista;
}

async function publicados(): Promise<Record<string, Publicado>> {
  try {
    return await lerPublicados();
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (!m.startsWith("PGRST202")) console.error("Publike: falha ao ler os conteúdos atualizados:", m);
    return {};
  }
}

function comAtualizacao(base: Conteudo, p: Publicado | undefined): Conteudo {
  return p ? { ...base, ...p.dados, atualizado: p.em || undefined } : base;
}

/** Um conteúdo como o site mostra (com a última atualização publicada); null se o slug não existe. */
export async function conteudoAtual(slug: string): Promise<Conteudo | null> {
  const base = conteudoDoSlug(slug);
  if (!base) return null;
  return comAtualizacao(base, (await publicados())[slug]);
}

/** Vários conteúdos (na ordem pedida; sem slugs, todos), como o site mostra. */
export async function conteudosAtuais(slugs?: string[]): Promise<Conteudo[]> {
  const p = await publicados();
  const base = slugs ? slugs.map(conteudoDoSlug).filter((c): c is Conteudo => Boolean(c)) : CONTEUDOS;
  return base.map((c) => comAtualizacao(c, p[c.slug]));
}
