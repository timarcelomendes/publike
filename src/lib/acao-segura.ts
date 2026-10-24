import { detalheDoErro, relatarFalha, type OndeFalha } from "@/lib/falhas";
import type { EstadoForm } from "@/lib/tipos";

/**
 * Quando o salvar não chega a rodar no servidor: a página foi aberta antes de uma publicação nova do
 * site ("Failed to find Server Action") ou a internet caiu. Sem isto, o botão para de girar e a tela
 * não diz nada; a pessoa acha que salvou.
 */
export const ERRO_SEM_SALVAR =
  "Não deu para salvar: o Publike foi atualizado enquanto você preenchia, ou a internet falhou. Recarregue a página e toque em salvar de novo.";

/** O redirect e o notFound do servidor chegam como erro no navegador e precisam seguir. */
export function ehNavegacao(e: unknown) {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR"));
}

/**
 * Envolve a ação do formulário (para o useActionState): a falha vira um aviso na tela. Com `onde`
 * (vaga ou currículo), a falha também chega à equipe (o servidor não a viu).
 */
export function protegerAcao<E extends EstadoForm>(
  acao: (anterior: E, dados: FormData) => Promise<E>,
  onde?: OndeFalha,
) {
  return async (anterior: E, dados: FormData): Promise<E> => {
    try {
      return await acao(anterior, dados);
    } catch (e) {
      if (ehNavegacao(e)) throw e;
      console.error("Publike: o salvar não chegou ao servidor:", e);
      if (onde) {
        relatarFalha({
          onde,
          etapa: "conexao",
          mensagem: ERRO_SEM_SALVAR,
          detalhe: `${navigator.onLine === false ? "sem internet · " : ""}${detalheDoErro(e)}`,
        });
      }
      return { ...anterior, ok: false, erro: ERRO_SEM_SALVAR, erros: undefined, semSalvar: true };
    }
  };
}

/**
 * Chama uma ação do servidor que devolve `Resultado` (botões soltos, fora de formulário). Se ela
 * nem chegar ao servidor, volta `{ ok: false }` com o aviso de sempre, em vez de estourar na página
 * de erro (que apaga o que estava na tela) ou sumir sem aviso. O redirect do servidor segue.
 */
export async function chamarAcao<R extends { ok: boolean }>(acao: () => Promise<R>): Promise<R | { ok: false; erro: string }> {
  try {
    return await acao();
  } catch (e) {
    if (ehNavegacao(e)) throw e;
    console.error("Publike: a ação não chegou ao servidor:", e);
    return { ok: false, erro: ERRO_SEM_SALVAR };
  }
}
