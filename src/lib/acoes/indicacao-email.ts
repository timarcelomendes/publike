"use server";

import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// Indicar a vaga por e-mail (claude/plano-comentarios-e-indicar-por-email.md, parte 1; migração 20270317120000).
// A resposta é sempre a mesma quando dá certo: quem indica não descobre se o amigo tem conta.

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

/** "an•••@gmail.com" */
function escondido(email: string) {
  const [nome, dominio] = email.split("@");
  return `${nome.slice(0, 2)}•••@${dominio}`;
}

export async function indicarPorEmail(anuncioId: string, email: string, nome: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Vaga não encontrada." };
  const limpo = email.trim().toLowerCase();
  if (!EMAIL.test(limpo) || limpo.length > 200) return { ok: false, erro: "Confira o e-mail do seu amigo." };
  if (!(await obterUsuario()))
    return { ok: false, erro: "Entre na sua conta para indicar.", ir: `/entrar?next=/anuncio/${anuncioId}%23indicar` };
  const { error } = await (await criarClienteServidor()).rpc("indicar_por_email", {
    p_anuncio: anuncioId,
    p_email: limpo,
    p_nome: nome.replace(/\s+/g, " ").trim().slice(0, 60) || null,
  });
  if (error) {
    return {
      ok: false,
      erro:
        error.code === "PGRST202"
          ? "Isso ainda não está disponível. Tente de novo mais tarde."
          : mensagemDeErro(error, "Não deu para mandar agora. Tente de novo em instantes."),
    };
  }
  // o e-mail sai já, sem esperar a próxima volta das filas
  after(processarFilas);
  return { ok: true, mensagem: `Pronto, mandamos a vaga para ${escondido(limpo)}.` };
}

/** "Parar de receber indicações" (o link do rodapé do e-mail): o e-mail não recebe mais indicação de ninguém. */
export async function sairDasIndicacoes(codigo: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!/^[0-9a-f]{64}$/.test(codigo)) return { ok: false, erro: "Este link não vale. Abra de novo pelo e-mail." };
  const { data, error } = await (await criarClienteServidor()).rpc("sair_das_indicacoes", { p_codigo: codigo });
  if (error || !data) return { ok: false, erro: "Este link não vale mais. Responda o e-mail que a gente tira você da lista." };
  return { ok: true, mensagem: "Pronto: este e-mail não recebe mais indicações de vagas." };
}
