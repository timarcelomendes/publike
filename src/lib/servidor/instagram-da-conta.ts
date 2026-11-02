import "server-only";
import { SITE_URL } from "@/lib/config";
import { obterMeuPerfil, obterUsuario } from "@/lib/dados";
import type { Assinatura } from "@/lib/servidor/imagens-do-dia";
import { enderecoVisivel } from "@/lib/servidor/kit-imagens";
import { marcaDaEmpresa } from "@/lib/servidor/vagas-da-empresa";
import { linkDasVagas } from "@/lib/vagas-da-empresa";

// O carrossel e os stories do Instagram no kit de divulgação: só para empresa, comércio e agência, com as vagas
// da própria conta (quem é da equipe age pela conta). As imagens levam a logo, o nome e, com a página de carreiras
// liberada, a cor da marca e o endereço curto. Os links levam utm_source=instagram (Admin › Campanhas).

export type InstagramDaConta = {
  conta: string;
  nome: string;
  assinatura: Assinatura;
  /** a página de vagas da conta, para o link da bio */
  bio: string;
  /** o link de cada story: o começo e o fim, em volta do código da vaga */
  story: [string, string];
};

export async function instagramDaConta(): Promise<InstagramDaConta | null> {
  const usuario = await obterUsuario();
  if (!usuario) return null;
  const perfil = await obterMeuPerfil();
  if (!perfil || perfil.tipo === "pessoa") return null;
  const marca = await marcaDaEmpresa(perfil.id);
  const bio = linkDasVagas(SITE_URL, perfil.id, "instagram", marca?.apelido);
  return {
    conta: perfil.id,
    nome: perfil.nome,
    assinatura: { tipo: "empresa", nome: perfil.nome, foto: perfil.foto, cor: marca?.cor ?? null, endereco: enderecoVisivel(bio) },
    bio,
    story: [`${SITE_URL}/anuncio/`, "?utm_source=instagram&utm_campaign=vagas-empresa"],
  };
}
