import "server-only";
import { cookies, headers } from "next/headers";
import { CHAVE_VISAO_BUSCA, ehVisao, VISOES_CELULAR, type Visao } from "@/lib/visao";

/**
 * O jeito de ver da busca por palavra na primeira pintura: o que a pessoa escolheu (cookie) ou a
 * Lista; no celular (pelo navegador), Blocos no lugar do que não cabe lá. O navegador confere
 * a largura de verdade depois de abrir.
 */
export async function visaoInicialDaBusca(): Promise<Visao> {
  const [c, h] = await Promise.all([cookies(), headers()]);
  const guardada = c.get(CHAVE_VISAO_BUSCA)?.value;
  const visao: Visao = ehVisao(guardada) ? guardada : "lista";
  const celular = h.get("sec-ch-ua-mobile") === "?1" || /Mobi|Android|iPhone|iPod/i.test(h.get("user-agent") ?? "");
  return celular && !VISOES_CELULAR.includes(visao) ? "blocos" : visao;
}
