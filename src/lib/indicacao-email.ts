// A indicação por e-mail (claude/plano-comentarios-e-indicar-por-email.md, parte 1; migração 20270317120000).
// O link do e-mail é /indicacao/<código>: 64 letras de 0 a f. No banco fica só o hash.

export const CODIGO_INDICACAO_EMAIL = /^[0-9a-f]{64}$/;

/** O nome que a pessoa escreveu na página do link: o perfil nasce com ele quando ela entra pelo link do e-mail. */
export const COOKIE_NOME_INDICACAO = "publike_nome_indicacao";

/** O nome serve para o perfil? (2 a 80 letras, sem número, arroba ou link) */
export function nomeParaPerfil(valor: string | null | undefined) {
  const nome = (valor ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  return nome.length >= 2 && !/[0-9@/:]/.test(nome) ? nome : null;
}
