import { mesCurto } from "@/lib/salarios";
import { storyAbriramNoMes } from "@/lib/servidor/imagens-do-dia";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import { criarClienteAdmin, ehAdminLocal } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// O story da matéria do mês (Admin › Base da Receita): a cidade com mais aberturas no mês passado (migração
// 20270606120000). ?cidade= escolhe outra; ?baixar=1 vem como arquivo.
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export async function GET(request: Request) {
  const admin = await ehAdminLocal();
  if (!admin && !(await possoVerTela("/admin/receita"))) return new Response("Não encontrado", { status: 404 });
  const c = admin ? criarClienteAdmin() : await criarClienteServidor();
  const { data } = await c.rpc("admin_numeros_do_mes_receita", { p_mes: null });
  const n = data as unknown as {
    mes: string;
    por_cidade: { cidade: string; empresas: number; bairros: { bairro: string }[] | null; ramos: { ramo: string }[] | null }[];
  } | null;
  const url = new URL(request.url);
  const pedida = url.searchParams.get("cidade");
  const x = n?.por_cidade.find((p) => p.cidade === pedida) ?? n?.por_cidade[0];
  if (!n || !x) return new Response("Sem números do mês", { status: 404 });
  const [, m] = n.mes.split("-").map(Number);
  return storyAbriramNoMes(
    {
      cidade: x.cidade,
      mes: MESES[m - 1] ?? mesCurto(n.mes),
      empresas: x.empresas,
      bairros: (x.bairros ?? []).map((b) => b.bairro).filter((b) => b !== "(sem bairro)"),
      ramos: (x.ramos ?? []).map((r) => r.ramo),
    },
    url.searchParams.has("baixar") ? `story-abriram-${n.mes.slice(0, 7)}.png` : null,
  );
}
