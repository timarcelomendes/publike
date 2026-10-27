import type { MetadataRoute } from "next";
import { ONDE_FUNCIONA } from "@/lib/pracas";

// Permite instalar o Publike na tela inicial do celular (PWA).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Publike · Vagas, freelances e serviços perto de você",
    short_name: "Publike",
    description: `Vagas, diárias e freelances perto de casa em ${ONDE_FUNCIONA}, e empresas de todos os tamanhos achando profissionais do bairro. De graça.`,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fbf7ef",
    theme_color: "#ffffff",
    lang: "pt-BR",
    categories: ["business", "lifestyle"],
    // atalhos ao tocar e segurar o ícone (Android) ou com o botão direito (computador)
    shortcuts: [
      {
        name: "Vagas perto de mim",
        short_name: "Vagas",
        url: "/?tipo=vaga",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Serviços perto de mim",
        short_name: "Serviços",
        url: "/?tipo=servico",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Publicar grátis",
        short_name: "Publicar",
        url: "/publicar",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Meu painel",
        short_name: "Painel",
        url: "/painel",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
