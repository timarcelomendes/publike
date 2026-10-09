"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MapaML, MapGeoJSONFeature } from "maplibre-gl";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { REGIAO } from "@/lib/config";
import { hrefFiltros, raioDaBusca, type Filtros } from "@/lib/filtros";
import { caixaDoRaio, carregarMapLibre, circulo, CORES_MAPA, ESTILO_MAPA } from "./maplibre";

export type PontoMapa = {
  id: string;
  lat: number;
  lng: number;
  titulo: string;
  tipo: string;
  lugar: string;
  valor: string;
};

function paraGeoJSON(pontos: PontoMapa[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: pontos.map((p) => ({
      type: "Feature",
      properties: { id: p.id, titulo: p.titulo, tipo: p.tipo, lugar: p.lugar, valor: p.valor },
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    })),
  };
}

/** Mapa da busca: agrupa anúncios próximos e mostra o raio da busca. */
export function MapaAnuncios({ pontos, filtros }: { pontos: PontoMapa[]; filtros: Filtros }) {
  const router = useRouter();
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaML | null>(null);
  const [pronto, setPronto] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [movido, setMovido] = useState(false);

  // Cria o mapa uma vez
  useEffect(() => {
    let cancelado = false;
    let instancia: MapaML | null = null;

    carregarMapLibre()
      .then((ml) => {
        if (cancelado || !caixa.current) return;
        instancia = new ml.Map({
          container: caixa.current,
          style: ESTILO_MAPA,
          bounds: caixaDoRaio(filtros.lat, filtros.lng, raioDaBusca(filtros)),
          fitBoundsOptions: { padding: 24 },
          attributionControl: { compact: true },
          maxBounds: [
            [REGIAO.lngMin - 0.5, REGIAO.latMin - 0.5],
            [REGIAO.lngMax + 0.5, REGIAO.latMax + 0.5],
          ],
        });
        mapa.current = instancia;
        instancia.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");

        instancia.on("load", () => {
          const m = instancia!;
          m.addSource("raio", { type: "geojson", data: circulo(filtros.lat, filtros.lng, raioDaBusca(filtros)) });
          m.addLayer({
            id: "raio-fundo",
            type: "fill",
            source: "raio",
            paint: { "fill-color": CORES_MAPA.terra, "fill-opacity": 0.05 },
          });
          m.addLayer({
            id: "raio-borda",
            type: "line",
            source: "raio",
            paint: { "line-color": CORES_MAPA.terra, "line-width": 1.5, "line-opacity": 0.5, "line-dasharray": [2, 2] },
          });

          m.addSource("anuncios", {
            type: "geojson",
            data: paraGeoJSON([]),
            cluster: true,
            clusterRadius: 44,
            clusterMaxZoom: 15,
          });
          m.addLayer({
            id: "grupos",
            type: "circle",
            source: "anuncios",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": CORES_MAPA.ink,
              "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 30, 26],
              "circle-stroke-width": 3,
              "circle-stroke-color": CORES_MAPA.branco,
            },
          });
          m.addLayer({
            id: "grupos-numero",
            type: "symbol",
            source: "anuncios",
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"],
              "text-font": ["Noto Sans Bold"],
              "text-size": 13,
              "text-allow-overlap": true,
            },
            paint: { "text-color": CORES_MAPA.branco },
          });
          m.addLayer({
            id: "pontos",
            type: "circle",
            source: "anuncios",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": ["match", ["get", "tipo"], "vaga", CORES_MAPA.terra, CORES_MAPA.cerrado],
              "circle-radius": 9,
              "circle-stroke-width": 3,
              "circle-stroke-color": CORES_MAPA.branco,
            },
          });

          m.on("click", "grupos", async (e) => {
            const grupo = e.features?.[0];
            if (!grupo || grupo.geometry.type !== "Point") return;
            const fonte = m.getSource("anuncios") as GeoJSONSource;
            const zoom = await fonte.getClusterExpansionZoom(grupo.properties.cluster_id as number);
            m.easeTo({ center: grupo.geometry.coordinates as [number, number], zoom });
          });

          m.on("click", "pontos", (e) => {
            const ponto = e.features?.[0] as MapGeoJSONFeature | undefined;
            if (!ponto || ponto.geometry.type !== "Point") return;
            const p = ponto.properties as Record<string, string>;
            const conteudo = document.createElement("div");
            conteudo.style.maxWidth = "220px";
            const link = document.createElement("a");
            link.href = `/anuncio/${p.id}`;
            link.textContent = p.titulo;
            link.style.cssText = "font-weight:700;font-size:15px;line-height:20px;color:inherit;text-decoration:underline;";
            link.addEventListener("click", (ev) => {
              ev.preventDefault();
              router.push(`/anuncio/${p.id}`);
            });
            const lugar = document.createElement("p");
            lugar.textContent = p.lugar;
            lugar.style.cssText = "margin:4px 0 0;font-size:13px;opacity:.75;";
            const valor = document.createElement("p");
            valor.textContent = p.valor;
            valor.style.cssText = "margin:2px 0 0;font-size:13px;font-weight:600;";
            conteudo.append(link, lugar, valor);
            new ml.Popup({ offset: 12, maxWidth: "240px" })
              .setLngLat(ponto.geometry.coordinates as [number, number])
              .setDOMContent(conteudo)
              .addTo(m);
          });

          for (const camada of ["grupos", "pontos"]) {
            m.on("mouseenter", camada, () => (m.getCanvas().style.cursor = "pointer"));
            m.on("mouseleave", camada, () => (m.getCanvas().style.cursor = ""));
          }

          m.on("moveend", (e) => {
            if ((e as { originalEvent?: unknown }).originalEvent) setMovido(true);
          });

          setPronto(true);
        });
        instancia.on("error", (e) => {
          if (!instancia?.isStyleLoaded()) setFalhou(Boolean(e.error));
        });
      })
      .catch(() => setFalhou(true));

    return () => {
      cancelado = true;
      instancia?.remove();
      mapa.current = null;
    };
    // O mapa é criado uma vez; mudanças de filtro são tratadas abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Atualiza os pontos quando a busca muda
  useEffect(() => {
    const m = mapa.current;
    if (!pronto || !m) return;
    (m.getSource("anuncios") as GeoJSONSource | undefined)?.setData(paraGeoJSON(pontos));
  }, [pronto, pontos]);

  // Reenquadra quando o centro ou o raio (ou o tempo de ônibus) mudam
  const raioKm = raioDaBusca(filtros);
  useEffect(() => {
    const m = mapa.current;
    if (!pronto || !m) return;
    (m.getSource("raio") as GeoJSONSource | undefined)?.setData(circulo(filtros.lat, filtros.lng, raioKm));
    m.fitBounds(caixaDoRaio(filtros.lat, filtros.lng, raioKm), { padding: 24, duration: 600 });
    setMovido(false);
  }, [pronto, filtros.lat, filtros.lng, raioKm]);

  function buscarAqui() {
    const m = mapa.current;
    if (!m) return;
    const c = m.getCenter();
    setMovido(false);
    router.push(
      hrefFiltros(filtros, { lat: Math.round(c.lat * 10000) / 10000, lng: Math.round(c.lng * 10000) / 10000, origem: "mapa" }),
      { scroll: false },
    );
  }

  return (
    <div className="relative h-full min-h-[320px] overflow-hidden rounded-lg border border-line bg-surface-300">
      {/* O MapLibre põe position: relative no próprio container (e o CSS dele vence o do Tailwind):
          por isso o container fica dentro de uma caixa absoluta e só ocupa 100% dela. */}
      <div className="absolute inset-0">
        <div ref={caixa} className="h-full w-full" aria-label="Mapa dos anúncios" role="region" />
      </div>
      {movido && (
        <button
          type="button"
          onClick={buscarAqui}
          className="absolute top-3 left-1/2 z-10 inline-flex min-h-10 -translate-x-1/2 items-center gap-2 rounded-pill border border-line-strong bg-surface-200 px-4 text-label text-ink shadow-raised hover:bg-surface-300"
        >
          <Search aria-hidden className="size-4" />
          Buscar nesta área
        </button>
      )}
      {falhou && (
        <p className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-md bg-surface-200 p-4 text-center text-body-sm text-ink-muted shadow-card">
          Não foi possível carregar o mapa agora. A lista ao lado continua funcionando.
        </p>
      )}
      <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex gap-3 rounded-pill bg-surface-200/95 px-3 py-1.5 text-caption text-ink shadow-card">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-pill" style={{ background: CORES_MAPA.terra }} /> VAGAS
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-pill" style={{ background: CORES_MAPA.cerrado }} /> SERVIÇOS
        </span>
      </div>
    </div>
  );
}
