import type { MetadataRoute } from "next";

// Permite instalar o Publike na tela inicial do celular (PWA).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Publike · Vagas, bicos e serviços perto de você",
    short_name: "Publike",
    description: "Vagas, bicos e serviços em Goiânia e região. Quem precisa publica, quem faz curte. De graça.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbf7ef",
    theme_color: "#fbf7ef",
    lang: "pt-BR",
    categories: ["business", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
