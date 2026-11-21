"use server";

import { redirect } from "next/navigation";
import { irDepoisDoLogin } from "@/lib/acoes/perfil";
import { acessoFila } from "@/lib/servidor/filas";
import {
  apagarProva,
  CAMINHO_JUNTAR,
  provaDoNavegador,
  recusarJuntar,
} from "@/lib/servidor/juntar-whatsapp";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// /entrar/juntar (21/11/2026; migração 20270819120000): as escolhas depois de entrar pelo WhatsApp numa conta nova com
// um número que está no cadastro de outra conta. A conta é sempre a da sessão conferida no Auth; o número e a conta
// nova vêm só da prova assinada pelo servidor (src/lib/servidor/juntar-whatsapp.ts), nunca do navegador.

async function quemEsta() {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.auth.getUser();
  return { supabase, usuario: error ? null : data.user };
}

/** "Sim, é minha": sai da conta nova (a prova fica) e vai entrar na outra. */
export async function entrarNaOutraConta() {
  const prova = await provaDoNavegador();
  if (!prova) redirect(CAMINHO_JUNTAR);
  const { supabase, usuario } = await quemEsta();
  if (usuario?.id === prova.nova) await supabase.auth.signOut({ scope: "local" });
  redirect(`/entrar?next=${encodeURIComponent(CAMINHO_JUNTAR)}`);
}

/** "Não, criar uma conta nova": segue com a conta nova, sem perguntar de novo. */
export async function ficarComAContaNova() {
  const prova = await provaDoNavegador();
  if (!prova) redirect("/");
  await recusarJuntar(prova);
  // segue sem a pergunta (nesta mesma ação, o cookie da recusa ainda não se lê; ele vale para as próximas entradas)
  await irDepoisDoLogin(prova.proximo, { semJuntar: true });
}

/** Na outra conta: vincula o número a ela e apaga a conta nova (vazia). */
export async function juntarAsContas() {
  const prova = await provaDoNavegador();
  if (!prova) redirect(CAMINHO_JUNTAR);
  const { usuario } = await quemEsta();
  if (!usuario) redirect(`/entrar?next=${encodeURIComponent(CAMINHO_JUNTAR)}`);
  if (usuario.id === prova.nova) redirect(CAMINHO_JUNTAR);
  const acesso = acessoFila();
  if (!acesso) redirect(`${CAMINHO_JUNTAR}?erro=fora`);
  const { data, error } = await acesso.cliente.rpc("servidor_whatsapp_juntar", {
    p_chave: acesso.chave,
    p_nova: prova.nova,
    p_numero: prova.numero,
    p_conta: usuario.id,
  });
  const r = (error ? null : data) as { ok?: boolean; erro?: string } | null;
  if (!r?.ok) redirect(`${CAMINHO_JUNTAR}?erro=${encodeURIComponent(r?.erro ?? "fora")}`);
  await apagarProva();
  redirect(`${CAMINHO_JUNTAR}?pronto=1&next=${encodeURIComponent(prova.proximo)}`);
}

/** Na outra conta, "Agora não": esquece a prova e segue. */
export async function naoJuntar() {
  const prova = await provaDoNavegador();
  await apagarProva();
  redirect(prova?.proximo ?? "/");
}
