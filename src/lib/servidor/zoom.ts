import "server-only";

// Zoom (Admin › E-mails › Agendar conversa): cria a reunião de cada conversa com um prospect pela API do Zoom, com
// um app "Server-to-Server OAuth" da conta (marketplace.zoom.us › Develop › Build App). As chaves ficam só no
// servidor: ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID e ZOOM_CLIENT_SECRET (e, se o app for da conta e não do usuário,
// ZOOM_USUARIO com o e-mail de quem abre a reunião). O escopo pedido é o de criar reuniões
// (meeting:write:meeting:admin, ou meeting:write:meeting no app de usuário).

const env = (nome: string) => (process.env[nome] || "").trim();

/** O Zoom está ligado no servidor (as três chaves preenchidas). Nunca devolve as chaves. */
export function zoomLigado() {
  return Boolean(env("ZOOM_ACCOUNT_ID") && env("ZOOM_CLIENT_ID") && env("ZOOM_CLIENT_SECRET"));
}

export type ReuniaoZoom = { url: string; id: string; senha: string };

let token: { valor: string; ate: number } | null = null;

async function tokenDoZoom() {
  if (token && token.ate > Date.now() + 60_000) return token.valor;
  const basico = Buffer.from(`${env("ZOOM_CLIENT_ID")}:${env("ZOOM_CLIENT_SECRET")}`).toString("base64");
  const r = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(env("ZOOM_ACCOUNT_ID"))}`,
    { method: "POST", headers: { Authorization: `Basic ${basico}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) },
  );
  if (!r.ok) throw new Error(r.status === 400 || r.status === 401 ? "O Zoom não aceitou as chaves do app." : `O Zoom não respondeu (código ${r.status}).`);
  const d = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!d.access_token) throw new Error("O Zoom não devolveu o acesso.");
  token = { valor: d.access_token, ate: Date.now() + (d.expires_in ?? 3600) * 1000 };
  return token.valor;
}

/** "734 999 8883" */
export function idDoZoom(id: string | number) {
  const n = String(id).replace(/\D/g, "");
  return n.length === 10 ? `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}` : n.length === 11 ? `${n.slice(0, 3)} ${n.slice(3, 7)} ${n.slice(7)}` : n;
}

/** Cria a reunião no horário (de Brasília) e devolve o link de entrar, o ID e a senha. */
export async function criarReuniaoZoom(p: {
  titulo: string;
  inicio: string; // "AAAA-MM-DDTHH:MM"
  minutos: number;
  pauta: string;
}): Promise<ReuniaoZoom> {
  const acesso = await tokenDoZoom();
  const usuario = encodeURIComponent(env("ZOOM_USUARIO") || "me");
  const r = await fetch(`https://api.zoom.us/v2/users/${usuario}/meetings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${acesso}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: p.titulo.slice(0, 200),
      type: 2,
      start_time: `${p.inicio}:00`,
      timezone: "America/Sao_Paulo",
      duration: p.minutos,
      agenda: p.pauta.slice(0, 2000),
      settings: { join_before_host: false, waiting_room: true, mute_upon_entry: true },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) {
    const corpo = await r.text().catch(() => "");
    let motivo = "";
    try {
      motivo = String((JSON.parse(corpo) as { message?: unknown }).message ?? "");
    } catch {}
    if (r.status === 401) token = null;
    throw new Error(`O Zoom não criou a reunião (código ${r.status}${motivo ? `: ${motivo.slice(0, 160)}` : ""}).`);
  }
  const d = (await r.json()) as { id?: number; join_url?: string; password?: string };
  if (!d.join_url || !d.id) throw new Error("O Zoom não devolveu o link da reunião.");
  return { url: d.join_url, id: idDoZoom(d.id), senha: d.password ?? "" };
}
