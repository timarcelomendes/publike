"use server";

import { LIMITES_CHAT, TAMANHO_MENSAGEM_CHAT, type CartaoChat, type MensagemChat, type RespostaChat } from "@/lib/assistente";
import { MODO_DEMO } from "@/lib/config";
import { obterAnuncio, obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { formatarLugar, valorDoAnuncio } from "@/lib/formato";
import { ErroIA } from "@/lib/ia/openai";
import { obterLocal } from "@/lib/local";
import { assistenteDisponivel, responderAssistente } from "@/lib/servidor/assistente";
import { acessoFila } from "@/lib/servidor/filas";
import { dentroDoLimite, embaralhar, enderecoDeQuemPediu } from "@/lib/servidor/limite";
import { criarClientePublico } from "@/lib/supabase/servidor";
import { modeloPara } from "@/lib/ia/funcionalidades";

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
  // Sem contar o uso no banco, o assistente não responde: assim o gasto da IA nunca fica sem limite
  // (no banco também há um teto geral por hora, para todo mundo junto).
  const acesso = acessoFila();
  if (!acesso) return { ok: false, erro: DESLIGADO };
  {
    const { data: pode, error } = await acesso.cliente.rpc("servidor_usar_assistente", {
      p_chave: acesso.chave,
      p_quem: quem,
      p_limite: usuario ? LIMITES_CHAT.conta : LIMITES_CHAT.visitante,
    });
    if (error) {
      if (error.hint === "chat_cheio") return { ok: false, erro: error.message };
      console.error("Publike: não deu para contar o uso do assistente:", error.message);
      return { ok: false, erro: "O assistente não está disponível agora. Tente de novo daqui a pouco." };
    }
    if (pode === false) {
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
      modeloPara(config?.[0], "chat"),
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O chat da saída ("Antes de ir…"): as vagas que a pessoa abriu neste aparelho e não curtiu (a lista fica no
 * navegador, em publike_vagas_vistas). Só as que ainda estão no ar e abertas; no máximo 3.
 */
export async function vagasVistasParaOChat(ids: unknown): Promise<CartaoChat[]> {
  if (MODO_DEMO || !Array.isArray(ids)) return [];
  const validos = [...new Set(ids.filter((id): id is string => typeof id === "string" && UUID.test(id)))].slice(0, 6);
  const anuncios = await Promise.all(validos.map((id) => obterAnuncio(id).catch(() => null)));
  return anuncios
    .filter((a) => a && a.tipo === "vaga" && a.status === "ativo" && !a.preenchida_em && !a.minha_curtida)
    .slice(0, 3)
    .map((a) => ({
      tipo: "anuncio" as const,
      id: a!.id,
      titulo: a!.titulo,
      linha: [a!.contratante ?? a!.autor_nome, formatarLugar(a!.bairro, a!.cidade)].filter(Boolean).join(" · "),
      valor: valorDoAnuncio(a!),
    }));
}
