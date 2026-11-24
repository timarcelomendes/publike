import type { NextRequest } from "next/server";
import { MODO_DEMO } from "@/lib/config";
import { mensagemDeErro } from "@/lib/erros";
import { irPara, PAPEL_OLHAR, papelDoToken } from "@/lib/servidor/olhar";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

// Começar a ver como o dono (Admin › Usuários › a conta): só a equipe publike.org com login. Abre o painel da conta,
// só olhando, por 1 hora. O que dá errado volta para a conta com o motivo.
export async function POST(request: NextRequest) {
  const dados = await request.formData().catch(() => null);
  const conta = String(dados?.get("conta") ?? "");
  if (MODO_DEMO || !UUID.test(conta)) return irPara(request, "/admin");
  const voltar = (motivo: string) => irPara(request, `/admin/usuarios/${conta}?olhar=${encodeURIComponent(motivo)}`);
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return voltar("Entre no site com a sua conta publike.org para ver como o dono.");
  const { error } = await supabase.rpc("equipe_comecar_a_olhar", { p_conta: conta });
  if (error) {
    if (error.code === "PGRST202") return voltar("Rode antes a migração 20270919120000_ver_como_o_dono.sql.");
    return voltar(mensagemDeErro(error));
  }
  const { data: renovada, error: erroSessao } = await supabase.auth.refreshSession();
  if (erroSessao || papelDoToken(renovada.session?.access_token) !== PAPEL_OLHAR) {
    // o gancho do token não pôs a conta: desfaz e explica
    await supabase.rpc("parar_de_olhar");
    await supabase.auth.refreshSession();
    return voltar("O gancho do token (Authentication › Hooks) não trouxe a conta. Confira se ele está ligado.");
  }
  return irPara(request, "/painel");
}
