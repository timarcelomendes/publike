// A vaga em mais sites (claude/plano-painel-feed-indicacao-documentos.md, parte 2): o arquivo /feed/vagas.xml, com as
// vagas no ar de todas as empresas que deixam, e onde cada vaga aparece. Vale no navegador e no servidor.

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
