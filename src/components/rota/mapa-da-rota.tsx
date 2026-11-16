"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { ExpressionSpecification, GeoJSONSource, Map as MapaML } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import {
  carregarMapLibre,
  CORES_MAPA,
  ESTILO_MAPA,
  fonteDoEstilo,
  mostrarNomesDasRuas,
  recolherCreditos,
  useMapaAVista,
} from "../mapa/maplibre";

export type PontoDaRota = { cnpj: string; nome: string; lat: number; lng: number; escolhido: boolean };
/** Uma vaga no ar no Publike da mesma função: outra cor no mapa e o título ao lado. */
export type VagaNoMapa = { id: string; titulo: string; lat: number; lng: number };

/** O lugar escolhido para levar impresso (na expressão do MapLibre). */
const ESCOLHIDO: ExpressionSpecification = ["==", ["get", "escolhido"], 1];

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

function dadosDasVagas(vagas: VagaNoMapa[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: vagas.map((v) => ({
      type: "Feature",
      properties: { id: v.id, titulo: v.titulo },
      geometry: { type: "Point", coordinates: [v.lng, v.lat] },
    })),
  };
}

/**
 * O mapa da rota do currículo, no alto da página: o ponto de partida, as vagas no ar no Publike (verde, com o título) e
 * os lugares que costumam contratar a função. Os escolhidos ficam em destaque, com o nome ao lado; tocar num lugar
 * escolhe ou tira, e tocar numa vaga leva ao cartão dela.
 */
export function MapaDaRota({
  casa,
  rotuloCasa = "Sua casa",
  pontos,
  vagas = [],
  aoTocar,
  aoTocarVaga,
  className = "",
}: {
  /** a altura em telas grandes (ao lado da lista) */
  className?: string;
  casa: { lat: number; lng: number };
  /** "Sua casa", "Você", "Seu bairro" ou "Centro de Goiânia" */
  rotuloCasa?: string;
  pontos: PontoDaRota[];
  vagas?: VagaNoMapa[];
  aoTocar?: (cnpj: string) => void;
  aoTocarVaga?: (id: string) => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaML | null>(null);
  const atuais = useRef(pontos);
  const atuaisVagas = useRef(vagas);
  const tocar = useRef(aoTocar);
  const tocarVaga = useRef(aoTocarVaga);
  const [falhou, setFalhou] = useState(false);
  const aVista = useMapaAVista(caixa);

  useEffect(() => {
    tocar.current = aoTocar;
    tocarVaga.current = aoTocarVaga;
  }, [aoTocar, aoTocarVaga]);

  useEffect(() => {
    atuais.current = pontos;
    const fonte = mapa.current?.getSource("lugares") as GeoJSONSource | undefined;
    fonte?.setData(dados(pontos));
  }, [pontos]);

  useEffect(() => {
    atuaisVagas.current = vagas;
    const fonte = mapa.current?.getSource("vagas") as GeoJSONSource | undefined;
    fonte?.setData(dadosDasVagas(vagas));
  }, [vagas]);

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
          const fonte = fonteDoEstilo(m);
          mostrarNomesDasRuas(m);
          m.addSource("casa", {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [casa.lng, casa.lat] } },
          });
          // o ponto de partida com um halo, como o "você está aqui" dos mapas (por baixo dos lugares, para não apagá-los)
          m.addLayer({
            id: "casa-halo",
            type: "circle",
            source: "casa",
            paint: { "circle-radius": 20, "circle-color": CORES_MAPA.ink, "circle-opacity": 0.12 },
          });
          m.addSource("lugares", { type: "geojson", data: dados(atuais.current) });
          // quem contrata em terracota, a cor do Publike, que aparece bem no mapa claro (o cinza sumia no fundo), e
          // crescendo com o zoom; os escolhidos para levar impresso ficam maiores, com o contorno escuro e o nome ao lado
          m.addLayer({
            id: "lugares",
            type: "circle",
            source: "lugares",
            layout: { "circle-sort-key": ["get", "escolhido"] },
            paint: {
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                11,
                ["case", ESCOLHIDO, 6, 4],
                14,
                ["case", ESCOLHIDO, 9, 6.5],
                17,
                ["case", ESCOLHIDO, 12, 9],
              ],
              "circle-color": CORES_MAPA.terra,
              "circle-stroke-color": ["case", ESCOLHIDO, CORES_MAPA.ink, CORES_MAPA.branco],
              "circle-stroke-width": ["case", ESCOLHIDO, 3, 1.5],
            },
          });
          m.addLayer({
            id: "nomes-dos-escolhidos",
            type: "symbol",
            source: "lugares",
            filter: ESCOLHIDO,
            layout: {
              "text-field": ["get", "nome"],
              "text-font": fonte,
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
          // as vagas do Publike por cima dos lugares: é o que a pessoa pode fazer agora
          m.addSource("vagas", { type: "geojson", data: dadosDasVagas(atuaisVagas.current) });
          m.addLayer({
            id: "vagas",
            type: "circle",
            source: "vagas",
            paint: {
              "circle-radius": 9,
              "circle-color": CORES_MAPA.cerrado,
              "circle-stroke-color": CORES_MAPA.branco,
              "circle-stroke-width": 2.5,
            },
          });
          m.addLayer({
            id: "titulos-das-vagas",
            type: "symbol",
            source: "vagas",
            layout: {
              "text-field": ["get", "titulo"],
              "text-font": fonte,
              "text-size": 12,
              "text-max-width": 11,
              "text-variable-anchor": ["left", "right", "top", "bottom"],
              "text-radial-offset": 1,
              "text-justify": "auto",
              "text-optional": true,
            },
            paint: {
              "text-color": CORES_MAPA.cerrado,
              "text-halo-color": CORES_MAPA.branco,
              "text-halo-width": 1.8,
            },
          });
          // e o ponto de partida por cima de tudo
          m.addLayer({
            id: "casa",
            type: "circle",
            source: "casa",
            paint: {
              "circle-radius": 8,
              "circle-color": CORES_MAPA.ink,
              "circle-stroke-color": CORES_MAPA.branco,
              "circle-stroke-width": 3,
            },
          });
          m.on("click", "lugares", (e) => {
            const cnpj = e.features?.[0]?.properties?.cnpj;
            if (typeof cnpj === "string") tocar.current?.(cnpj);
          });
          m.on("click", "vagas", (e) => {
            const id = e.features?.[0]?.properties?.id;
            if (typeof id === "string") tocarVaga.current?.(id);
          });
          for (const camada of ["lugares", "vagas"]) {
            m.on("mouseenter", camada, () => (m.getCanvas().style.cursor = "pointer"));
            m.on("mouseleave", camada, () => (m.getCanvas().style.cursor = ""));
          }
          const todos = [
            ...atuais.current.map((p) => [p.lng, p.lat] as [number, number]),
            ...atuaisVagas.current.map((v) => [v.lng, v.lat] as [number, number]),
            [casa.lng, casa.lat] as [number, number],
          ];
          if (todos.length > 1) {
            const lngs = todos.map((t) => t[0]);
            const lats = todos.map((t) => t[1]);
            m.fitBounds(
              [
                [Math.min(...lngs), Math.min(...lats)],
                [Math.max(...lngs), Math.max(...lats)],
              ],
              { padding: 48, maxZoom: 15, duration: 0 },
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
    <div className={`relative h-[min(62vh,34rem)] min-h-80 overflow-hidden rounded-lg border border-line bg-surface-300 ${className}`}>
      <div className="absolute inset-0">
        <div
          ref={caixa}
          className="h-full w-full"
          role="region"
          aria-label="Mapa de quem contrata perto: o ponto de partida, as vagas no ar e os lugares. Toque num lugar para ver os detalhes dele na lista."
        />
      </div>
      <p className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-x-3 gap-y-1 rounded-sm bg-surface-100/90 px-2 py-1 text-[12px] text-ink">
        {/* as cores fixas do mapa (o mapa não muda no tema escuro) */}
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: CORES_MAPA.ink }} /> {rotuloCasa}
        </span>
        {vagas.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: CORES_MAPA.cerrado }} /> Vaga no
            Publike
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: CORES_MAPA.terra }} /> Quem
          contrata
        </span>
        {pontos.some((p) => p.escolhido) && (
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ backgroundColor: CORES_MAPA.terra, boxShadow: `0 0 0 2px ${CORES_MAPA.ink}` }}
            />{" "}
            Levar impresso
          </span>
        )}
      </p>
      {falhou && (
        <p className="absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-body-sm text-ink-muted">
          O mapa não carregou agora. A lista abaixo tem todos os lugares.
        </p>
      )}
    </div>
  );
}
