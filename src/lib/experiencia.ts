// O período de uma experiência do currículo. As datas são opcionais (27/10/2026): quem não lembra o mês, ou
// mandou um PDF sem as datas, salva assim mesmo. Experiência nova guarda `atual`; nas antigas (sem `atual`),
// fim vazio quer dizer "trabalha aqui".

export type Periodo = { inicio: string; fim: string | null; atual?: boolean };

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Trabalha lá agora ("Trabalho aqui"). */
export function trabalhaAqui(e: Periodo) {
  return e.atual ?? (Boolean(e.inicio) && !e.fim);
}

/** Falta alguma data: o mês de entrada, ou o de saída de um trabalho que já acabou. */
export function faltaData(e: Periodo) {
  return !e.inicio || (!trabalhaAqui(e) && !e.fim);
}

/** "2024-03" → "mar/2024" */
export function mesDoCurriculo(valor: string) {
  const [ano, m] = valor.split("-");
  const i = Number(m) - 1;
  return MESES[i] ? `${MESES[i]}/${ano}` : valor;
}

/** "mar/2023 – ago/2024", "mar/2023 – atual", "Trabalha aqui", "até ago/2024", "desde mar/2023" ou "" (sem datas). */
export function textoDoPeriodo(e: Periodo) {
  const atual = trabalhaAqui(e);
  if (e.inicio && (e.fim || atual)) return `${mesDoCurriculo(e.inicio)} – ${atual ? "atual" : mesDoCurriculo(e.fim!)}`;
  if (e.inicio) return `desde ${mesDoCurriculo(e.inicio)}`;
  if (atual) return "Trabalha aqui";
  if (e.fim) return `até ${mesDoCurriculo(e.fim)}`;
  return "";
}

/** Quantos meses durou (o atual, até `hoje`, "AAAA-MM"); null quando falta data. */
export function mesesDoPeriodo(e: Periodo, hoje: string) {
  if (!e.inicio) return null;
  const fim = trabalhaAqui(e) ? hoje : e.fim;
  if (!fim) return null;
  const [a1, m1] = e.inicio.split("-").map(Number);
  const [a2, m2] = fim.split("-").map(Number);
  const total = (a2 - a1) * 12 + (m2 - m1) + 1;
  return Number.isFinite(total) && total >= 1 ? total : null;
}
