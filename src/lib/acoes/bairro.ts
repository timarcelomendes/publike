"use server";

import { refresh } from "next/cache";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { lerBairro } from "@/lib/validacao";

/**
 * "É onde você mora?" (a sugestão pela localização do aparelho, 16/11/2026): grava o bairro no perfil da pessoa. É o
 * bairro que o cartão do currículo mostra e o que põe a pessoa no mapa dos talentos (nunca o ponto do aparelho).
 */
export async function salvarMeuBairro(bairro: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const lido = lerBairro(bairro);
  if (!lido.ok) return { ok: false, erro: lido.erro };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/perfil" };
  const perfil = await obterMeuPerfil().catch(() => null);
  if (!perfil) return { ok: false, erro: "Complete seu perfil primeiro.", ir: "/perfil?completar=1" };
  const { error } = await (await criarClienteServidor())
    .from("perfis")
    .update({ bairro: lido.bairro })
    .eq("id", usuario.id);
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para salvar o bairro agora.") };
  refresh();
  return { ok: true, mensagem: `Pronto: ${lido.bairro} está no seu perfil.` };
}
