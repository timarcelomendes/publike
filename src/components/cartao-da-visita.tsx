import { CartaoDoPublike } from "@/components/home/cartao-do-publike";
import { cartaoDaVisita, topoDaVisita } from "@/lib/servidor/banners";

/**
 * O cartão "Do Publike" que a pessoa ainda pode ver (lê a conta e os cookies: fica num Suspense), no
 * meio da lista da página inicial (`lista`), no meio da linha do tempo (`linha`) ou no topo dela (`topo`, o
 * formato "Topo da linha do tempo"). O banner que está no topo não entra também no meio.
 */
export async function CartaoDaVisita({ jeito }: { jeito: "lista" | "linha" | "topo" }) {
  const banner = jeito === "topo" ? await topoDaVisita() : await cartaoDaVisita(jeito === "linha");
  return banner ? (
    <CartaoDoPublike banner={banner} jeito={jeito === "lista" ? "lista" : "linha"} novidades={banner.novidades} />
  ) : null;
}
