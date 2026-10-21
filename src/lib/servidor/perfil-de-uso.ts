import "server-only";
import { cache } from "react";
import { listarMeusAnuncios, obterMeuPerfil } from "@/lib/dados";
import { obterIntencao } from "./intencao";

/**
 * Para que a conta usa o Publike, pelo perfil (não pelo modo do painel): é o que decide o
 * cartão da conta, os atalhos e a caixa de publicar da home de quem entrou.
 *   contratar ... empresa, comércio, agência e a pessoa que disse que quer contratar
 *   servicos .... pessoa com serviço no perfil ou na vitrine, ou que disse que oferece serviços
 *   trabalho .... as outras pessoas (o currículo)
 */
export type PerfilDeUso = "contratar" | "servicos" | "trabalho";

// uma conta por requisição: o cartão, os atalhos e a caixa de publicar perguntam juntos
export const perfilDeUso = cache(async (): Promise<PerfilDeUso> => {
  const [perfil, intencao] = await Promise.all([obterMeuPerfil().catch(() => null), obterIntencao().catch(() => null)]);
  if (perfil && perfil.tipo !== "pessoa") return "contratar";
  if ((perfil?.servicos.length ?? 0) > 0 || intencao === "oferecer_servico") return "servicos";
  // serviço publicado conta mais que a resposta da pergunta
  if (perfil && (await listarMeusAnuncios().catch(() => [])).some((a) => a.tipo === "servico")) return "servicos";
  if (intencao === "contratar_pessoa" || intencao === "contratar_servico") return "contratar";
  return "trabalho";
});
