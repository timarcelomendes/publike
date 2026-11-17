import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Talentos, a lista de finalistas e os convites da agência: fora do Google (as páginas também dizem noindex)
      disallow: [
        "/painel",
        "/perfil$",
        "/publicar",
        // o /entrar fica liberado: a página diz noindex, e o Google precisa ler isso para tirar da busca os
        // /entrar?next=... que já indexou (17/11/2026)
        "/moderacao",
        "/auth/",
        "/*/denunciar",
        "/talentos",
        "/finalistas/",
        "/relatorio/",
        "/garantia/",
        "/cliente/",
        "/candidatura/",
        "/equipe/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
