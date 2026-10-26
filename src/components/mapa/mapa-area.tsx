"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapaML } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import {
  carregarMapLibre,
  circulo,
  CORES_MAPA,
  ESTILO_MAPA,
  mostrarNomesDasRuas,
  recolherCreditos,
  useMapaAVista,
} from "./maplibre";

/**
 * Onde é o trabalho: uma área aproximada ou, quando o endereço é público
 * (comércio, empresa e agência), o pino na porta.
 *
 * Área: o ponto salvo é arredondado numa grade de 0,005° (uns 500 m), então o
 * endereço fica a no máximo ~385 m dele; o círculo de 400 m cobre isso. O mapa
 * abre no zoom 14, com os nomes das ruas, para a pessoa reconhecer onde é. O
 * bairro do anúncio não vai escrito no mapa: ele é digitado à parte e pode não
 * bater com o ponto; os nomes do próprio mapa nunca contradizem o lugar.
 */
export function MapaArea({
  lat,
  lng,
  raioKm = 0.4,
  exato = false,
}: {
  lat: number;
  lng: number;
  raioKm?: number;
  exato?: boolean;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [falhou, setFalhou] = useState(false);
  // o MapLibre só baixa com o mapa à vista (ou perto, ao rolar)
  const aVista = useMapaAVista(caixa);

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
        center: [lng, lat],
        zoom: exato ? 15.5 : 14,
        cooperativeGestures: true,
        attributionControl: { compact: true },
      });
      instancia.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      instancia.on("error", (e) => {
        if (!instancia?.isStyleLoaded() && e.error) setFalhou(true);
      });
      recolherCreditos(instancia);
      instancia.on("load", () => {
        const m = instancia!;
        mostrarNomesDasRuas(m);
        if (exato) {
          m.addSource("pino", {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lng, lat] } },
          });
          m.addLayer({
            id: "pino",
            type: "circle",
            source: "pino",
            paint: {
              "circle-radius": 9,
              "circle-color": CORES_MAPA.terra,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 3,
            },
          });
          return;
        }
        m.addSource("area", { type: "geojson", data: circulo(lat, lng, raioKm) });
        m.addLayer({
          id: "area-fundo",
          type: "fill",
          source: "area",
          paint: { "fill-color": CORES_MAPA.terra, "fill-opacity": 0.16 },
        });
        m.addLayer({
          id: "area-borda",
          type: "line",
          source: "area",
          paint: { "line-color": CORES_MAPA.terra, "line-width": 2, "line-opacity": 0.7 },
        });
      });
    })
      .catch(() => setFalhou(true));
    return () => {
      cancelado = true;
      instancia?.remove();
    };
  }, [aVista, lat, lng, raioKm, exato]);

  return (
    <div className="relative h-56 overflow-hidden rounded-lg border border-line bg-surface-300 sm:h-64">
      {/* Container do MapLibre dentro de uma caixa absoluta: o CSS dele troca o position do container. */}
      <div className="absolute inset-0">
        <div ref={caixa} className="h-full w-full" role="region" aria-label={exato ? "Mapa com o local do trabalho" : "Mapa com a região aproximada"} />
      </div>
      {falhou && (
        <p className="absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-body-sm text-ink-muted">
          O mapa não carregou agora.
        </p>
      )}
    </div>
  );
}
