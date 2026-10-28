import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/tipos-banco";

// O logo e o link da empresa no currículo (migração 20261209120000_empresas_catalogo.sql): para cada "onde"
// das experiências, a conta da empresa no Publike, quando o cadastro de empresas liga o nome a ela.

export type EmpresaDoTrabalho = { id: string; nome: string; foto: string | null };
/** pelo "onde" da experiência, como a pessoa escreveu */
export type EmpresasDosTrabalhos = Record<string, EmpresaDoTrabalho>;

export async function empresasDosTrabalhos(
  supabase: SupabaseClient<Database>,
  experiencias: { onde: string }[],
): Promise<EmpresasDosTrabalhos> {
  const nomes = [...new Set(experiencias.map((e) => e.onde.trim()).filter(Boolean))].slice(0, 200);
  if (!nomes.length) return {};
  const { data, error } = await supabase.rpc("empresas_do_curriculo", { p_nomes: nomes });
  if (error) {
    // sem a migração, o currículo aparece como antes
    if (error.code !== "PGRST202") console.warn(`Publike: sem as empresas do currículo: ${error.message}`);
    return {};
  }
  const mapa: EmpresasDosTrabalhos = {};
  for (const e of data ?? []) mapa[e.pedido] = { id: e.perfil_id, nome: e.nome, foto: e.foto_url };
  return mapa;
}
