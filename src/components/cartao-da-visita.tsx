import { CartaoDoPublike } from "@/components/home/cartao-do-publike";
import { cartaoDaVisita } from "@/lib/servidor/banners";

/**
 * O cartão "Do Publike" que a pessoa ainda pode ver (lê a conta e os cookies: fica num Suspense), no
 * meio da lista da página inicial (`lista`) ou da linha do tempo (`linha`).
 */
export async function CartaoDaVisita({ jeito }: { jeito: "lista" | "linha" }) {
  const banner = await cartaoDaVisita();
  return banner ? <CartaoDoPublike banner={banner} jeito={jeito} novidades={banner.novidades} /> : null;
}
