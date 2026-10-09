// CNPJ numérico ou com letras (a Receita emite CNPJ alfanumérico desde julho
// de 2026). Os 12 primeiros caracteres podem ter letras; os 2 últimos, os
// dígitos verificadores, são sempre números. Na conta, cada caractere vale o
// código ASCII menos 48: 0 a 9 valem 0 a 9, A vale 17 e Z vale 42.
// A mesma regra está no banco (public.cnpj_valido).

const PESOS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Só letras maiúsculas e números: "12.abc.345/01de-35" vira "12ABC34501DE35". */
export function limparCnpj(valor: string | null | undefined) {
  return (valor ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

function digitoVerificador(base: string, pesos: number[]) {
  let soma = 0;
  for (let i = 0; i < pesos.length; i++) soma += (base.charCodeAt(i) - 48) * pesos[i];
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cnpjValido(valor: string | null | undefined) {
  const c = limparCnpj(valor);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c) || /^(.)\1{13}$/.test(c)) return false;
  const d1 = digitoVerificador(c, PESOS_1);
  const d2 = digitoVerificador(c.slice(0, 12) + d1, PESOS_2);
  return c.endsWith(`${d1}${d2}`);
}

/** "12ABC34501DE35" vira "12.ABC.345/01DE-35". Também serve para ir formatando enquanto a pessoa digita. */
export function formatarCnpj(valor: string | null | undefined) {
  const c = limparCnpj(valor).slice(0, 14);
  let r = c.slice(0, 2);
  if (c.length > 2) r += `.${c.slice(2, 5)}`;
  if (c.length > 5) r += `.${c.slice(5, 8)}`;
  if (c.length > 8) r += `/${c.slice(8, 12)}`;
  if (c.length > 12) r += `-${c.slice(12)}`;
  return r;
}

/** Comprovante de inscrição e situação cadastral, no site da Receita Federal. */
export function linkReceita(valor: string) {
  return `https://solucoes.receita.fazenda.gov.br/servicos/cnpjreva/cnpjreva_solicitacao.asp?cnpj=${limparCnpj(valor)}`;
}

/** "7810800" vira "7810-8/00", como aparece no cartão CNPJ. */
export function formatarCnae(codigo: string | number | null | undefined) {
  const c = String(codigo ?? "").replace(/\D/g, "").padStart(7, "0");
  return c === "0000000" ? null : `${c.slice(0, 4)}-${c[4]}/${c.slice(5)}`;
}

const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "na", "no", "a", "o"]);
const SIGLAS = new Set(["LTDA", "ME", "EPP", "EIRELI", "SA", "S/A", "MEI", "RH", "SS", "CIA"]);

/** A Receita escreve tudo em maiúsculas: "PADARIA PAO QUENTE LTDA" vira "Padaria Pao Quente Ltda". */
export function nomeDaReceita(texto: string | null | undefined) {
  return (texto ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((p, i) => {
      const maiuscula = p.toUpperCase();
      if (SIGLAS.has(maiuscula)) return maiuscula === "LTDA" ? "Ltda" : maiuscula;
      const minuscula = p.toLocaleLowerCase("pt-BR");
      if (i > 0 && MINUSCULAS.has(minuscula)) return minuscula;
      return minuscula.charAt(0).toLocaleUpperCase("pt-BR") + minuscula.slice(1);
    })
    .join(" ");
}

const ABREVIACOES: [RegExp, string][] = [
  [/^SET\.? /, "SETOR "],
  [/^ST\.? /, "SETOR "],
  [/^JD\.? /, "JARDIM "],
  [/^JARD\.? /, "JARDIM "],
  [/^VL\.? /, "VILA "],
  [/^PQ\.? /, "PARQUE "],
  [/^PRQ\.? /, "PARQUE "],
  [/^RES\.? /, "RESIDENCIAL "],
  [/^CJ\.? /, "CONJUNTO "],
  [/^CONJ\.? /, "CONJUNTO "],
];

/** Bairro da Receita: "SET OESTE" vira "Setor Oeste", "JD AMERICA" vira "Jardim America". */
export function bairroDaReceita(texto: string | null | undefined) {
  let b = (texto ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  for (const [de, para] of ABREVIACOES) b = b.replace(de, para);
  return nomeDaReceita(b);
}

/** Dados públicos do CNPJ que o Publike usa (vêm da BrasilAPI, que lê os dados abertos da Receita). */
export type DadosCnpj = {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  /** ATIVA, BAIXADA, INAPTA, SUSPENSA ou NULA */
  situacao: string;
  ativa: boolean;
  atividade: string | null;
  cnae: string | null;
  /** atividade principal ou secundária de seleção e agenciamento de mão de obra (CNAE 78) */
  agenciaDeEmprego: boolean;
  municipio: string | null;
  uf: string | null;
  bairro: string | null;
  /** AAAA-MM-DD */
  abertura: string | null;
  mei: boolean;
};

export type ConsultaCnpj =
  | { ok: true; dados: DadosCnpj }
  | { ok: false; motivo: "invalido" | "nao_encontrado" | "indisponivel" };
