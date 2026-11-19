import type { ReactNode } from "react";

// Admin › WhatsApp › Conversas (19/11/2026; Marcelo: "melhore essa tela [...] só preciso de algo mais fácil de lidar"):
// as peças da conversa, para ler como no WhatsApp.

const FUSO = "America/Sao_Paulo";

/** "10:45" no horário de Brasília. */
export function horaDaMensagem(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** O dia, para separar a conversa: "Hoje", "Ontem" ou "17/11". */
export function diaDaMensagem(iso: string, agora: number) {
  const dia = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date(t));
  const d = dia(new Date(iso).getTime());
  if (d === dia(agora)) return "Hoje";
  if (d === dia(agora - 86_400_000)) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" }).format(new Date(iso));
}

/** Na lista: a hora (hoje), "ontem" ou a data. */
export function quandoNaLista(iso: string, agora: number) {
  const dia = diaDaMensagem(iso, agora);
  return dia === "Hoje" ? horaDaMensagem(iso) : dia === "Ontem" ? "ontem" : dia;
}

/** As iniciais do nome, num círculo (a mesma pessoa cai sempre no mesmo tom). */
export function Iniciais({ nome, chave }: { nome: string | null; chave: string }) {
  const tons = ["bg-avatar-cerrado", "bg-avatar-petroleo", "bg-avatar-ameixa", "bg-avatar-ocre", "bg-avatar-grafite"];
  let h = 0;
  for (const c of chave) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const letras = (nome ?? "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      aria-hidden
      className={`grid size-10 shrink-0 place-items-center rounded-full text-label text-on-avatar ${tons[h % tons.length]}`}
    >
      {letras || "?"}
    </span>
  );
}

const LINK = /(https?:\/\/[^\s]+)/g;
const MARCAS = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;

/** O texto como o WhatsApp mostra: *negrito*, _itálico_, ~riscado~ e os links clicáveis. */
export function TextoDoWhatsapp({ texto }: { texto: string }) {
  const partes: ReactNode[] = [];
  texto.split(LINK).forEach((pedaco, i) => {
    if (i % 2 === 1) {
      partes.push(
        <a key={`l${i}`} href={pedaco} target="_blank" rel="noreferrer" className="underline [overflow-wrap:anywhere]">
          {pedaco.replace(/^https?:\/\/(www\.)?/, "")}
        </a>,
      );
      return;
    }
    pedaco.split(MARCAS).forEach((p, j) => {
      const k = `t${i}-${j}`;
      if (j % 2 === 0) partes.push(p);
      else if (p.startsWith("*")) partes.push(<strong key={k}>{p.slice(1, -1)}</strong>);
      else if (p.startsWith("_")) partes.push(<em key={k}>{p.slice(1, -1)}</em>);
      else partes.push(<s key={k}>{p.slice(1, -1)}</s>);
    });
  });
  return <span className="whitespace-pre-line [overflow-wrap:anywhere]">{partes}</span>;
}

/** Tira as marcas para a prévia da lista ("*grátis*" vira "grátis"). */
export function semMarcas(texto: string) {
  return texto.replace(/[*_~](\S[^*_~\n]*?\S|\S)[*_~]/g, "$1").replace(/\s+/g, " ").trim();
}

/** A resposta guardada leva os botões que foram junto entre colchetes, no fim ("[Botões: A · B]", "[Botão: Ver vagas]"). */
const MARCA_DOS_BOTOES = /\s*\[Bot(?:ão|ões):([^\]]*)\]?\s*$/;
export function separarBotoes(texto: string) {
  const m = texto.match(MARCA_DOS_BOTOES);
  if (!m) return { texto, botoes: [] as string[] };
  return {
    texto: texto.slice(0, m.index).trimEnd(),
    botoes: m[1]
      .split("·")
      .map((b) => b.trim())
      .filter(Boolean),
  };
}
