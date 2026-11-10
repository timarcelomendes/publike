import "server-only";

import { randomUUID } from "node:crypto";

// Google Meet (Admin › E-mails › Agendar conversa): cria o evento da conversa com um prospect na Google Agenda de quem
// atende, já com a sala do Meet, pela API da Agenda (com o Google mandando o convite, se pedido). Acesso por OAuth da
// própria conta Google (uma vez, pelo OAuth Playground): GOOGLE_MEET_CLIENT_ID, GOOGLE_MEET_CLIENT_SECRET e
// GOOGLE_MEET_REFRESH_TOKEN, com o escopo https://www.googleapis.com/auth/calendar.events. Opcional: GOOGLE_MEET_AGENDA
// (o ID da agenda; sem ele, a principal). As chaves ficam só no servidor.

const env = (nome: string) => (process.env[nome] || "").trim();

/** O Meet está ligado no servidor (as três chaves preenchidas). Nunca devolve as chaves. */
export function meetLigado() {
  return Boolean(env("GOOGLE_MEET_CLIENT_ID") && env("GOOGLE_MEET_CLIENT_SECRET") && env("GOOGLE_MEET_REFRESH_TOKEN"));
}

export type ReuniaoMeet = { url: string; codigo: string; evento: string; convidou: boolean };

let token: { valor: string; ate: number } | null = null;

async function tokenDoGoogle() {
  if (token && token.ate > Date.now() + 60_000) return token.valor;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env("GOOGLE_MEET_CLIENT_ID"),
      client_secret: env("GOOGLE_MEET_CLIENT_SECRET"),
      refresh_token: env("GOOGLE_MEET_REFRESH_TOKEN"),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) {
    // o motivo do Google (nunca as chaves): invalid_client = a chave secreta não confere com o ID; invalid_grant = o
    // refresh token não vale (gerado com outra chave, revogado ou o código no lugar dele)
    const motivo = await r
      .json()
      .then((d: { error?: unknown }) => String(d?.error ?? ""))
      .catch(() => "");
    throw new Error(
      motivo === "invalid_client"
        ? "O Google recusou a chave secreta (invalid_client): confira se GOOGLE_MEET_CLIENT_SECRET é a chave atual do cliente, a mesma do ID."
        : motivo === "invalid_grant"
          ? "O Google recusou o refresh token (invalid_grant): gere outro no OAuth Playground com a chave secreta atual e ponha em GOOGLE_MEET_REFRESH_TOKEN."
          : `O Google não aceitou o acesso à agenda (código ${r.status}${motivo ? `: ${motivo}` : ""}).`,
    );
  }
  const d = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!d.access_token) throw new Error("O Google não devolveu o acesso.");
  token = { valor: d.access_token, ate: Date.now() + (d.expires_in ?? 3600) * 1000 };
  return token.valor;
}

/** "AAAA-MM-DDTHH:MM" + minutos, no mesmo relógio (de Brasília), sem passar por fuso */
function somarMinutos(inicio: string, minutos: number) {
  return new Date(new Date(`${inicio}:00Z`).getTime() + minutos * 60_000).toISOString().slice(0, 19);
}

/**
 * Cria o evento na agenda, no horário de Brasília, com a sala do Meet. Com `convidar`, o prospect entra como convidado
 * e o Google manda o convite (com Aceitar e Recusar) do e-mail de quem atende.
 */
export async function criarReuniaoMeet(p: {
  titulo: string;
  inicio: string; // "AAAA-MM-DDTHH:MM"
  minutos: number;
  descricao: string;
  convidado: string | null;
}): Promise<ReuniaoMeet> {
  const acesso = await tokenDoGoogle();
  const agenda = encodeURIComponent(env("GOOGLE_MEET_AGENDA") || "primary");
  const convidar = Boolean(p.convidado);
  const r = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${agenda}/events?conferenceDataVersion=1&sendUpdates=${convidar ? "all" : "none"}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${acesso}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: p.titulo.slice(0, 200),
        description: p.descricao.slice(0, 4000),
        start: { dateTime: `${p.inicio}:00`, timeZone: "America/Sao_Paulo" },
        end: { dateTime: somarMinutos(p.inicio, p.minutos), timeZone: "America/Sao_Paulo" },
        ...(convidar ? { attendees: [{ email: p.convidado }] } : {}),
        conferenceData: { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!r.ok) {
    const corpo = await r.text().catch(() => "");
    let motivo = "";
    try {
      motivo = String((JSON.parse(corpo) as { error?: { message?: unknown } }).error?.message ?? "");
    } catch {}
    if (r.status === 401) token = null;
    throw new Error(`O Google não criou o evento (código ${r.status}${motivo ? `: ${motivo.slice(0, 160)}` : ""}).`);
  }
  const d = (await r.json()) as {
    hangoutLink?: string;
    htmlLink?: string;
    conferenceData?: { conferenceId?: string; entryPoints?: { entryPointType?: string; uri?: string }[] };
  };
  const url = d.hangoutLink ?? d.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ?? "";
  if (!url) throw new Error("O Google criou o evento, mas sem a sala do Meet. Confira se o Meet está ativo na conta.");
  return { url, codigo: d.conferenceData?.conferenceId ?? "", evento: d.htmlLink ?? "", convidou: convidar };
}
