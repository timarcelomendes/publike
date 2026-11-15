"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MapaML } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import {
  carregarMapLibre,
  CORES_MAPA,
  ESTILO_MAPA,
  mostrarNomesDasRuas,
  recolherCreditos,
  useMapaAVista,
} from "../mapa/maplibre";

export type PontoDaRota = { cnpj: string; nome: string; lat: number; lng: number; escolhido: boolean };

function dados(pontos: PontoDaRota[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: pontos.map((p) => ({
      type: "Feature",
      properties: { cnpj: p.cnpj, nome: p.nome, escolhido: p.escolhido ? 1 : 0 },
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    })),
  };
}

/** A fonte das letras do próprio estilo do mapa (o estilo só tem as fontes que ele usa). */
function fonteDoEstilo(m: MapaML): string[] {
  for (const camada of m.getStyle().layers ?? []) {
    if (camada.type !== "symbol") continue;
    const f = (camada.layout as { "text-font"?: unknown } | undefined)?.["text-font"];
    if (Array.isArray(f) && f.every((x) => typeof x === "string")) return f as string[];
  }
  return ["Noto Sans Regular"];
}

/**
 * O mapa da rota do currículo: a casa e os lugares. Os escolhidos ficam em destaque, com o nome ao lado;
 * tocar num ponto escolhe ou tira o lugar.
 */
export function MapaDaRota({
  casa,
  pontos,
  aoTocar,
}: {
  casa: { lat: number; lng: number };
  pontos: PontoDaRota[];
  aoTocar?: (cnpj: string) => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaML | null>(null);
  const atuais = useRef(pontos);
  const tocar = useRef(aoTocar);
  const [falhou, setFalhou] = useState(false);
  const aVista = useMapaAVista(caixa);

  useEffect(() => {
    tocar.current = aoTocar;
  }, [aoTocar]);

  useEffect(() => {
    atuais.current = pontos;
    const fonte = mapa.current?.getSource("lugares") as GeoJSONSource | undefined;
    fonte?.setData(dados(pontos));
  }, [pontos]);

  useEffect(() => {
    if (!aVista) return;
    let cancelado = false;
    let instancia: MapaML | null = null;
    carregarMapLibre()
      .then((ml) => {
        if (cancelado || !caixa.current) return;
        instancia = new ml.Map({
          container: caixa.current,
          style: ESTILO_MAPA,
          center: [casa.lng, casa.lat],
          zoom: 13,
          cooperativeGestures: true,
          attributionControl: { compact: true },
        });
        mapa.current = instancia;
        instancia.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        instancia.on("error", (e) => {
          if (!instancia?.isStyleLoaded() && e.error) setFalhou(true);
        });
        recolherCreditos(instancia);
        instancia.on("load", () => {
          const m = instancia!;
          mostrarNomesDasRuas(m);
          m.addSource("lugares", { type: "geojson", data: dados(atuais.current) });
          m.addLayer({
            id: "lugares",
            type: "circle",
            source: "lugares",
            paint: {
              "circle-radius": ["case", ["==", ["get", "escolhido"], 1], 8, 6],
              "circle-color": ["case", ["==", ["get", "escolhido"], 1], CORES_MAPA.terra, "#b4aba2"],
              "circle-stroke-color": CORES_MAPA.branco,
              "circle-stroke-width": 2,
            },
          });
          m.addLayer({
            id: "nomes-dos-escolhidos",
            type: "symbol",
            source: "lugares",
            filter: ["==", ["get", "escolhido"], 1],
            layout: {
              "text-field": ["get", "nome"],
              "text-font": fonteDoEstilo(m),
              "text-size": 12,
              "text-max-width": 10,
              "text-variable-anchor": ["left", "right", "top", "bottom"],
              "text-radial-offset": 0.9,
              "text-justify": "auto",
              "text-optional": true,
            },
            paint: {
              "text-color": CORES_MAPA.ink,
              "text-halo-color": CORES_MAPA.branco,
              "text-halo-width": 1.6,
            },
          });
          m.addSource("casa", {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [casa.lng, casa.lat] } },
          });
          m.addLayer({
            id: "casa",
            type: "circle",
            source: "casa",
            paint: {
              "circle-radius": 9,
              "circle-color": CORES_MAPA.ink,
              "circle-stroke-color": CORES_MAPA.branco,
              "circle-stroke-width": 3,
            },
          });
          m.on("click", "lugares", (e) => {
            const cnpj = e.features?.[0]?.properties?.cnpj;
            if (typeof cnpj === "string") tocar.current?.(cnpj);
          });
          m.on("mouseenter", "lugares", () => (m.getCanvas().style.cursor = "pointer"));
          m.on("mouseleave", "lugares", () => (m.getCanvas().style.cursor = ""));
          const todos = [...atuais.current.map((p) => [p.lng, p.lat] as [number, number]), [casa.lng, casa.lat] as [number, number]];
          if (todos.length > 1) {
            const lngs = todos.map((t) => t[0]);
            const lats = todos.map((t) => t[1]);
            m.fitBounds(
              [
                [Math.min(...lngs), Math.min(...lats)],
                [Math.max(...lngs), Math.max(...lats)],
              ],
              { padding: 40, maxZoom: 15, duration: 0 },
            );
          }
        });
      })
      .catch(() => setFalhou(true));
    return () => {
      cancelado = true;
      mapa.current = null;
      instancia?.remove();
    };
  }, [aVista, casa.lat, casa.lng]);

  return (
    <div className="relative h-72 overflow-hidden rounded-lg border border-line bg-surface-300 sm:h-96">
      <div className="absolute inset-0">
        <div
          ref={caixa}
          className="h-full w-full"
          role="region"
          aria-label="Mapa da rota: a sua casa e os lugares. Toque num ponto para escolher o lugar."
        />
      </div>
      <p className="absolute bottom-2 left-2 rounded-sm bg-surface-100/90 px-2 py-1 text-[12px] text-ink">
        <span className="mr-1 inline-block size-2.5 rounded-full bg-ink align-middle" /> Sua casa
        <span className="ml-3 mr-1 inline-block size-2.5 rounded-full bg-terra align-middle" /> Vai entregar
        <span className="ml-3 mr-1 inline-block size-2.5 rounded-full bg-[#b4aba2] align-middle" /> Outros lugares
      </p>
      {falhou && (
        <p className="absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-body-sm text-ink-muted">
          O mapa não carregou agora. A lista abaixo tem todos os lugares.
        </p>
      )}
    </div>
  );
}
