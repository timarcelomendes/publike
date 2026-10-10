"use server";

import { MODO_DEMO } from "@/lib/config";
import { mensagemDeErro } from "@/lib/erros";
import { caminhoSeguro } from "@/lib/formato";
import { dentroDoLimite, embaralhar, enderecoDeQuemPediu } from "@/lib/servidor/limite";
import { ehTipoSugestao } from "@/lib/sugestoes";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { EstadoForm } from "@/lib/tipos";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function texto(formData: FormData, nome: string) {
  const v = formData.get(nome);
  return typeof v === "string" ? v.trim() : "";
}

/** Erro, sugestão, elogio ou melhoria. Qualquer pessoa manda, com ou sem conta. */
export async function enviarSugestao(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const tipo = texto(formData, "tipo");
  const mensagem = texto(formData, "texto");
  const email = texto(formData, "email").toLowerCase();
  const pagina = caminhoSeguro(texto(formData, "pagina") || null, "") || null;

  if (!ehTipoSugestao(tipo))
    return { ok: false, erro: "Escolha o que você quer mandar.", erros: { tipo: "Escolha uma opção." } };
  if (mensagem.length < 10) {
    return { ok: false, erro: "Conte um pouco mais.", erros: { texto: "Escreva pelo menos 10 letras." } };
  }
  if (mensagem.length > 2000) return { ok: false, erro: "Resuma um pouco.", erros: { texto: "Até 2.000 letras." } };
  if (email && !EMAIL.test(email))
    return { ok: false, erro: "Confira o e-mail.", erros: { email: "Confira o e-mail." } };
  if (MODO_DEMO) return { ok: true, mensagem: "Recebido! (No modo demonstração nada é guardado.)" };

  // 5 envios a cada 10 minutos por endereço de internet
  if (!dentroDoLimite(`sugestao:${embaralhar(await enderecoDeQuemPediu())}`, 5, 10 * 60_000)) {
    return { ok: false, erro: "Você mandou várias mensagens seguidas. Espere uns minutos e tente de novo." };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("enviar_sugestao", {
    p_tipo: tipo,
    p_texto: mensagem,
    p_pagina: pagina,
    p_email: email || null,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  return { ok: true, mensagem: "Recebemos! Obrigado por ajudar a melhorar o Publike." };
}
