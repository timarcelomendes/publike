"use server";

import {
  botaoValido,
  buscaDeNovo,
  conversasParaProcurarDeNovo,
  enviarBuscaDeNovo,
  RESPOSTA_SEM_VAGA,
  type BuscaDeNovo,
} from "@/lib/servidor/atendimento-whatsapp";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import { clienteAdminOuNulo, type ClienteBanco } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";

// Admin › WhatsApp › Conversas, "Procurar de novo" (19/11/2026; Marcelo: "revisite as conversas e veja se há
// possibilidade de enviar pra conversas iniciadas"): as conversas que pararam no "não achei vaga", com a janela de 24
// horas aberta, recebem a busca nova. A equipe vê a mensagem de cada uma antes; só vai a que ela mandar.

async function banco(): Promise<ClienteBanco | null> {
  const admin = await clienteAdminOuNulo();
  return admin ?? ((await possoVerTela("/admin/whatsapp")) ? await criarClienteServidor() : null);
}

export type ConversaSemVaga = { chave: string; nome: string | null; final: string };

type NaLista = {
  chave: string;
  nome: string | null;
  final: string;
  situacao: "robo" | "equipe";
  ultima: { de: "pessoa" | "robo" | "equipe"; texto: string } | null;
};

async function numeroAberto(c: ClienteBanco, conversa: string) {
  const { data } = await c.rpc("admin_whatsapp_conversa_numero", { p_conversa: conversa });
  const d = data as { numero: string; janela_aberta: boolean } | null;
  return d?.numero && d.janela_aberta ? d.numero : null;
}

/** As conversas em que a última resposta foi o "não achei" e ainda dá para responder (a janela de 24 horas). */
export async function conversasSemVaga(): Promise<ConversaSemVaga[]> {
  const c = await banco();
  if (!c) return [];
  const { data, error } = await c.rpc("admin_whatsapp_conversas", { p_filtro: "todas" });
  if (error || !data) return [];
  const todas = ((data as unknown as { lista: NaLista[] }).lista ?? []).filter(
    (x) => x.situacao === "robo" && x.ultima?.de === "robo",
  );
  // o "não achei" já se vê na última; a resposta que repetiu vagas (20/11/2026) pede a conversa inteira
  const repetidas = await conversasParaProcurarDeNovo(
    todas.filter((x) => !RESPOSTA_SEM_VAGA.test(x.ultima?.texto ?? "") && /\/anuncio\//.test(x.ultima?.texto ?? "")).map((x) => x.chave),
  );
  const lista = todas.filter((x) => RESPOSTA_SEM_VAGA.test(x.ultima?.texto ?? "") || repetidas.has(x.chave));
  const abertas = await Promise.all(lista.map(async (x) => ((await numeroAberto(c, x.chave)) ? x : null)));
  return abertas.filter((x) => x !== null).map((x) => ({ chave: x.chave, nome: x.nome, final: x.final }));
}

/** A mensagem que iria para a conversa (sem enviar). */
export async function previaDaBuscaDeNovo(conversa: string, nome: string | null): Promise<BuscaDeNovo> {
  const c = await banco();
  if (!c || !/^[0-9]{8,15}$/.test(conversa)) return { ok: false, motivo: "Sem acesso." };
  return buscaDeNovo(conversa, nome);
}

/** Envia a mensagem que a equipe viu. */
export async function enviarBuscaDeNovoAgora(conversa: string, texto: string, botao: unknown): Promise<Resultado> {
  const c = await banco();
  if (!c || !/^[0-9]{8,15}$/.test(conversa)) return { ok: false, erro: "Sem acesso." };
  const t = texto.trim();
  if (!t || t.length > 4000) return { ok: false, erro: "A mensagem está vazia ou passa de 4.000 letras." };
  const b = botao == null ? null : botaoValido(botao);
  if (botao != null && !b) return { ok: false, erro: "O botão não é um dos do atendimento." };
  const numero = await numeroAberto(c, conversa);
  if (!numero) return { ok: false, erro: "Passaram 24 horas da última mensagem da pessoa." };
  const r = await enviarBuscaDeNovo(conversa, numero, t, b);
  return r.ok ? { ok: true } : { ok: false, erro: r.erro };
}
