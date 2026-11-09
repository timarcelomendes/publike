import { ROTAS_COM_SEGREDO } from "@/lib/google-ads";

// Os avisos da política de scripts (claude/plano-seguranca.md, item 1): o navegador conta o que bloquearia. Aqui o
// aviso vira três coisas curtas, sem dado da pessoa: a regra, de onde vinha o que seria bloqueado e a página.

export type AvisoCsp = { diretiva: string; bloqueado: string; pagina: string };

const PALAVRAS = new Set(["inline", "eval", "data", "blob", "self", "wasm-eval", "trusted-types-policy", "trusted-types-sink"]);

/** O que seria bloqueado: a palavra do navegador (inline, eval…) ou só a origem do endereço. */
function deOndeVem(valor: unknown): string | null {
  if (typeof valor !== "string" || !valor.trim()) return null;
  const v = valor.trim();
  if (PALAVRAS.has(v)) return v;
  // extensões do navegador da pessoa não são do site: ficam de fora
  if (/^(chrome|moz|safari|ms-browser)-extension:/i.test(v)) return null;
  try {
    const url = new URL(v);
    if (url.protocol === "data:" || url.protocol === "blob:") return url.protocol.slice(0, -1);
    return url.origin === "null" ? url.protocol.slice(0, -1) : url.origin;
  } catch {
    return v.slice(0, 60);
  }
}

/** A página: só o caminho, sem a busca e com o segredo dos links trocado por :token. */
function daPagina(valor: unknown): string | null {
  if (typeof valor !== "string" || !valor) return null;
  try {
    const url = new URL(valor);
    return url.pathname.replace(ROTAS_COM_SEGREDO, (_tudo, rota: string) => `/${rota}/:token`).slice(0, 200) || "/";
  } catch {
    return null;
  }
}

function daDiretiva(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const d = valor.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return /^[a-z-]{2,60}$/.test(d) ? d : null;
}

function montar(diretiva: unknown, bloqueado: unknown, pagina: unknown): AvisoCsp | null {
  const d = daDiretiva(diretiva);
  const b = deOndeVem(bloqueado);
  const p = daPagina(pagina);
  return d && b && p ? { diretiva: d, bloqueado: b, pagina: p } : null;
}

/** Os avisos do corpo, nos dois formatos dos navegadores (report-uri e Reporting API). No máximo 20 por pedido. */
export function lerAvisosCsp(corpo: unknown): AvisoCsp[] {
  const avisos: AvisoCsp[] = [];
  const lista = Array.isArray(corpo) ? corpo : [corpo];
  for (const item of lista.slice(0, 20)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    // report-uri: {"csp-report": {...}}
    const antigo = o["csp-report"] as Record<string, unknown> | undefined;
    if (antigo && typeof antigo === "object") {
      const a = montar(antigo["effective-directive"] ?? antigo["violated-directive"], antigo["blocked-uri"], antigo["document-uri"]);
      if (a) avisos.push(a);
      continue;
    }
    // Reporting API: [{"type": "csp-violation", "body": {...}}]
    if (o.type === "csp-violation" && o.body && typeof o.body === "object") {
      const b = o.body as Record<string, unknown>;
      const a = montar(b.effectiveDirective, b.blockedURL, b.documentURL ?? o.url);
      if (a) avisos.push(a);
    }
  }
  return avisos;
}
