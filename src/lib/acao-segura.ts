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

/** Para onde o redirect do servidor manda (só endereços do próprio site), ou null. */
export function destinoDoRedirect(e: unknown): string | null {
  const digest = (e as { digest?: unknown } | null)?.digest;
  if (typeof digest !== "string" || !digest.startsWith("NEXT_REDIRECT;")) return null;
  // "NEXT_REDIRECT;push;/anuncio/…?publicado=1;307;"
  const url = digest.split(";").slice(2, -2).join(";");
  return url.startsWith("/") && !url.startsWith("//") ? url : null;
}

/** A página é de antes da publicação nova do site: a ação que ela chama não existe mais no servidor. */
export function ehVersaoNova(e: unknown) {
  const nome = (e as { name?: unknown } | null)?.name;
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return nome === "UnrecognizedActionError" || /Server Action .* was not found|failed-to-find-server-action/i.test(msg);
}

const RECARREGOU = "publike_recarregou_versao";

/**
 * Recarrega a página para pegar a versão nova do site (o que estava preenchido já ficou guardado no aparelho), no
 * máximo uma vez a cada 2 minutos: se a falha continuar, fica o aviso para a pessoa recarregar.
 */
export function recarregarParaVersaoNova() {
  try {
    const antes = Number(sessionStorage.getItem(RECARREGOU) ?? 0);
    if (Date.now() - antes < 120_000) return false;
    sessionStorage.setItem(RECARREGOU, String(Date.now()));
  } catch {
    return false;
  }
  window.setTimeout(() => window.location.reload(), 150);
  return true;
}

/**
 * Envolve a ação do formulário (para o useActionState): a falha vira um aviso na tela. Com `onde`
 * (vaga ou currículo), a falha também chega à equipe (o servidor não a viu). `aoSeguir`: o servidor salvou e
 * mandou para outra página (antes de a navegação até lá terminar).
 */
export function protegerAcao<E extends EstadoForm>(
  acao: (anterior: E, dados: FormData) => Promise<E>,
  onde?: OndeFalha,
  aoSeguir?: (destino: string) => void,
) {
  return async (anterior: E, dados: FormData): Promise<E> => {
    try {
      return await acao(anterior, dados);
    } catch (e) {
      if (ehNavegacao(e)) {
        const destino = destinoDoRedirect(e);
        if (destino) aoSeguir?.(destino);
        throw e;
      }
      console.error("Publike: o salvar não chegou ao servidor:", e);
      if (onde) {
        relatarFalha({
          onde,
          etapa: "conexao",
          mensagem: ERRO_SEM_SALVAR,
          detalhe: `${navigator.onLine === false ? "sem internet · " : ""}${detalheDoErro(e)}`,
        });
      }
      return { ...anterior, ok: false, erro: ERRO_SEM_SALVAR, erros: undefined, semSalvar: true, versaoNova: ehVersaoNova(e) };
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
