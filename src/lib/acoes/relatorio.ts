"use server";

import { refresh } from "next/cache";
import { SITE_URL } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

/** O link do relatório para o cliente (migração 20270409120000): cria, ou troca (o anterior deixa de abrir). */
export async function linkDoRelatorio(clienteId: string, trocar = false): Promise<Resultado & { link?: string }> {
  if (!UUID.test(clienteId)) return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: `/entrar?next=/painel/clientes/${clienteId}/relatorio` };
  const { data, error } = await (await criarClienteServidor()).rpc("link_do_relatorio", {
    p_cliente: clienteId,
    p_trocar: trocar,
  });
  if (error?.code === "PGRST202") return { ok: false, erro: "O relatório ainda não está pronto. Tente mais tarde." };
  if (error || !data) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return {
    ok: true,
    mensagem: trocar ? "Link novo criado. O anterior não abre mais." : "Link criado.",
    link: `${SITE_URL}/relatorio/${data}`,
  };
}
