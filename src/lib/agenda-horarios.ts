// Os horários da agenda de entrevistas (Admin › Entrevistas; migração 20271013120000), do jeito que a empresa passa:
// uma linha por dia, com a faixa ou os horários soltos. Exemplos que valem:
//   02/12 14h-17h · 2/12 14:00 às 17:00 · terça e quarta 9h às 11h30 · amanhã 9h, 10h, 11h · sexta 14h30
// A faixa vira horários de `duracao` minutos (14h-17h com 30 min: 14h, 14h30 … 16h30). Tudo no horário de Brasília
// (sem horário de verão: -03:00). Só o que fica a mais de 1 hora de agora.

/** Como a entrevista acontece (privado.agendas.formato). */
export const FORMATOS_DA_AGENDA = [
  { valor: "presencial", nome: "Presencial" },
  { valor: "telefone", nome: "Por telefone" },
  { valor: "video", nome: "Link de vídeo (Meet, Zoom…)" },
  { valor: "publike", nome: "Vídeo pelo Publike" },
] as const;

const DIAS: Record<string, number> = {
  dom: 0,
  domingo: 0,
  seg: 1,
  segunda: 1,
  ter: 2,
  terca: 2,
  qua: 3,
  quarta: 3,
  qui: 4,
  quinta: 4,
  sex: 5,
  sexta: 5,
  sab: 6,
  sabado: 6,
};
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const FUSO_MS = 3 * 3600_000;

const semAcento = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** O dia de hoje em Brasília (ano, mês 1-12, dia, dia da semana). */
function hojeEmBrasilia(agora: Date) {
  const d = new Date(agora.getTime() - FUSO_MS);
  return {
    ano: d.getUTCFullYear(),
    mes: d.getUTCMonth() + 1,
    dia: d.getUTCDate(),
    semana: d.getUTCDay(),
  };
}

/** O instante de um dia e hora de Brasília. */
function instante(
  ano: number,
  mes: number,
  dia: number,
  hora: number,
  minuto: number,
) {
  return new Date(Date.UTC(ano, mes - 1, dia, hora, minuto) + FUSO_MS);
}

type Dia = { ano: number; mes: number; dia: number };

function somarDias(d: Dia, n: number): Dia {
  const x = new Date(Date.UTC(d.ano, d.mes - 1, d.dia + n));
  return {
    ano: x.getUTCFullYear(),
    mes: x.getUTCMonth() + 1,
    dia: x.getUTCDate(),
  };
}

/** Os dias citados na linha (as datas, os dias da semana, hoje e amanhã) e o resto da linha, sem eles. */
function diasDaLinha(
  linha: string,
  agora: Date,
): { dias: Dia[]; resto: string } {
  const hoje = hojeEmBrasilia(agora);
  const dias: Dia[] = [];
  let resto = linha.replace(
    /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/g,
    (_, d: string, m: string, a?: string) => {
      const dia = Number(d);
      const mes = Number(m);
      if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return " ";
      let ano = a ? (a.length === 2 ? 2000 + Number(a) : Number(a)) : hoje.ano;
      // sem o ano, a data que já passou (mais de 1 dia) é do ano que vem
      if (
        !a &&
        instante(ano, mes, dia, 23, 59).getTime() < agora.getTime() - 86_400_000
      )
        ano += 1;
      dias.push({ ano, mes, dia });
      return " ";
    },
  );
  resto = resto.replace(/\b(hoje|amanha)\b/g, (_, p: string) => {
    dias.push(somarDias(hoje, p === "hoje" ? 0 : 1));
    return " ";
  });
  resto = resto.replace(
    /\b(domingo|dom|segunda|seg|terca|ter|quarta|qua|quinta|qui|sexta|sex|sabado|sab)\b(?:-feira)?/g,
    (_, p: string) => {
      const alvo = DIAS[p];
      dias.push(somarDias(hoje, (alvo - hoje.semana + 7) % 7));
      return " ";
    },
  );
  return { dias, resto };
}

const HORA = String.raw`(\d{1,2})(?:(?::|h)(\d{2}))?\s*h?`;

/** As faixas ("14h-17h", "14:00 às 17:00") e os horários soltos ("9h, 10h30") do resto da linha, em minutos do dia. */
function horasDaLinha(resto: string, duracao: number): number[] {
  const minutos: number[] = [];
  const valida = (h: number, m: number) =>
    h >= 0 && h <= 23 && m >= 0 && m <= 59;
  const sobra = resto.replace(
    new RegExp(`${HORA}\\s*(?:-|–|—|as|a|ate)\\s*${HORA}`, "g"),
    (
      _,
      h1: string,
      m1: string | undefined,
      h2: string,
      m2: string | undefined,
    ) => {
      const ini = Number(h1) * 60 + Number(m1 ?? 0);
      const fim = Number(h2) * 60 + Number(m2 ?? 0);
      if (
        !valida(Number(h1), Number(m1 ?? 0)) ||
        !valida(Number(h2), Number(m2 ?? 0)) ||
        fim <= ini
      )
        return " ";
      for (let t = ini; t + duracao <= fim; t += duracao) minutos.push(t);
      return " ";
    },
  );
  for (const [, h, m1, m2] of sobra.matchAll(
    /(\d{1,2})(?::(\d{2})|h(\d{2})?)/g,
  )) {
    const hh = Number(h);
    const mm = Number(m1 ?? m2 ?? 0);
    if (valida(hh, mm)) minutos.push(hh * 60 + mm);
  }
  return minutos;
}

/**
 * Os horários do texto (uma linha por dia), em ISO com o fuso de Brasília, do mais cedo ao mais tarde, sem repetir e só
 * a partir de 1 hora depois de `agora`; e as linhas que não deu para entender.
 */
export function horariosDoTexto(
  texto: string,
  duracao: number,
  agora: Date = new Date(),
): { horarios: string[]; erros: string[] } {
  const dur = Math.max(10, Math.min(240, Math.round(duracao) || 30));
  const vistos = new Set<number>();
  const erros: string[] = [];
  for (const original of texto.split(/\n+/)) {
    const linha = semAcento(original.trim());
    if (!linha) continue;
    const { dias, resto } = diasDaLinha(linha, agora);
    const minutos = horasDaLinha(resto, dur);
    if (!dias.length || !minutos.length) {
      erros.push(original.trim());
      continue;
    }
    for (const d of dias)
      for (const t of minutos) {
        const quando = instante(
          d.ano,
          d.mes,
          d.dia,
          Math.floor(t / 60),
          t % 60,
        ).getTime();
        if (quando > agora.getTime() + 3600_000) vistos.add(quando);
      }
  }
  const horarios = [...vistos]
    .sort((a, b) => a - b)
    .map((t) => isoDeBrasilia(new Date(t)));
  return { horarios, erros };
}

/** "2026-12-02T14:30:00-03:00" */
export function isoDeBrasilia(d: Date) {
  const b = new Date(d.getTime() - FUSO_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${b.getUTCFullYear()}-${p(b.getUTCMonth() + 1)}-${p(b.getUTCDate())}T${p(b.getUTCHours())}:${p(b.getUTCMinutes())}:00-03:00`;
}

/** "ter, 02/12 às 14h30" (como privado.data_da_entrevista). */
export function rotuloDoHorario(quando: string | Date) {
  const b = new Date(new Date(quando).getTime() - FUSO_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  const min = b.getUTCMinutes();
  return `${SEMANA[b.getUTCDay()]}, ${p(b.getUTCDate())}/${p(b.getUTCMonth() + 1)} às ${b.getUTCHours()}h${min ? p(min) : ""}`;
}

/** O dia de um horário, para agrupar ("ter, 02/12"). */
export function diaDoHorario(quando: string | Date) {
  return rotuloDoHorario(quando).split(" às ")[0];
}

/** A hora de um horário ("14h30"). */
export function horaDoHorario(quando: string | Date) {
  return rotuloDoHorario(quando).split(" às ")[1];
}
