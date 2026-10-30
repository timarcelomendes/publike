import { cnpjValido, formatarCnpj, limparCnpj } from "./cnpj";

// O CPF ou o CNPJ de quem paga (vai na fatura e na nota fiscal). O CNPJ pode ter letras (cnpj.ts).

export function cpfValido(valor: string | null | undefined) {
  const c = (valor ?? "").replace(/\D/g, "");
  if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(c[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

/** Só os números (e as letras do CNPJ novo); null quando não é um CPF nem um CNPJ válido. */
export function documentoValido(valor: string | null | undefined): string | null {
  const c = limparCnpj(valor);
  if (/^\d{11}$/.test(c)) return cpfValido(c) ? c : null;
  return cnpjValido(c) ? c : null;
}

/** "12345678909" vira "123.456.789-09"; o CNPJ, como em cnpj.ts. */
export function formatarDocumento(valor: string | null | undefined) {
  const c = limparCnpj(valor);
  if (c.length === 11 && /^\d+$/.test(c)) return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
  return formatarCnpj(c);
}
