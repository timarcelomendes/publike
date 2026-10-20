import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Talentos e a lista de finalistas da agência: fora do Google (as páginas também dizem noindex)
      disallow: [
        "/painel",
        "/perfil$",
        "/publicar",
        "/entrar",
        "/moderacao",
        "/auth/",
        "/*/denunciar",
        "/talentos",
        "/finalistas/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
