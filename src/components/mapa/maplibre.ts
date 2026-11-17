import { useEffect, useState, type RefObject } from "react";
import { MAPA_ESTILO } from "@/lib/config";

// Carrega o MapLibre só no navegador e só quando um mapa aparece na tela.
// O "worker" do mapa é copiado para public/vendor por scripts/copiar-worker-mapa.mjs.

type MapLibre = typeof import("maplibre-gl");
type MapaML = import("maplibre-gl").Map;

let carregando: Promise<MapLibre> | null = null;

export function carregarMapLibre() {
  if (!carregando) {
    // o CSS do mapa vem junto, só quando um mapa aparece (17/11/2026: importado nos componentes, ele ia no CSS de toda
    // página que tem um mapa, ~12 KiB a mais segurando a primeira pintura no celular)
    carregando = Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")]).then(([ml]) => {
      ml.setWorkerUrl(`/vendor/maplibre-gl-worker.mjs?v=${ml.getVersion()}`);
      return ml;
    });
  }
  return carregando;
}

/**
 * O mapa está (ou fica) à vista? Só então vale baixar o MapLibre: a coluna do mapa da home, que só
 * aparece no computador grande, e o mapa no pé da página da vaga não pesam no celular. Chegando perto
 * ao rolar (300 px), já começa a carregar.
 *
 * E só depois de a página carregar, com o navegador à toa (17/11/2026): o MapLibre é ~1 MB de JavaScript e a
 * montagem do mapa trava a tela por 0,2 a 0,7 s. Na home do computador, isso vinha no meio da hidratação, e era a
 * maior parte do Total Blocking Time (1,7 s no PageSpeed) e da espera dos primeiros cliques.
 */
export function useMapaAVista(caixa: RefObject<HTMLElement | null>, metade = false) {
  const livre = usePaginaLivre();
  const [aVista, setAVista] = useState(false);
  useEffect(() => {
    const el = caixa.current;
    if (!el || aVista) return;
    const pronto = () => {
      olho.disconnect();
      el.removeEventListener("pointerenter", pronto);
      el.removeEventListener("focusin", pronto);
      setAVista(true);
    };
    // `metade`: só com metade do mapa na tela (ou o mouse ou o foco nele). O mapa ao lado da lista da home, no
    // computador, começa quase todo abaixo da dobra: carrega ao rolar (ele gruda no alto), e não junto com a página.
    // Só para o mapa ao lado da lista: na vista Mapa do celular, a caixa começa no pé da tela e ficaria vazia
    // até rolar (17/11/2026)
    const olho = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => (metade ? e.intersectionRatio >= 0.5 : e.isIntersecting))) pronto();
      },
      metade ? { threshold: [0, 0.5, 1] } : { rootMargin: "300px 0px" },
    );
    olho.observe(el);
    if (metade) {
      el.addEventListener("pointerenter", pronto);
      el.addEventListener("focusin", pronto);
    }
    return () => {
      olho.disconnect();
      el.removeEventListener("pointerenter", pronto);
      el.removeEventListener("focusin", pronto);
    };
  }, [caixa, aVista, metade]);
  return aVista && livre;
}

/** A página já carregou e o navegador ficou à toa (ou passaram 2 s do load): a hora do que pesa e pode esperar. */
function usePaginaLivre() {
  const [livre, setLivre] = useState(false);
  useEffect(() => {
    let cancelado = false;
    const marcar = () => {
      if (!cancelado) setLivre(true);
    };
    const depoisDoLoad = () => {
      if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(marcar, { timeout: 2000 });
      else setTimeout(marcar, 300);
    };
    if (document.readyState === "complete") depoisDoLoad();
    else window.addEventListener("load", depoisDoLoad, { once: true });
    return () => {
      cancelado = true;
      window.removeEventListener("load", depoisDoLoad);
    };
  }, []);
  return livre;
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

/**
 * No estilo do mapa (positron), rua comum só ganha nome a partir do zoom 15, e o
 * mapa da área abre no 14: sem isto ele fica sem nome nenhum. Liga os nomes das
 * ruas a partir de `aPartirDe` (os blocos do mapa trazem esses nomes a partir do 14).
 */
export function mostrarNomesDasRuas(mapa: MapaML, aPartirDe = 14) {
  for (const camada of mapa.getStyle().layers ?? []) {
    const fonte = (camada as { "source-layer"?: string })["source-layer"];
    if (camada.type !== "symbol" || fonte !== "transportation_name") continue;
    if (/path|shield/.test(camada.id)) continue;
    if ((camada.minzoom ?? 0) > aPartirDe) mapa.setLayerZoomRange(camada.id, aPartirDe, camada.maxzoom ?? 24);
  }
}

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

/** A fonte das letras do próprio estilo do mapa (o estilo só tem as fontes que ele usa). */
export function fonteDoEstilo(m: MapaML): string[] {
  const fontes: string[][] = [];
  for (const camada of m.getStyle().layers ?? []) {
    if (camada.type !== "symbol") continue;
    const f = (camada.layout as { "text-font"?: unknown } | undefined)?.["text-font"];
    if (Array.isArray(f) && f.length && f.every((x) => typeof x === "string")) fontes.push(f as string[]);
  }
  // a fonte comum (a primeira do estilo costuma ser a itálica dos nomes de rio e lago)
  return fontes.find((f) => f.some((x) => /regular/i.test(x))) ?? fontes.find((f) => !f.some((x) => /italic/i.test(x))) ?? fontes[0] ?? ["Noto Sans Regular"];
}
