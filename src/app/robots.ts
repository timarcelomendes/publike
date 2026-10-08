import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/painel", "/perfil$", "/publicar", "/entrar", "/moderacao", "/auth/", "/*/denunciar"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
