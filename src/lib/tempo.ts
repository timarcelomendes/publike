import { cacheLife } from "next/cache";
import { connection } from "next/server";

/**
 * Hora da requisição. Com Cache Components ligado, o horário não pode
 * entrar em nenhum pré-render: `connection()` faz o Next esperar a
 * requisição de verdade antes de ler o relógio.
 */
export async function agoraDaRequisicao() {
  await connection();
  return Date.now();
}

/**
 * A hora das páginas públicas de busca (/vagas e /servicos), guardada junto com elas (17/11/2026, "deixe a
 * performance invejável"). Com a hora da requisição, a lista inteira esperava a requisição e chegava depois do resto
 * da página, escondida até o fim do HTML: no celular, o maior texto aparecia quase 1 s depois. Guardada como a lista
 * de vagas (15 minutos), a página sai pronta do cache da Vercel; o "há 2 dias" dos cartões pode atrasar até lá.
 */
export async function agoraDaPaginaPublica() {
  "use cache";
  cacheLife("default");
  return Date.now();
}
