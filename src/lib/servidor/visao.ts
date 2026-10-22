import "server-only";
import { cookies, headers } from "next/headers";
import { CHAVE_VISAO, CHAVE_VISAO_BUSCA, ehVisao, VISOES_CELULAR, type Visao } from "@/lib/visao";

/**
 * O jeito de ver na primeira pintura, para a página não trocar depois de abrir: o que a pessoa
 * escolheu (cookie) ou o padrão do computador; no celular (pelo navegador), Blocos no lugar do que
 * não cabe lá. O navegador confere a largura de verdade depois de abrir.
 */
export async function visaoInicial(chave: string, padrao: { computador: Visao; celular?: Visao }): Promise<Visao> {
  const [c, h] = await Promise.all([cookies(), headers()]);
  const guardada = c.get(chave)?.value;
  // celular: a dica do Chrome ou o "Mobile" do navegador (tablet Android não tem e conta como computador)
  const celular = h.get("sec-ch-ua-mobile") === "?1" || /Mobi|iPhone|iPod/i.test(h.get("user-agent") ?? "");
  const visao: Visao = ehVisao(guardada) ? guardada : celular ? (padrao.celular ?? "blocos") : padrao.computador;
  return celular && !VISOES_CELULAR.includes(visao) ? "blocos" : visao;
}

/** A busca por palavra de quem entrou: começa na Lista no computador. */
export function visaoInicialDaBusca() {
  return visaoInicial(CHAVE_VISAO_BUSCA, { computador: "lista" });
}

/** As listas: na vitrine, Blocos + mapa no computador; nas listas de quem entrou, Blocos. */
export function visaoInicialDaLista(feed: boolean) {
  return visaoInicial(CHAVE_VISAO, { computador: feed ? "blocos" : "blocos-mapa" });
}
