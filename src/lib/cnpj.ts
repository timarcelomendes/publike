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
