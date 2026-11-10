import type { UsoDaFuncionalidade } from "@/components/admin/ia";
import type { usoDaIA } from "@/lib/admin/dados";
import { MODELOS_IA, PRECO_BUSCA } from "@/lib/ia/openai";
import { MODELO_TRANSCRICAO, PRECO_TRANSCRICAO } from "@/lib/ia/transcrever";

// O custo estimado da IA, num lugar só: Admin › IA e o Painel › Dinheiro (claude/plano-indicadores-do-admin.md,
// parte 4) fazem a mesma conta.

/**
 * As chamadas e o custo estimado de cada funcionalidade nos últimos 30 dias (null: sem a migração): os tokens pelo
 * preço do modelo e as buscas na internet, cobradas à parte.
 */
export function usoPorFuncionalidade(uso: Awaited<ReturnType<typeof usoDaIA>>): UsoDaFuncionalidade | null {
  if (!uso) return null;
  const porFuncionalidade: UsoDaFuncionalidade = {};
  for (const u of uso) {
    const preco =
      u.modelo === MODELO_TRANSCRICAO ? PRECO_TRANSCRICAO : (MODELOS_IA.find((m) => m.id === u.modelo)?.preco ?? null);
    const atual = porFuncionalidade[u.funcionalidade] ?? {
      chamadas: 0,
      falhas: 0,
      buscas: 0,
      dolares: 0,
      semPreco: false,
    };
    atual.chamadas += Number(u.chamadas);
    atual.falhas += Number(u.falhas);
    atual.buscas += Number(u.buscas ?? 0);
    atual.dolares += Number(u.buscas ?? 0) * PRECO_BUSCA;
    if (preco) atual.dolares += (Number(u.tokens_entrada) * preco.entrada + Number(u.tokens_saida) * preco.saida) / 1e6;
    else if (Number(u.chamadas)) atual.semPreco = true;
    porFuncionalidade[u.funcionalidade] = atual;
  }
  return porFuncionalidade;
}

/** O custo de todas as funcionalidades juntas, em dólar, e se alguma ficou sem preço. */
export function custoTotalDaIA(uso: UsoDaFuncionalidade | null) {
  if (!uso) return null;
  const linhas = Object.values(uso).filter((u): u is NonNullable<typeof u> => Boolean(u));
  return {
    dolares: linhas.reduce((t, u) => t + u.dolares, 0),
    chamadas: linhas.reduce((t, u) => t + u.chamadas, 0),
    semPreco: linhas.some((u) => u.semPreco),
  };
}
