// Planilhas (CSV) de candidatos, para abrir no Excel ou no Google Planilhas.

export const SITUACAO_CURTIDA: Record<string, string> = {
  pendente: "Aguardando sua resposta",
  aceita: "Aceito, esperando o currículo",
  match: "Deu match",
  dispensada: "Dispensado",
  desfeito: "Match desfeito",
};

/** Uma célula do CSV: entre aspas, e sem virar fórmula no Excel. */
export function celula(valor: string | null | undefined) {
  let v = String(valor ?? "")
    .replace(/\r?\n/g, " ")
    .trim();
  if (/^[=+\-@\t]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

export function dataHora(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** "candidatos-auxiliar-de-padaria.csv": sem acento nem espaço. */
export function nomeDoArquivo(titulo: string) {
  const base = titulo
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `candidatos-${base || "vaga"}.csv`;
}

/** BOM + ponto e vírgula: o Excel em português abre com acentos e colunas certas. */
export function respostaCsv(cabecalho: string[], linhas: (string | null | undefined)[][], arquivo: string) {
  const corpo = "﻿" + [cabecalho, ...linhas].map((l) => l.map(celula).join(";")).join("\r\n") + "\r\n";
  return new Response(corpo, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${arquivo}"`,
      "cache-control": "private, no-store",
    },
  });
}
