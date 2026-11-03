"use server";

import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";

// "Quero testar" do /testar-app (migração 20270129120000): a pessoa põe o e-mail da conta Google da Play Store e
// entra em Admin › Testadores do app, com o WhatsApp da conta. O admin manda o link do teste.

export async function queroTestarApp(email: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const usuario = await obterUsuario();
  if (!usuario)
    return {
      ok: false,
      erro: "Entre na sua conta para pedir o convite.",
      ir: "/entrar?next=/testar-app%23quero-testar",
    };
  const valor = String(email ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 200);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valor)) return { ok: false, erro: "Confira o e-mail." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("quero_testar_app", { p_email: valor });
  if (error) {
    if (error.code === "PGRST202")
      return { ok: false, erro: "O pedido pelo site ainda não está ligado. Faça os 3 passos acima." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  return {
    ok: true,
    mensagem: "Pronto! Seu e-mail está na lista. Em breve você recebe o link do teste no seu WhatsApp.",
  };
}
