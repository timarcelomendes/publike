// A indicação (claude/plano-painel-feed-indicacao-documentos.md, parte 3). O link de quem indica é a página da vaga com
// ?i=<código>: o código de 8 letras que a empresa criou ("João, do caixa") ou "p.<perfil>", o link de quem tem conta.
// Quem abre o link guarda "<vaga>~<código>" num cookie por 30 dias; quando curte uma vaga daquela empresa, a curtida
// grava quem indicou (registrar_indicacao confere a empresa e ignora quem indica a si mesmo).

export const COOKIE_INDICACAO = "publike_indicacao";
export const DURACAO_INDICACAO = 60 * 60 * 24 * 30;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const CODIGO = new RegExp(`^(?:[a-z0-9]{8}|p\\.${UUID})$`);
const VALOR = new RegExp(`^(${UUID})~((?:[a-z0-9]{8}|p\\.${UUID}))$`);

export function codigoValido(codigo: string | null | undefined): codigo is string {
  return typeof codigo === "string" && CODIGO.test(codigo);
}

/** O que vai no cookie: a vaga onde o link foi aberto e o código. */
export function valorDoCookie(anuncioId: string, codigo: string) {
  return `${anuncioId.toLowerCase()}~${codigo}`;
}

export function lerCookieDeIndicacao(valor: string | null | undefined): { origem: string; codigo: string } | null {
  const m = valor ? VALOR.exec(valor) : null;
  return m ? { origem: m[1], codigo: m[2] } : null;
}

/** O link de indicação de uma vaga (com o utm, que vira a origem da conta nova). */
export function linkComIndicacao(url: string, codigo: string) {
  return `${url}?i=${encodeURIComponent(codigo)}&utm_source=whatsapp&utm_campaign=indicacao`;
}

/** O código do link de quem tem conta. */
export function codigoDaPessoa(perfilId: string) {
  return `p.${perfilId.toLowerCase()}`;
}
