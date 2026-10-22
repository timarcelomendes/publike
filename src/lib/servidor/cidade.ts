import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import type { Cidade } from "@/lib/constantes";
import { obterLocal } from "@/lib/local";
import { cidadeDoPublike, PRACA_PADRAO, pracaDaCidade, type Praca } from "@/lib/pracas";

export type CidadeDaVisita = {
  cidade: Cidade;
  praca: Praca;
  /** onde a pessoa mora (CEP, bairro escolhido ou perfil), o endereço de internet ou a cidade principal */
  fonte: "local" | "internet" | "padrao";
};

/**
 * A cidade pelo endereço de internet: na Vercel, os cabeçalhos `x-vercel-ip-*` (a cidade vem
 * em RFC 3986, "Aparecida%20de%20Goi%C3%A2nia"). Só vale uma cidade que o Publike atende, no
 * estado da praça: de celular, o endereço costuma cair na capital da operadora, e aí fica o padrão.
 */
export function cidadeDosCabecalhos(h: Headers): Cidade | null {
  const pais = h.get("x-vercel-ip-country");
  if (pais && pais !== "BR") return null;
  let nome = h.get("x-vercel-ip-city") ?? "";
  try {
    nome = decodeURIComponent(nome);
  } catch {
    return null;
  }
  const cidade = cidadeDoPublike(nome);
  if (!cidade) return null;
  // o mesmo nome em outro estado não vale
  const uf = h.get("x-vercel-ip-country-region");
  return !uf || uf === pracaDaCidade(cidade)?.uf ? cidade : null;
}

/**
 * A cidade de quem está vendo, para os textos de "perto de você" e de onde a lista conta a
 * distância quando a pessoa ainda não disse onde mora: onde ela mora (`obterLocal`), a cidade do
 * endereço de internet (se for uma do Publike) ou a cidade principal da praça.
 */
export const cidadeDaVisita = cache(async (): Promise<CidadeDaVisita> => {
  const local = await obterLocal();
  if (local) return { cidade: local.cidade, praca: pracaDaCidade(local.cidade) ?? PRACA_PADRAO, fonte: "local" };
  const daInternet = cidadeDosCabecalhos(await headers());
  if (daInternet) return { cidade: daInternet, praca: pracaDaCidade(daInternet) ?? PRACA_PADRAO, fonte: "internet" };
  return { cidade: PRACA_PADRAO.cidade, praca: PRACA_PADRAO, fonte: "padrao" };
});
