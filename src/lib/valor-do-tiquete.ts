import { formatarMoeda } from "./formato";

// O valor no canhoto do tíquete (linha do tempo da home e a prévia do Publicar): o número grande e,
// embaixo, o que ele quer dizer ("até R$ 2.100", "por mês").

export const POR_UNIDADE: Record<string, string> = {
  hora: "por hora",
  dia: "a diária",
  semana: "por semana",
  mes: "por mês",
  m2: "por m²",
  visita: "a visita",
  servico: "pelo serviço",
};

/** Os benefícios mais comuns, curtos, para caber na linha das etiquetas. */
export const BENEFICIO_CURTO: Record<string, string> = {
  vale_transporte: "VT",
  vale_refeicao: "VR",
  vale_alimentacao: "VA",
};

/** O valor grande e o que ele quer dizer, em duas partes ("R$ 1.800" e "por mês"). */
export function valorEmDuas(a: {
  tipo: string;
  pagamento_valor: number | null;
  pagamento_ate?: number | null;
  pagamento_unidade: string | null;
}) {
  if (a.pagamento_valor == null || !a.pagamento_unidade) return { valor: "A combinar", unidade: null, partes: [] };
  const ate = a.pagamento_ate != null && a.pagamento_ate > a.pagamento_valor ? a.pagamento_ate : null;
  // no serviço, "a partir de" já diz tudo quando o valor é pelo serviço
  const unidade =
    a.tipo === "servico" && a.pagamento_unidade === "servico" ? null : (POR_UNIDADE[a.pagamento_unidade] ?? null);
  const partes = [
    a.tipo === "servico" ? "a partir de" : null,
    ate ? `até ${formatarMoeda(ate)}` : null,
    unidade,
  ].filter((p): p is string => Boolean(p));
  return { valor: formatarMoeda(a.pagamento_valor), unidade: partes.join(" · "), partes };
}
