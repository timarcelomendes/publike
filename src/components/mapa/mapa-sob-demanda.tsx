"use client";

import dynamic from "next/dynamic";

// O mapa dos anúncios sob demanda (17/11/2026): o código dele só baixa quando o mapa aparece na tela (no celular, o
// jeito de ver padrão é Blocos, sem mapa). O MapLibre já vinha à parte (carregarMapLibre); agora vem à parte também o
// componente. Enquanto chega, a mesma caixa do mapa (fundo e borda), do tamanho que o lugar dele já reserva: nada pula.
export const MapaAnuncios = dynamic(() => import("./mapa-anuncios").then((m) => m.MapaAnuncios), {
  ssr: false,
  loading: () => <div className="h-full min-h-[320px] rounded-lg border border-line bg-surface-300" />,
});
