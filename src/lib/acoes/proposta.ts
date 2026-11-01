"use server";

import { after } from "next/server";
import { refresh } from "next/cache";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { mensagemDeErro } from "@/lib/erros";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// A proposta (migração 20270110120000).

export type DadosDaProposta = {
  salario: string;
  inicio: string;
  horario: string;
  beneficios: string;
  recado: string;
  apresentar_onde: string;
  apresentar_hora: string;
  documentos: string[];
};

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}$/;

export async function fazerProposta(anuncioId: string, perfilId: string, d: DadosDaProposta): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId) || !UUID.test(perfilId)) return { ok: false, erro: "Pedido inválido." };
  const corta = (x: unknown, n: number) =>
    String(x ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, n);
  const salario = corta(d?.salario, 80);
  if (salario.length < 2) return { ok: false, erro: "Escreva o salário." };
  if (!DATA.test(String(d?.inicio ?? ""))) return { ok: false, erro: "Escolha o dia de início." };
  const hora = String(d?.apresentar_hora ?? "");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("fazer_proposta", {
    p_anuncio: anuncioId,
    p_perfil: perfilId,
    p_dados: {
      salario,
      inicio: d.inicio,
      horario: corta(d.horario, 120),
      beneficios: corta(d.beneficios, 300),
      recado: String(d?.recado ?? "")
        .trim()
        .slice(0, 600),
      apresentar_onde: corta(d.apresentar_onde, 300),
      apresentar_hora: HORA.test(hora) ? hora : "",
      documentos: (Array.isArray(d?.documentos) ? d.documentos : [])
        .map((x) => corta(x, 60))
        .filter(Boolean)
        .slice(0, 12),
    },
  });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para mandar a proposta.") };
  after(processarFilas);
  refresh();
  return { ok: true, mensagem: "Proposta enviada. O candidato recebe o aviso e responde pelo Publike." };
}

export async function cancelarProposta(anuncioId: string, perfilId: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId) || !UUID.test(perfilId)) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("cancelar_proposta", { p_anuncio: anuncioId, p_perfil: perfilId });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: "Proposta cancelada." };
}

export async function responderProposta(anuncioId: string, aceitar: boolean, motivo = ""): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("responder_proposta", {
    p_anuncio: anuncioId,
    p_aceitar: aceitar === true,
    p_motivo: String(motivo ?? "")
      .trim()
      .slice(0, 300),
  });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para responder agora.") };
  after(processarFilas);
  refresh();
  return {
    ok: true,
    mensagem: aceitar ? "Proposta aceita. A empresa recebeu o aviso." : "Resposta enviada. A empresa recebeu o aviso.",
  };
}
