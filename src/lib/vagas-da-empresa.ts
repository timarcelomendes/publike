import { formatarLugar, plural } from "./formato";
import { valorEmDuas } from "./valor-do-tiquete";

// A página de vagas da empresa e o kit de divulgação (claude/plano-pagina-de-vagas.md): o valor curto de cada vaga e
// o texto pronto para o WhatsApp e os grupos, com a lista das vagas e o link da página.

export type VagaParaTexto = {
  tipo: string;
  titulo: string;
  pagamento_valor: number | null;
  pagamento_ate?: number | null;
  pagamento_unidade: string | null;
  bairro: string | null;
  cidade: string;
};

/** "R$ 1.890 por mês" ou "A combinar": sem os extras, para caber numa linha. */
export function valorCurto(v: VagaParaTexto) {
  const d = valorEmDuas(v);
  return d.unidade ? `${d.valor} ${d.unidade}` : d.valor;
}

/**
 * O link da página de vagas com a origem (quem cria a conta por ele aparece em Admin › Campanhas). Com a página de
 * carreiras liberada e um apelido, o endereço curto (publike.org/v/apelido).
 */
export function linkDasVagas(site: string, perfilId: string, origem: string, apelido?: string | null) {
  const caminho = apelido ? `/v/${apelido}` : `/perfil/${perfilId}/vagas`;
  return `${site}${caminho}?utm_source=${origem}&utm_campaign=vagas-empresa`;
}

/**
 * O texto pronto para mandar no WhatsApp e nos grupos: o nome, cada vaga numa linha (o cargo, o valor e o bairro)
 * e o link. Com mais de `max` vagas, "e mais N vagas". `curto`: só o nome, quantas e o link.
 */
export function textoDasVagas(
  nome: string,
  vagas: VagaParaTexto[],
  link: string,
  { max = 10, curto = false }: { max?: number; curto?: boolean } = {},
) {
  if (curto || !vagas.length) {
    const quantas = vagas.length ? plural(vagas.length, "vaga aberta", "vagas abertas") : "Vagas";
    return `${nome} está contratando: ${quantas} no Publike. Candidate-se de graça: ${link}`;
  }
  const linhas = vagas
    .slice(0, max)
    .map((v) => `• ${v.titulo}: ${valorCurto(v)}, ${formatarLugar(v.bairro, v.cidade)}`);
  const resto = vagas.length - linhas.length;
  return [
    `*${nome} está contratando* (${plural(vagas.length, "vaga", "vagas")})`,
    "",
    ...linhas,
    ...(resto > 0 ? [`• e mais ${plural(resto, "vaga", "vagas")}`] : []),
    "",
    `Candidate-se de graça no Publike: ${link}`,
  ].join("\n");
}
