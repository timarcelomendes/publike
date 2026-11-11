"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// O mutirão de contratação (migração 20270417120000): o banco confere quem pode, a lotação e os limites.

const HORA = /^\d{2}:\d{2}$/;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

export async function criarMutirao(d: {
  dia: string;
  inicio: string;
  fim: string;
  intervalo: number;
  porHorario: number;
  local: string;
  trazer: string;
  vagas: string[];
}): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!(await obterUsuario())) return { ok: false, erro: "Entre na sua conta." };
  if (!DIA.test(d.dia)) return { ok: false, erro: "Escolha o dia." };
  if (!HORA.test(d.inicio) || !HORA.test(d.fim)) return { ok: false, erro: "Escolha o começo e o fim." };
  const vagas = (d.vagas ?? []).filter((v) => UUID.test(v)).slice(0, 20);
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("criar_mutirao", {
    p_dia: d.dia,
    p_inicio: d.inicio,
    p_fim: d.fim,
    p_intervalo: Number(d.intervalo),
    p_por_horario: Number(d.porHorario),
    p_local: String(d.local ?? "").slice(0, 300),
    p_trazer: String(d.trazer ?? "").slice(0, 300) || null,
    p_vagas: vagas,
  });
  if (error || !data) return { ok: false, erro: error ? mensagemDeErro(error) : "Não deu para criar o mutirão." };
  return { ok: true, id: String(data) };
}

export async function chamarParaMutirao(mutirao: string, anuncio: string, pessoas: string[]): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const lista = (pessoas ?? []).filter((p) => UUID.test(p));
  if (!UUID.test(mutirao) || !UUID.test(anuncio) || !lista.length) return { ok: false, erro: "Escolha quem chamar." };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("chamar_para_mutirao", {
    p_mutirao: mutirao,
    p_anuncio: anuncio,
    p_pessoas: lista.slice(0, 50),
  });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  // os avisos (sino, celular e e-mail) saem pelas filas
  after(processarFilas);
  refresh();
  const n = Number(data ?? 0);
  return {
    ok: true,
    mensagem: n === 0 ? "Ninguém novo para chamar." : n === 1 ? "1 pessoa chamada." : `${n} pessoas chamadas.`,
  };
}

export async function cancelarMutirao(mutirao: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(mutirao)) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("cancelar_mutirao", { p_mutirao: mutirao });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  after(processarFilas);
  refresh();
  return { ok: true, mensagem: "Mutirão cancelado. Quem foi chamado recebe o aviso." };
}

/** A pessoa chamada escolhe o horário (ou troca). */
export async function escolherHorarioDoMutirao(entrevista: string, quando: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const data = new Date(quando);
  if (!UUID.test(entrevista) || Number.isNaN(data.getTime())) return { ok: false, erro: "Pedido inválido." };
  if (!(await obterUsuario())) return { ok: false, erro: "Entre na sua conta." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("escolher_horario_mutirao", {
    p_entrevista: entrevista,
    p_quando: data.toISOString(),
  });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  after(processarFilas);
  refresh();
  return { ok: true, mensagem: "Horário escolhido. Você recebe o lembrete na véspera." };
}

export async function naoPossoIrAoMutirao(entrevista: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(entrevista)) return { ok: false, erro: "Pedido inválido." };
  if (!(await obterUsuario())) return { ok: false, erro: "Entre na sua conta." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("nao_posso_ir_mutirao", { p_entrevista: entrevista });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  after(processarFilas);
  refresh();
  return { ok: true, mensagem: "Pronto: o seu lugar foi liberado, e a empresa recebe o aviso." };
}
