// Os documentos da admissão (claude/plano-painel-feed-indicacao-documentos.md, parte 4; migração 20270312120000).
// Depois de aceitar a proposta, o candidato manda a foto ou o PDF de cada item da lista, ou marca "Vou levar no primeiro
// dia". A empresa baixa tudo num .zip para o contador. Os arquivos somem 7 dias depois da entrega ao contador ou 30 dias
// depois do primeiro dia. Sem IA: a foto do documento não sai do Publike.

export const BUCKET_DOCUMENTOS = "documentos-admissao";
export const MAX_ARQUIVOS_POR_ITEM = 4;
export const MAX_MB_DOCUMENTO = 10;
export const TIPOS_DOCUMENTO = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf";

export type ItemDocumento = {
  item: string;
  /** a carteira (digital) e o exame (a empresa marca) não são arquivo */
  seEnvia: boolean;
  situacao: "enviado" | "levar" | null;
  arquivos: number;
  caminhos: string[];
};

export type DocumentosDaProposta = {
  propostaId: string;
  anuncioId: string;
  perfilId: string;
  inicio: string;
  aceiteEm: string | null;
  entreguesEm: string | null;
  apagadosEm: string | null;
  venceEm: string;
  /** os arquivos já venceram ou foram apagados: ninguém abre mais */
  vencido: boolean;
  itens: ItemDocumento[];
};

const texto = (x: unknown) => (typeof x === "string" && x ? x : null);

export function lerDocumentos(x: unknown): DocumentosDaProposta | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.proposta_id !== "string") return null;
  const itens = Array.isArray(o.itens) ? o.itens : [];
  return {
    propostaId: o.proposta_id,
    anuncioId: String(o.anuncio_id),
    perfilId: String(o.perfil_id),
    inicio: String(o.inicio).slice(0, 10),
    aceiteEm: texto(o.aceite_em),
    entreguesEm: texto(o.entregues_em),
    apagadosEm: texto(o.apagados_em),
    venceEm: String(o.vence_em),
    vencido: o.vencido === true,
    itens: itens.flatMap((i): ItemDocumento[] => {
      if (!i || typeof i !== "object") return [];
      const r = i as Record<string, unknown>;
      if (typeof r.item !== "string") return [];
      return [
        {
          item: r.item,
          seEnvia: r.se_envia !== false,
          situacao: r.situacao === "enviado" || r.situacao === "levar" ? r.situacao : null,
          arquivos: Number(r.arquivos ?? 0),
          caminhos: Array.isArray(r.caminhos) ? r.caminhos.filter((c): c is string => typeof c === "string") : [],
        },
      ];
    }),
  };
}

/** "7 de 9": os itens que são arquivo, e quantos já foram enviados (ou a pessoa vai levar). */
export function contaDosDocumentos(d: Pick<DocumentosDaProposta, "itens">) {
  const daLista = d.itens.filter((i) => i.seEnvia);
  return {
    total: daLista.length,
    enviados: daLista.filter((i) => i.situacao === "enviado").length,
    levar: daLista.filter((i) => i.situacao === "levar").length,
    faltam: daLista.filter((i) => !i.situacao).length,
  };
}

/** O que não se pede na admissão (o mesmo filtro do banco, para avisar antes). */
export function documentoProibido(item: string): string | null {
  if (/(gravidez|gesta[cç]|gr[aá]vida|beta.?hcg|esteriliza|laqueadura|vasectomia)/i.test(item))
    return "Atestado de gravidez ou de esterilização não pode ser pedido (Lei 9.029/1995).";
  if (/(antecedentes|criminal|criminais|nada consta)/i.test(item))
    return "Certidão de antecedentes criminais só vale quando a lei ou a função justifica (TST). Fale com o seu contador.";
  return null;
}

/** O nome do arquivo no .zip: "02 Comprovante de endereço (1).jpg" */
export function nomeNoZip(ordem: number, item: string, parte: number, partes: number, caminho: string) {
  const ext = /\.([a-z0-9]{2,5})$/i.exec(caminho)?.[1]?.toLowerCase() ?? "jpg";
  const limpo = item
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return `${String(ordem).padStart(2, "0")} ${limpo}${partes > 1 ? ` (${parte})` : ""}.${ext}`;
}

/** A extensão do arquivo que a pessoa escolheu (para o caminho no Storage). */
export function extensaoDoArquivo(tipo: string) {
  if (tipo === "application/pdf") return "pdf";
  if (tipo === "image/png") return "png";
  if (tipo === "image/webp") return "webp";
  return "jpg";
}
