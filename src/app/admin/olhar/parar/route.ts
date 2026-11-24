import type { NextRequest } from "next/server";
import { irPara } from "@/lib/servidor/olhar";
import { ehAdminLocal } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

// Parar de ver como o dono: apaga a linha (o único pedido que o somente leitura deixa passar), renova o token e volta
// para a conta no admin (no computador do dono) ou para o admin.
export async function POST(request: NextRequest) {
  const supabase = await criarClienteServidor();
  const { data: conta } = await supabase.rpc("parar_de_olhar");
  await supabase.auth.refreshSession();
  const local = await ehAdminLocal();
  return irPara(request, local && typeof conta === "string" && UUID.test(conta) ? `/admin/usuarios/${conta}` : "/admin");
}
