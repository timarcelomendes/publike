import "server-only";
import { revalidatePath } from "next/cache";

/**
 * Depois de entrar, sair, trocar a foto ou salvar o perfil: o navegador busca as páginas de novo (o
 * cabeçalho mostra a conta certa). Antes era `revalidatePath("/", "layout")`, que também mandava a
 * Vercel regravar todas as páginas guardadas do site (as gravações de ISR do plano grátis acabavam).
 * O cabeçalho e o painel são lidos a cada visita (dependem do login), então não há o que regravar:
 * basta o pedido de uma página que não fica guardada, que numa ação também limpa o que o navegador
 * guardou das outras páginas (o comportamento do Next 16, ver revalidatePath na documentação).
 */
export function atualizarCabecalho() {
  revalidatePath("/painel");
}
