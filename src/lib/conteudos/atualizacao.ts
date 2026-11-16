import type { BlocoConteudo, Conteudo, FonteConteudo } from "./tipos";

// A versão atualizada de um artigo (migração 20270705120000): o título, a descrição, os blocos e as fontes, no mesmo
// formato do artigo do repositório. Lida do banco (o que o admin publicou) e da IA (o rascunho): nada entra sem
// passar por aqui.

export type DadosDoConteudo = Pick<Conteudo, "titulo" | "descricao" | "blocos" | "fontes">;

const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() && v.length <= max ? v : null);

function lerBloco(v: unknown): BlocoConteudo | null {
  if (!v || typeof v !== "object") return null;
  const b = v as Record<string, unknown>;
  switch (b.t) {
    case "p":
    case "h2": {
      const t = texto(b.texto, 3000);
      return t ? { t: b.t, texto: t } : null;
    }
    case "lista": {
      const itens = Array.isArray(b.itens) ? b.itens.map((i) => texto(i, 1000)) : [];
      return itens.length && itens.every(Boolean) ? { t: "lista", itens: itens as string[] } : null;
    }
    case "numero": {
      const valor = texto(b.valor, 40);
      const rotulo = texto(b.rotulo, 200);
      const fonte = typeof b.fonte === "number" && Number.isInteger(b.fonte) && b.fonte >= 1 ? b.fonte : null;
      return valor && rotulo && fonte ? { t: "numero", valor, rotulo, fonte } : null;
    }
    case "chamada": {
      const titulo = texto(b.titulo, 120);
      const t = texto(b.texto, 400);
      const botao = texto(b.botao, 60);
      const href = typeof b.href === "string" && /^\/[^\s]*$/.test(b.href) ? b.href : null;
      return titulo && t && botao && href ? { t: "chamada", titulo, texto: t, botao, href } : null;
    }
    default:
      return null;
  }
}

function lerFonte(v: unknown): FonteConteudo | null {
  if (!v || typeof v !== "object") return null;
  const f = v as Record<string, unknown>;
  const titulo = texto(f.titulo, 300);
  const url = typeof f.url === "string" && /^https:\/\/\S+$/.test(f.url) && f.url.length <= 500 ? f.url : null;
  const data = typeof f.data === "string" && f.data.length <= 20 ? f.data : "";
  return titulo && url ? { titulo, url, data } : null;
}

/** Os dados de uma versão do artigo, conferidos; null se algo não estiver no formato. */
export function lerDadosDoConteudo(v: unknown): DadosDoConteudo | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  const titulo = texto(d.titulo, 160);
  const descricao = texto(d.descricao, 400);
  if (!titulo || !descricao || !Array.isArray(d.blocos) || !Array.isArray(d.fontes)) return null;
  const blocos = d.blocos.map(lerBloco);
  const fontes = d.fontes.map(lerFonte);
  if (!blocos.length || blocos.some((b) => !b) || fontes.some((f) => !f)) return null;
  const lidos = blocos as BlocoConteudo[];
  // o número em destaque aponta para uma fonte que existe
  if (lidos.some((b) => b.t === "numero" && b.fonte > fontes.length)) return null;
  return { titulo, descricao, blocos: lidos, fontes: fontes as FonteConteudo[] };
}

/** A versão nova tem os mesmos blocos, na mesma ordem e do mesmo tipo (só o texto e os números mudam). */
export function mesmaEstrutura(a: BlocoConteudo[], b: BlocoConteudo[]) {
  return a.length === b.length && a.every((x, i) => x.t === b[i].t);
}

/** O texto de um bloco, para comparar e mostrar no admin. */
export function textoDoBloco(b: BlocoConteudo): string {
  switch (b.t) {
    case "p":
    case "h2":
      return b.texto;
    case "lista":
      return b.itens.map((i) => `• ${i}`).join("\n");
    case "numero":
      return `${b.valor} · ${b.rotulo} (fonte ${b.fonte})`;
    case "chamada":
      return `${b.titulo} · ${b.texto} · ${b.botao} (${b.href})`;
  }
}
