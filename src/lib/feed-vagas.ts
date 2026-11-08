// A vaga em mais sites (claude/plano-painel-feed-indicacao-documentos.md, parte 2): o arquivo /feed/vagas.xml, com as
// vagas no ar de todas as empresas que deixam, e onde cada vaga aparece. Vale no navegador e no servidor.

import { SITE_URL } from "./config";
import { REGIMES } from "./constantes";
import { formatarMoeda } from "./formato";
import type { Regime } from "./tipos";

/**
 * Os sites que já leem o arquivo de vagas, na ordem em que aparecem para a empresa. Entra aqui só quando o site
 * confirmar que lê (o Marcelo avisa): nada de prometer o que não está no ar.
 */
export const SITES_QUE_LEEM_O_FEED: { id: string; nome: string }[] = [];

/** "No Publike e no Google Vagas" / "No Publike, no Google Vagas e no Jooble". */
export function ondeAVagaAparece(emOutrosSites: boolean) {
  const lugares = ["no Publike", "no Google Vagas", ...(emOutrosSites ? SITES_QUE_LEEM_O_FEED.map((s) => `no ${s.nome}`) : [])];
  const texto = lugares.length === 2 ? lugares.join(" e ") : `${lugares.slice(0, -1).join(", ")} e ${lugares.at(-1)}`;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export type VagaDoFeed = {
  id: string;
  titulo: string;
  descricao: string;
  regime: string | null;
  jornada: string | null;
  pagamento_valor: number | null;
  pagamento_ate: number | null;
  pagamento_unidade: string | null;
  cidade: string;
  bairro: string | null;
  empresa: string | null;
  criado_em: string;
  atualizado_em: string;
  expira_em: string;
};

const UNIDADE: Record<string, string> = { hora: "por hora", dia: "por dia", semana: "por semana", mes: "por mês" };

/** "12.11.2026", como o Jooble pede (DD.MM.AAAA). */
function data(iso: string) {
  const [a, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso)).split("-");
  return `${d}.${m}.${a}`;
}

/** O texto vai dentro de CDATA: o único jeito de quebrar é "]]>". */
function cdata(texto: string) {
  return `<![CDATA[${texto.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

function salario(v: VagaDoFeed) {
  if (v.pagamento_valor == null) return null;
  const valor =
    v.pagamento_ate && v.pagamento_ate > v.pagamento_valor
      ? `${formatarMoeda(v.pagamento_valor)} a ${formatarMoeda(v.pagamento_ate)}`
      : formatarMoeda(v.pagamento_valor);
  return `${valor}${v.pagamento_unidade && UNIDADE[v.pagamento_unidade] ? ` ${UNIDADE[v.pagamento_unidade]}` : ""}`;
}

/** O XML do arquivo, para o site `fonte` (vai no utm_source do link). */
export function xmlDoFeed(vagas: VagaDoFeed[], fonte: string) {
  const origem = fonte.replace(/[^a-z0-9-]/gi, "").slice(0, 30) || "feed";
  const itens = vagas.map((v) => {
    const link = `${SITE_URL}/anuncio/${v.id}?utm_source=${origem}&utm_campaign=feed`;
    const regiao = [v.bairro, v.cidade, "GO"].filter(Boolean).join(", ");
    const descricao = v.descricao
      .split(/\n{2,}/)
      .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`)
      .join("");
    const tipo = v.regime ? (REGIMES[v.regime as Regime]?.nome ?? null) : null;
    const s = salario(v);
    return [
      `  <job id="${v.id}">`,
      `    <link>${cdata(link)}</link>`,
      `    <name>${cdata(v.titulo)}</name>`,
      `    <region>${cdata(regiao)}</region>`,
      `    <description>${cdata(descricao)}</description>`,
      s ? `    <salary>${cdata(s)}</salary>` : null,
      v.empresa ? `    <company>${cdata(v.empresa)}</company>` : null,
      `    <pubdate>${data(v.criado_em)}</pubdate>`,
      `    <updated>${data(v.atualizado_em)}</updated>`,
      `    <expire>${data(v.expira_em)}</expire>`,
      tipo ? `    <jobtype>${cdata(v.jornada === "meio_periodo" ? `${tipo}, meio período` : tipo)}</jobtype>` : null,
      `  </job>`,
    ]
      .filter(Boolean)
      .join("\n");
  });
  return `<?xml version="1.0" encoding="utf-8"?>\n<jobs>\n${itens.join("\n")}\n</jobs>\n`;
}
