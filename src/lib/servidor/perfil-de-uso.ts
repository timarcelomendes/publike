import "server-only";
import { cache } from "react";
import { listarMeusAnuncios, obterMeuPerfil } from "@/lib/dados";

/**
 * Para que a conta usa o Publike, pelo tipo escolhido no perfil (não pelo modo do painel): é o
 * que decide o cartão da conta, os atalhos e a caixa de publicar da home de quem entrou.
 *   contratar ... comércio, empresa e agência
 *   servicos .... pessoa com serviço publicado (vitrine)
 *   trabalho .... as outras pessoas (o currículo)
 * "O que você faz" do perfil não conta: quem procura trabalho também preenche (garçom, pedreiro).
 */
export type PerfilDeUso = "contratar" | "servicos" | "trabalho";

// uma conta por requisição: o cartão, os atalhos e a caixa de publicar perguntam juntos
export const perfilDeUso = cache(async (): Promise<PerfilDeUso> => {
  const perfil = await obterMeuPerfil().catch(() => null);
  if (perfil && perfil.tipo !== "pessoa") return "contratar";
  if (perfil && (await listarMeusAnuncios().catch(() => [])).some((a) => a.tipo === "servico")) return "servicos";
  return "trabalho";
});
