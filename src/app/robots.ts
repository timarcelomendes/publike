import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Talentos: o resumo de quem procura trabalho fica fora do Google (a página também diz noindex)
      disallow: ["/painel", "/perfil$", "/publicar", "/entrar", "/moderacao", "/auth/", "/*/denunciar", "/talentos"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
