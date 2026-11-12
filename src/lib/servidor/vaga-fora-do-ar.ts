import "server-only";
import { MODO_DEMO } from "@/lib/config";
import { caminhoDaFuncao, funcaoDaListaPeloCbo } from "@/lib/funcoes-das-paginas";
import { areaDoSlug, caminhoDaBusca, cidadeDoSlug, slugDaCidade } from "@/lib/paginas-busca";
import { UUID } from "@/lib/validacao";
import { criarClientePublico } from "@/lib/supabase/servidor";

// A vaga que saiu do ar leva para as parecidas (migração 20270427120000; claude/plano-alcance-e-cadastros.md): quem
// abre o link de uma vaga pausada, encerrada ou vencida vai para "Vagas de frentista em Goiânia" (ou a área, ou a
// cidade), com o aviso no topo (?vaga=encerrada; components/aviso-vaga-encerrada.tsx). Sem o anúncio, ou anúncio que
// nunca foi público, null: segue o 404.

/** O parâmetro que o destino lê para mostrar "A vaga que você abriu saiu do ar". */
export const PARAMETRO_VAGA_ENCERRADA = "vaga";

export async function destinoDoAnuncioForaDoAr(id: string): Promise<string | null> {
  if (MODO_DEMO || !UUID.test(id)) return null;
  const { data, error } = await criarClientePublico().rpc("destino_do_anuncio_fora_do_ar", { p_id: id }).maybeSingle();
  if (error) {
    // sem a migração no banco: o 404 de antes
    if (error.code !== "PGRST202") console.error("Publike: falha ao ler o destino da vaga fora do ar:", error.message);
    return null;
  }
  if (!data) return null;
  const tipo = data.tipo === "servico" ? "servico" : "vaga";
  // só as cidades com página; de fora, a lista inicial
  const cidade = cidadeDoSlug(slugDaCidade(data.cidade ?? ""));
  const aviso = `?${PARAMETRO_VAGA_ENCERRADA}=encerrada`;
  if (!cidade) return `/${aviso}`;
  const funcao = tipo === "vaga" ? funcaoDaListaPeloCbo(data.cbo) : null;
  if (funcao) return `${caminhoDaFuncao(cidade, funcao.slug)}${aviso}`;
  const area = data.categoria ? areaDoSlug(data.categoria) : null;
  return `${caminhoDaBusca(tipo, cidade, area?.slug ?? null)}${aviso}`;
}
