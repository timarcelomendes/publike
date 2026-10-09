// CEP e endereço: o que vale no navegador e no servidor.

export function limparCep(valor: string | null | undefined) {
  return String(valor ?? "").replace(/\D/g, "").slice(0, 8);
}

export function cepValido(valor: string | null | undefined) {
  return /^\d{8}$/.test(limparCep(valor)) && !/^0{8}$/.test(limparCep(valor));
}

/** "74083010" → "74083-010" */
export function formatarCep(valor: string | null | undefined) {
  const c = limparCep(valor);
  return c.length > 5 ? `${c.slice(0, 5)}-${c.slice(5)}` : c;
}

/** Rua e número numa linha só: "Rua 90, 1200". Sem número: só a rua. */
export function montarEndereco(rua: string | null | undefined, numero: string | null | undefined) {
  const r = String(rua ?? "").replace(/\s+/g, " ").trim();
  const n = String(numero ?? "").replace(/\s+/g, " ").trim();
  if (!r) return null;
  return (n ? `${r}, ${n}` : r).slice(0, 120);
}

/** O que a consulta de CEP devolve. */
export type EnderecoDoCep = {
  cep: string;
  rua: string | null;
  bairro: string | null;
  cidade: string;
  uf: string;
};

/**
 * Quão perto do lugar certo o ponto ficou:
 * numero = na porta; rua = em algum ponto da rua; cep = no centro do CEP;
 * bairro = no meio do bairro (a pessoa precisa ajustar no mapa).
 */
export type Precisao = "numero" | "rua" | "cep" | "bairro";

export type ConsultaCep =
  | {
      ok: true;
      endereco: EnderecoDoCep;
      ponto: { lat: number; lng: number } | null;
      precisao: Precisao | null;
    }
  | { ok: false; erro: string; motivo: "invalido" | "nao_achado" | "fora_da_regiao" | "indisponivel" };

export const TEXTO_PRECISAO: Record<Precisao, string> = {
  numero: "Achamos o número no mapa. Confira se o pino está na porta certa.",
  rua: "Achamos a rua, mas não o número. Toque no mapa para pôr o pino na porta certa.",
  cep: "Achamos a área do CEP. Toque no mapa para pôr o pino no lugar certo.",
  bairro: "Achamos só o bairro. Toque no mapa para pôr o pino no lugar certo.",
};
