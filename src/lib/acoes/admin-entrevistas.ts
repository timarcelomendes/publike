"use server";

import { refresh } from "next/cache";
import { horariosDoTexto } from "@/lib/agenda-horarios";
import { mensagemDeErro } from "@/lib/erros";
import { clienteAdminOuNulo, type ClienteBanco } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// A agenda de entrevistas (migrações 20271013120000 e 20271014120000; claude/plano-entrevista-marcada.md): monta a
// agenda da vaga, aprova quem chamar e anota o resultado. No Admin › Entrevistas (o admin do computador do dono ou a
// equipe publike.org) e no painel da vaga (a conta dona). Quem pode mexer em cada agenda o banco confere
// (privado.exigir_agenda): a equipe em todas, a conta só nas das vagas dela.

const FORA = "Entre na sua conta para mexer na agenda.";
const FORMATOS = ["presencial", "telefone", "video", "publike"] as const;

async function cliente(): Promise<ClienteBanco | null> {
  const admin = await clienteAdminOuNulo();
  if (admin) return admin;
  return await criarClienteServidor();
}

export async function criarAgenda(dados: {
  anuncio: string;
  horarios: string;
  duracao: number;
  formato: string;
  local: string;
  obs: string;
}): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const c = await cliente();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(dados.anuncio)) return { ok: false, erro: "Escolha a vaga." };
  if (!FORMATOS.includes(dados.formato as (typeof FORMATOS)[number]))
    return { ok: false, erro: "Escolha como vai ser a entrevista." };
  const { horarios, erros } = horariosDoTexto(dados.horarios, dados.duracao);
  if (erros.length)
    return { ok: false, erro: `Não entendi: ${erros.slice(0, 3).join(" · ")}` };
  if (!horarios.length)
    return {
      ok: false,
      erro: "Ponha pelo menos um horário daqui a mais de 1 hora.",
    };
  const { data, error } = await c.rpc("admin_agenda_criar", {
    p_anuncio: dados.anuncio,
    p_horarios: horarios,
    p_formato: dados.formato,
    p_local: dados.local.trim() || null,
    p_obs: dados.obs.trim() || null,
    p_duracao: dados.duracao,
  });
  if (error || !data)
    return {
      ok: false,
      erro: mensagemDeErro(error, "Não deu para criar a agenda."),
    };
  return { ok: true, id: data };
}

export async function maisHorarios(
  agenda: string,
  texto: string,
  duracao: number,
): Promise<Resultado> {
  const c = await cliente();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(agenda)) return { ok: false, erro: "Pedido inválido." };
  const { horarios, erros } = horariosDoTexto(texto, duracao);
  if (erros.length)
    return { ok: false, erro: `Não entendi: ${erros.slice(0, 3).join(" · ")}` };
  if (!horarios.length)
    return {
      ok: false,
      erro: "Ponha pelo menos um horário daqui a mais de 1 hora.",
    };
  const { error } = await c.rpc("admin_agenda_horarios", {
    p_agenda: agenda,
    p_mais: horarios,
  });
  if (error)
    return {
      ok: false,
      erro: mensagemDeErro(error, "Não deu para pôr os horários."),
    };
  refresh();
  return {
    ok: true,
    mensagem: `${horarios.length === 1 ? "1 horário entrou" : `${horarios.length} horários entraram`}.`,
  };
}

export async function tirarHorario(
  agenda: string,
  horario: number,
): Promise<Resultado> {
  const c = await cliente();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(agenda) || !Number.isSafeInteger(horario))
    return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.rpc("admin_agenda_horarios", {
    p_agenda: agenda,
    p_tirar: [horario],
  });
  if (error)
    return {
      ok: false,
      erro: mensagemDeErro(error, "Não deu para tirar o horário."),
    };
  refresh();
  return { ok: true };
}

export async function aprovarNaAgenda(
  agenda: string,
  perfis: string[],
): Promise<Resultado> {
  const c = await cliente();
  if (!c) return { ok: false, erro: FORA };
  const lista = perfis.filter((p) => UUID.test(p)).slice(0, 200);
  if (!UUID.test(agenda) || !lista.length)
    return { ok: false, erro: "Marque quem chamar." };
  const { data, error } = await c.rpc("admin_agenda_aprovar", {
    p_agenda: agenda,
    p_perfis: lista,
  });
  if (error)
    return {
      ok: false,
      erro: mensagemDeErro(error, "Não deu para pôr na fila."),
    };
  refresh();
  const n = Number(data) || 0;
  return {
    ok: true,
    mensagem: n
      ? `${n === 1 ? "1 pessoa entrou" : `${n} pessoas entraram`} na fila. O robô chama em ondas, das 8h às 20h, de segunda a sábado.`
      : "Ninguém novo entrou na fila.",
  };
}

export async function tirarDaAgenda(convite: number): Promise<Resultado> {
  const c = await cliente();
  if (!c) return { ok: false, erro: FORA };
  if (!Number.isSafeInteger(convite))
    return { ok: false, erro: "Pedido inválido." };
  const { data, error } = await c.rpc("admin_agenda_tirar", {
    p_convite: convite,
  });
  if (error || !data)
    return {
      ok: false,
      erro: mensagemDeErro(error, "Só sai da fila quem ainda não foi chamado."),
    };
  refresh();
  return { ok: true };
}

export async function resultadoDaEntrevista(
  convite: number,
  resultado: string,
): Promise<Resultado> {
  const c = await cliente();
  if (!c) return { ok: false, erro: FORA };
  if (
    !Number.isSafeInteger(convite) ||
    !["realizada", "faltou", "confirmada"].includes(resultado)
  )
    return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.rpc("admin_agenda_resultado", {
    p_convite: convite,
    p_resultado: resultado,
  });
  if (error)
    return { ok: false, erro: mensagemDeErro(error, "Não deu para anotar.") };
  refresh();
  return { ok: true };
}

export async function encerrarAgenda(agenda: string): Promise<Resultado> {
  const c = await cliente();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(agenda)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.rpc("admin_agenda_encerrar", { p_agenda: agenda });
  if (error)
    return { ok: false, erro: mensagemDeErro(error, "Não deu para encerrar.") };
  refresh();
  return {
    ok: true,
    mensagem: "Agenda encerrada: quem ainda não tinha marcado saiu da fila.",
  };
}
