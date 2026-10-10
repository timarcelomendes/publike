"use server";

import { LIMITES_CHAT, TAMANHO_MENSAGEM_CHAT, type MensagemChat, type RespostaChat } from "@/lib/assistente";
import { MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { ErroIA } from "@/lib/ia/openai";
import { obterLocal } from "@/lib/local";
import { assistenteDisponivel, responderAssistente } from "@/lib/servidor/assistente";
import { acessoFila } from "@/lib/servidor/filas";
import { dentroDoLimite, embaralhar, enderecoDeQuemPediu } from "@/lib/servidor/limite";
import { criarClientePublico } from "@/lib/supabase/servidor";

const DESLIGADO = "O assistente não está disponível agora. Veja as respostas na página de ajuda.";

function lerHistorico(valor: unknown): MensagemChat[] | null {
  if (!Array.isArray(valor) || valor.length === 0 || valor.length > 60) return null;
  const lista: MensagemChat[] = [];
  for (const m of valor) {
    if (!m || typeof m !== "object") return null;
    const { de, texto } = m as Record<string, unknown>;
    if ((de !== "pessoa" && de !== "assistente") || typeof texto !== "string") return null;
    const limpo = texto.trim().slice(0, de === "pessoa" ? TAMANHO_MENSAGEM_CHAT : 1500);
    if (limpo) lista.push({ de, texto: limpo });
  }
  return lista.at(-1)?.de === "pessoa" ? lista : null;
}

/** Uma pergunta ao assistente. A conversa vem do navegador (não fica guardada). */
export async function perguntarAoAssistente(historico: unknown): Promise<RespostaChat> {
  const conversa = lerHistorico(historico);
  if (!conversa) return { ok: false, erro: "Escreva sua pergunta." };
  if (MODO_DEMO) {
    return {
      ok: true,
      texto: "No modo demonstração o assistente não responde. As respostas mais comuns estão na página de ajuda.",
      acao: "nenhuma",
      cartoes: [],
      verMais: "/ajuda",
    };
  }
  if (!(await assistenteDisponivel())) return { ok: false, erro: DESLIGADO };

  const usuario = await obterUsuario();
  const quem = usuario ? `u:${usuario.id}` : `ip:${embaralhar(await enderecoDeQuemPediu())}`;
  // rajada: no máximo 8 por minuto (na memória); por hora, quem conta é o banco
  if (!dentroDoLimite(`assistente:${quem}`, 8, 60_000)) {
    return { ok: false, erro: "Muitas perguntas seguidas. Espere um minutinho e tente de novo." };
  }
  const acesso = acessoFila();
  if (acesso) {
    const { data: pode, error } = await acesso.cliente.rpc("servidor_usar_assistente", {
      p_chave: acesso.chave,
      p_quem: quem,
      p_limite: usuario ? LIMITES_CHAT.conta : LIMITES_CHAT.visitante,
    });
    if (error) console.error("Publike: não deu para contar o uso do assistente:", error.message);
    else if (pode === false) {
      return {
        ok: false,
        erro: usuario
          ? "Você já fez muitas perguntas nesta hora. Tente de novo mais tarde."
          : "Você já fez muitas perguntas nesta hora. Entre na sua conta para continuar, ou tente mais tarde.",
      };
    }
  }

  const [perfil, local, { data: config }] = await Promise.all([
    usuario ? obterMeuPerfil() : null,
    obterLocal(),
    criarClientePublico().rpc("config_publica"),
  ]);
  try {
    const r = await responderAssistente(
      conversa,
      { logada: Boolean(usuario), nome: perfil?.nome?.split(" ")[0] ?? null, local },
      config?.[0]?.ia_modelo ?? null,
    );
    return { ok: true, ...r };
  } catch (e) {
    console.error("Publike: o assistente não respondeu:", e instanceof Error ? e.message : e);
    return {
      ok: false,
      erro: e instanceof ErroIA ? "O assistente não conseguiu responder agora. Tente de novo em instantes." : DESLIGADO,
    };
  }
}
