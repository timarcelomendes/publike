// O mutirão de contratação (migração 20270417120000; claude/plano-convite-automatico-30-dias-e-anual.md, parte 3):
// os tipos que as telas leem e a hora como a pessoa lê ("9h", "9h30").

export type ResumoMutirao = {
  chamados: number;
  escolheram: number;
  vieram: number;
  faltaram: number;
  contratados: number;
};

export type Mutirao = {
  id: string;
  dia: string;
  inicio: string;
  fim: string;
  intervalo: number;
  por_horario: number;
  local: string;
  trazer: string | null;
  situacao: "aberto" | "cancelado";
  vagas: { id: string; titulo: string }[];
  resumo: ResumoMutirao;
  lugares: number;
};

export type PessoaDoMutirao = {
  entrevista: string;
  perfil: string;
  anuncio: string;
  situacao: string;
  quando: string;
  nome: string;
  vaga: string;
  etapa: string | null;
};

export type ParaChamar = {
  perfil: string;
  anuncio: string;
  nome: string;
  vaga: string;
  match: boolean;
  curtiu_em: string;
};

export type DiaDoMutirao = {
  horarios: { quando: string; ocupados: number; lugares: number }[];
  pessoas: PessoaDoMutirao[];
  para_chamar: ParaChamar[];
};

export type MeuMutirao = {
  entrevista: string;
  situacao: string;
  quando: string;
  anuncio: string;
  vaga: string;
  empresa: string | null;
  dia: string;
  inicio: string;
  fim: string;
  local: string;
  trazer: string | null;
  cancelado: boolean;
  horarios: string[];
};

export type SituacaoMutirao = { pode: boolean; plano: boolean; liberado: boolean; primeiro: boolean };

/** "09:30:00" em "9h30"; "09:00:00" em "9h". */
export function horaCurta(hora: string) {
  const [h, m] = hora.split(":").map(Number);
  return `${h}h${m ? String(m).padStart(2, "0") : ""}`;
}

/** Um horário (ISO) em "9h30", em Brasília. */
export function horaDoHorario(iso: string) {
  const t = new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  return horaCurta(t);
}

/** "2026-11-14" em "sábado, 14 de novembro". */
export function diaDoMutirao(dia: string) {
  const [a, m, d] = dia.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12)).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}
