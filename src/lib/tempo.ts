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
