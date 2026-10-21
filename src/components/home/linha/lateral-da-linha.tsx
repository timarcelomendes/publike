import type { ReactNode } from "react";
import { chaveDaLinha, dadosDaLinha, mapaDaLinha } from "@/lib/servidor/linha";
import { MapaAnuncios } from "../../mapa/mapa-anuncios";

type Parametros = Promise<Record<string, string | string[] | undefined>>;

/**
 * A coluna da direita da home (computador): quem está contratando em cima e o mapa com os itens da
 * linha embaixo, 4 de largura por 5 de altura. Os dois ficam presos no alto ao rolar.
 */
export async function LateralDaLinha({ searchParams, acima }: { searchParams: Parametros; acima: ReactNode }) {
  const d = await dadosDaLinha(chaveDaLinha(await searchParams));
  const { pontos, origem } = mapaDaLinha(d);
  return (
    <div className="sticky top-[88px] flex flex-col gap-4">
      {acima}
      <div className="aspect-[4/5] max-h-[calc(100dvh-7rem)] min-h-80">
        <MapaAnuncios pontos={pontos} filtros={{ ...d.filtrosDaBusca, ordem: "perto" }} origem={origem} />
      </div>
    </div>
  );
}
