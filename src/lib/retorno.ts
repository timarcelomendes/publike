// Retorno a quem não seguiu (claude/plano-retorno-e-whatsapp.md, parte 1; migração 20261230120000): o texto
// que a pessoa dispensada recebe 15 minutos depois (das 8h às 20h), pelo sino, pelo celular e pelo e-mail. A
// conta escolhe o texto ou desliga; sem escolha, vale o padrão (o mesmo de privado.retorno_padrao).

export const RETORNO_PADRAO =
  "Oi, {nome}! Obrigado pelo interesse na vaga de {vaga}. Desta vez {empresa} não vai seguir com a sua candidatura. Continue procurando: tem vagas parecidas perto de você.";

export const RETORNO_MIN = 20;
export const RETORNO_MAX = 400;

export type RetornoDaConta = { ligado: boolean; texto: string | null; padrao: string };

/** O texto com o primeiro nome, a vaga e a empresa (como o banco monta). */
export function montarRetorno(texto: string | null, d: { nome: string; vaga: string; empresa: string }) {
  return (texto || RETORNO_PADRAO)
    .replaceAll("{nome}", d.nome.split(" ")[0] ?? "")
    .replaceAll("{vaga}", d.vaga)
    .replaceAll("{empresa}", d.empresa);
}

/** O que há de errado no texto (null: pode salvar). A mesma regra do banco. */
export function problemaDoRetorno(texto: string): string | null {
  const t = texto.replace(/\s+/g, " ").trim();
  if (t.length < RETORNO_MIN || t.length > RETORNO_MAX)
    return `O texto precisa ter de ${RETORNO_MIN} a ${RETORNO_MAX} letras.`;
  if (/(https?:\/\/|www\.|[\w.%+-]+@[\w.-]+\.[a-z]{2,}|\d[\d ().-]{7,}\d)/i.test(t))
    return "Tire telefone, e-mail e link do texto.";
  return null;
}
