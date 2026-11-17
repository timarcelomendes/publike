import type { ReactNode } from "react";
import { ateALinha, chaveDaLinha, dadosDaLinha, mapaDaLinha } from "@/lib/servidor/linha";
import { MapaAnuncios } from "../../mapa/mapa-sob-demanda";

type Parametros = Promise<Record<string, string | string[] | undefined>>;

/**
 * A coluna da direita da home (computador): quem está contratando em cima e o mapa com os itens da
 * linha embaixo, 4 de largura por 5 de altura. A coluna toda fica presa no alto ao rolar (na página).
 * `acima` vem já começado e aparece junto com o mapa, ou fica de fora desta vez (17/11/2026): num Suspense, chegava
 * depois e empurrava o mapa ~290 px para baixo.
 */
export async function LateralDaLinha({ searchParams, acima }: { searchParams: Parametros; acima: Promise<ReactNode> }) {
  const chave = chaveDaLinha(await searchParams);
  const [d, emCima] = await Promise.all([dadosDaLinha(chave), ateALinha(acima, chave)]);
  const { pontos, origem } = mapaDaLinha(d);
  return (
    <div className="flex flex-col gap-4">
      {emCima}
      <div className="aspect-[4/5] max-h-[calc(100dvh-7rem)] min-h-80">
        <MapaAnuncios pontos={pontos} filtros={{ ...d.filtrosDaBusca, ordem: "perto" }} origem={origem} />
      </div>
    </div>
  );
}
