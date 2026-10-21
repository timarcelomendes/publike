import "server-only";
import { cache } from "react";
import { listarMeusAnuncios, obterMeuPerfil } from "@/lib/dados";
import { modoDaConta, modosMarcados } from "./modo";

/**
 * Para que a conta usa o Publike agora: é o que decide o cartão da conta, os atalhos e a caixa de
 * publicar da home de quem entrou.
 * Com os modos marcados no perfil ("O que você quer fazer no Publike?"): o modo em que a conta
 * está (Procurar trabalho → trabalho, Oferecer serviços → servicos, Contratar → contratar).
 * Sem marcação (conta antiga ou banco sem a migração), pelo tipo:
 *   contratar ... comércio, empresa e agência
 *   servicos .... pessoa com serviço publicado (vitrine)
 *   trabalho .... as outras pessoas (o currículo)
 * "O que você faz" do perfil não conta: quem procura trabalho também preenche (garçom, pedreiro).
 */
export type PerfilDeUso = "contratar" | "servicos" | "trabalho";

// uma conta por requisição: o cartão, os atalhos e a caixa de publicar perguntam juntos
export const perfilDeUso = cache(async (): Promise<PerfilDeUso> => {
  if (await modosMarcados()) {
    const modo = await modoDaConta();
    return modo === "trabalhar" ? "trabalho" : modo;
  }
  const perfil = await obterMeuPerfil().catch(() => null);
  if (perfil && perfil.tipo !== "pessoa") return "contratar";
  if (perfil && (await listarMeusAnuncios().catch(() => [])).some((a) => a.tipo === "servico")) return "servicos";
  return "trabalho";
});
