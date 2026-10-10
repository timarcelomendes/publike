import { MAPA_ESTILO } from "@/lib/config";

// Carrega o MapLibre só no navegador e só quando um mapa aparece na tela.
// O "worker" do mapa é copiado para public/vendor por scripts/copiar-worker-mapa.mjs.

type MapLibre = typeof import("maplibre-gl");
type MapaML = import("maplibre-gl").Map;

let carregando: Promise<MapLibre> | null = null;

export function carregarMapLibre() {
  if (!carregando) {
    carregando = import("maplibre-gl").then((ml) => {
      ml.setWorkerUrl(`/vendor/maplibre-gl-worker.mjs?v=${ml.getVersion()}`);
      return ml;
    });
  }
  return carregando;
}

export const ESTILO_MAPA = MAPA_ESTILO;

/**
 * Os créditos do mapa (OpenFreeMap, OpenMapTiles, OpenStreetMap) começam recolhidos no
 * botão "i" do canto; tocar nele mostra o texto (a licença pede o crédito, não que fique aberto).
 * O MapLibre abre o texto ao carregar e só fecha quando a pessoa arrasta o mapa.
 */
export function recolherCreditos(mapa: MapaML) {
  const recolher = () => {
    const caixa = mapa.getContainer().querySelector(".maplibregl-ctrl-attrib.maplibregl-compact-show");
    if (!caixa) return;
    caixa.classList.remove("maplibregl-compact-show");
    caixa.setAttribute("open", "");
  };
  mapa.once("load", recolher);
  mapa.once("idle", recolher);
}

export const CORES_MAPA = {
  terra: "#c2410c",
  cerrado: "#1f6f4a",
  ink: "#1f1a14",
  branco: "#ffffff",
} as const;

/** Polígono aproximado de um círculo (para mostrar raio e área aproximada). */
export function circulo(lat: number, lng: number, raioKm: number, lados = 64): GeoJSON.Feature<GeoJSON.Polygon> {
  const dLat = (raioKm / 6371) * (180 / Math.PI);
  const dLng = dLat / Math.cos((lat * Math.PI) / 180);
  const anel: [number, number][] = [];
  for (let i = 0; i <= lados; i++) {
    const t = (i / lados) * 2 * Math.PI;
    anel.push([lng + dLng * Math.cos(t), lat + dLat * Math.sin(t)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [anel] } };
}

/** Caixa [[oeste, sul], [leste, norte]] que cabe um raio em volta do ponto. */
export function caixaDoRaio(lat: number, lng: number, raioKm: number): [[number, number], [number, number]] {
  const dLat = (raioKm / 6371) * (180 / Math.PI);
  const dLng = dLat / Math.cos((lat * Math.PI) / 180);
  return [
    [lng - dLng, lat - dLat],
    [lng + dLng, lat + dLat],
  ];
}
