import { formatarNumero } from "./formato";
import { PRACAS, pracaDaCidade } from "./pracas";

// Salário do mercado (claude/plano-salario-e-curriculo.md): as faixas do Novo Caged por função (CBO) e região.
// A região é a praça do Publike ("goiania", "anapolis") ou Goiás inteiro ("go"), como em privado.salarios_mercado
// (migração 20270131120000). Sem dependências do servidor: as telas e o robô usam o mesmo texto.

export type RegiaoSalario = "goiania" | "anapolis" | "go";

/** A faixa de uma função numa região: a maioria (do 1º ao 3º quartil), o meio (a mediana) e de onde veio. */
export type FaixaSalarial = {
  regiao: RegiaoSalario;
  cbo: string;
  /** o primeiro e o último mês contados (AAAA-MM-01) */
  de: string;
  ate: string;
  /** quantas contratações com carteira */
  n: number;
  p25: number;
  p50: number;
  p75: number;
};

/** A linha de salario_da_funcao (os números vêm como numeric) como faixa. */
export function faixaDoBanco(f: {
  regiao: string;
  cbo: string;
  de: string;
  ate: string;
  n: number;
  p25: number | string;
  p50: number | string;
  p75: number | string;
}): FaixaSalarial {
  return {
    regiao: f.regiao as RegiaoSalario,
    cbo: f.cbo,
    de: f.de,
    ate: f.ate,
    n: f.n,
    p25: Number(f.p25),
    p50: Number(f.p50),
    p75: Number(f.p75),
  };
}

/** "Goiânia" → "goiania": a chave da praça na tabela dos salários. */
export function chaveDaPraca(cidadeDaPraca: string): RegiaoSalario | null {
  const chave = cidadeDaPraca
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return chave === "goiania" || chave === "anapolis" ? chave : null;
}

/** A região dos salários de uma cidade: a praça dela; fora das praças, Goiás (só cidade de Goiás) ou nada. */
export function regiaoDaCidade(cidade: string | null | undefined, uf = "GO"): RegiaoSalario | null {
  const praca = cidade ? pracaDaCidade(cidade) : null;
  if (praca) return chaveDaPraca(praca.cidade);
  return uf === "GO" ? "go" : null;
}

/** As praças com as cidades, para o robô achar os códigos dos municípios (GET /api/salarios). */
export function pracasDosSalarios() {
  return Object.fromEntries(
    PRACAS.flatMap((p) => {
      const chave = chaveDaPraca(p.cidade);
      return chave ? [[chave, { nome: p.nome, uf: p.uf, cidades: [...p.cidades] }]] : [];
    }),
  ) as Record<Exclude<RegiaoSalario, "go">, { nome: string; uf: string; cidades: string[] }>;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-09-01" → "set/2026". */
export function mesCurto(data: string) {
  const [ano, mes] = data.split("-").map(Number);
  return `${MESES[(mes || 1) - 1]}/${ano}`;
}

/** R$ arredondado a dezena: "R$ 1.780". */
export function reaisDaFaixa(valor: number) {
  return `R$ ${formatarNumero(Math.round(valor / 10) * 10)}`;
}

/** "Goiânia e região", "Anápolis e região" ou "Goiás". */
export function nomeDaRegiao(regiao: RegiaoSalario) {
  if (regiao === "go") return "Goiás";
  return PRACAS.find((p) => chaveDaPraca(p.cidade) === regiao)?.nome ?? "Goiás";
}

/** "Novo Caged, nov/2025 a out/2026, 1.240 contratações com carteira" (a fonte, sempre junto da faixa). */
export function fonteDaFaixa(f: Pick<FaixaSalarial, "de" | "ate" | "n">) {
  const n = f.n === 1 ? "1 contratação" : `${formatarNumero(f.n)} contratações`;
  return `Novo Caged, ${mesCurto(f.de)} a ${mesCurto(f.ate)}, ${n} com carteira`;
}
