import { BannerDoSite } from "@/components/home/banner-da-home";
import { bannersDaVisita } from "@/lib/servidor/banners";

/**
 * Os banners do admin que podem aparecer para quem chega (lê a conta e os cookies: fica num Suspense no
 * layout). O navegador escolhe o da página aberta e espera os segundos dele.
 */
export async function BannerDaVisita() {
  const banners = await bannersDaVisita().catch(() => []);
  return banners.length ? <BannerDoSite banners={banners} /> : null;
}
