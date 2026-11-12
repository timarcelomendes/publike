// A imagem de compartilhamento do site (app/opengraph-image.png). O Next só a herda nas páginas que não têm o próprio
// `openGraph`: quem define o seu precisa repetir a imagem, senão o link sai sem foto no WhatsApp, no Facebook e na
// busca. As páginas com imagem própria (a vaga, o post, as vagas da empresa) usam o opengraph-image delas.
export const IMAGEM_DO_SITE = {
  url: "/opengraph-image.png",
  width: 1200,
  height: 630,
  alt: "Publike: vagas, freelances e serviços perto de você, de graça, em Goiânia e região.",
};
