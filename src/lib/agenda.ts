// Entrevista na agenda: o convite (.ics) que vai anexo no e-mail e que a pessoa baixa no site,
// e o link "Adicionar ao Google Agenda". Sem dependências: serve no navegador e no servidor.

import { FORMATOS_ENTREVISTA, type FormatoEntrevista } from "./recrutamento";

export type EventoAgenda = {
  /** fixo por entrevista: remarcar troca a hora do mesmo evento, cancelar apaga */
  uid: string;
  inicio: string;
  duracaoMin: number;
  titulo: string;
  descricao: string;
  local: string | null;
  url: string | null;
  cancelado?: boolean;
  /** cresce a cada mudança (a agenda fica com a versão mais nova) */
  sequencia?: number;
};

/** A entrevista como as telas e o e-mail têm. */
export type EntrevistaParaAgenda = {
  id: string;
  quando: string;
  duracao_min?: number | null;
  formato: string;
  local: string | null;
  obs: string | null;
  situacao?: string | null;
  atualizado_em?: string | null;
};

const DURACAO_PADRAO = 30;

/** "20261022T170000Z" */
function dataUtc(d: Date) {
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function fim(e: Pick<EventoAgenda, "inicio" | "duracaoMin">) {
  return new Date(new Date(e.inicio).getTime() + (e.duracaoMin || DURACAO_PADRAO) * 60_000);
}

/** Texto dentro do .ics: barra, vírgula, ponto e vírgula e quebra de linha escapados. */
function escapar(t: string) {
  return t
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/([,;])/g, "\\$1");
}

/** Linhas de no máximo 75 bytes; a continuação começa com espaço (RFC 5545). */
function dobrar(linha: string) {
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  if (bytes(linha) <= 75) return linha;
  const partes: string[] = [];
  let atual = "";
  for (const letra of linha) {
    const limite = partes.length ? 74 : 75;
    if (bytes(atual + letra) > limite) {
      partes.push(atual);
      atual = letra;
    } else atual += letra;
  }
  if (atual) partes.push(atual);
  return partes.map((p, i) => (i ? ` ${p}` : p)).join("\r\n");
}

/** O convite (.ics). `agora` entra no DTSTAMP. */
export function conviteIcs(e: EventoAgenda, agora: Date) {
  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Publike//Entrevistas//PT-BR",
    "CALSCALE:GREGORIAN",
    `METHOD:${e.cancelado ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${dataUtc(agora)}`,
    `DTSTART:${dataUtc(new Date(e.inicio))}`,
    `DTEND:${dataUtc(fim(e))}`,
    `SEQUENCE:${e.sequencia ?? 0}`,
    `STATUS:${e.cancelado ? "CANCELLED" : "CONFIRMED"}`,
    `SUMMARY:${escapar(e.titulo)}`,
    e.descricao ? `DESCRIPTION:${escapar(e.descricao)}` : "",
    e.local ? `LOCATION:${escapar(e.local)}` : "",
    e.url ? `URL:${e.url}` : "",
    // um lembrete 1 hora antes
    ...(e.cancelado
      ? []
      : ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapar(e.titulo)}`, "TRIGGER:-PT1H", "END:VALARM"]),
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return `${linhas.map(dobrar).join("\r\n")}\r\n`;
}

/** O link que abre o Google Agenda com o evento pronto para salvar. */
export function linkGoogleAgenda(e: EventoAgenda) {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: e.titulo,
    dates: `${dataUtc(new Date(e.inicio))}/${dataUtc(fim(e))}`,
    details: e.url ? `${e.descricao}\n\n${e.url}`.trim() : e.descricao,
    ctz: "America/Sao_Paulo",
  });
  if (e.local) q.set("location", e.local);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** O evento de uma entrevista, para quem se candidatou ou para quem publicou. */
export function eventoDaEntrevista(
  e: EntrevistaParaAgenda,
  {
    vaga,
    empresa,
    candidato,
    para,
    url,
  }: {
    vaga: string;
    empresa?: string | null;
    candidato?: string | null;
    para: "candidato" | "empresa";
    url: string | null;
  },
): EventoAgenda {
  const formato = FORMATOS_ENTREVISTA[e.formato as FormatoEntrevista];
  const video = e.formato === "video" && e.local?.startsWith("https://");
  const titulo =
    para === "empresa"
      ? `Entrevista com ${candidato || "o candidato"}: ${vaga}`
      : `Entrevista: ${vaga}${empresa ? ` (${empresa})` : ""}`;
  const descricao = [
    formato ? `${formato.nome}${e.local && !video ? `: ${e.local}` : ""}` : "",
    video && e.local ? `Link da chamada: ${e.local}` : "",
    e.obs ?? "",
    para === "candidato" ? "Confirme a presença no Publike." : "",
  ]
    .filter(Boolean)
    .join("\n");
  const versao = e.atualizado_em ? Math.floor(new Date(e.atualizado_em).getTime() / 1000) : 0;
  return {
    uid: `entrevista-${e.id}@publike`,
    inicio: e.quando,
    duracaoMin: e.duracao_min || DURACAO_PADRAO,
    titulo,
    descricao,
    local: e.formato === "telefone" ? "Por telefone" : e.local,
    url,
    cancelado: e.situacao === "cancelada",
    // segundos desde 2026: cresce a cada mudança e cabe num número pequeno
    sequencia: Math.max(0, versao - 1_767_225_600),
  };
}

/**
 * Do e-mail na fila (dados.entrevista, que o banco põe): o convite que vai anexo.
 * Só entrevista marcada, confirmada ou cancelada (pedir para remarcar não muda a agenda).
 */
export function conviteDoEmail(dados: unknown, site: string, agora: Date) {
  const d = dados && typeof dados === "object" ? (dados as Record<string, unknown>).entrevista : null;
  if (!d || typeof d !== "object") return null;
  const x = d as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" ? v : null);
  const id = texto(x.id);
  const quando = texto(x.quando);
  const situacao = texto(x.situacao);
  const anuncio = texto(x.anuncio_id);
  if (!id || !quando || Number.isNaN(new Date(quando).getTime()) || !anuncio) return null;
  if (!situacao || !["marcada", "confirmada", "cancelada"].includes(situacao)) return null;
  const para = x.para === "empresa" ? "empresa" : "candidato";
  const base = site.replace(/\/+$/, "");
  const evento = eventoDaEntrevista(
    {
      id,
      quando,
      duracao_min: typeof x.duracao_min === "number" ? x.duracao_min : null,
      formato: texto(x.formato) ?? "",
      local: texto(x.local),
      obs: texto(x.obs),
      situacao,
      atualizado_em: texto(x.atualizado_em),
    },
    {
      vaga: texto(x.vaga) ?? "a vaga",
      empresa: texto(x.empresa),
      candidato: texto(x.candidato),
      para,
      url:
        para === "empresa"
          ? `${base}/painel/anuncio/${anuncio}/quadro${texto(x.perfil_id) ? `?candidato=${texto(x.perfil_id)}` : ""}`
          : `${base}/anuncio/${anuncio}`,
    },
  );
  return {
    ics: conviteIcs(evento, agora),
    metodo: evento.cancelado ? ("CANCEL" as const) : ("PUBLISH" as const),
    google: evento.cancelado ? null : linkGoogleAgenda(evento),
  };
}
