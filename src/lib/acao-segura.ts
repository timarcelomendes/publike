import type { EstadoForm } from "@/lib/tipos";

/**
 * Quando o salvar não chega a rodar no servidor: a página foi aberta antes de uma publicação nova do
 * site ("Failed to find Server Action") ou a internet caiu. Sem isto, o botão para de girar e a tela
 * não diz nada; a pessoa acha que salvou.
 */
export const ERRO_SEM_SALVAR =
  "Não deu para salvar: o Publike foi atualizado enquanto você preenchia, ou a internet falhou. Recarregue a página e toque em salvar de novo.";

/** O redirect e o notFound do servidor chegam como erro no navegador e precisam seguir. */
function ehNavegacao(e: unknown) {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR"));
}

/** Envolve a ação do formulário (para o useActionState): a falha vira um aviso na tela. */
export function protegerAcao<E extends EstadoForm>(acao: (anterior: E, dados: FormData) => Promise<E>) {
  return async (anterior: E, dados: FormData): Promise<E> => {
    try {
      return await acao(anterior, dados);
    } catch (e) {
      if (ehNavegacao(e)) throw e;
      console.error("Publike: o salvar não chegou ao servidor:", e);
      return { ...anterior, ok: false, erro: ERRO_SEM_SALVAR, erros: undefined, semSalvar: true };
    }
  };
}
