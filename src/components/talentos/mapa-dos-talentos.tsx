"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MapaML } from "maplibre-gl";
import { Map as IconeMapa, MapPin, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CENTRO_GOIANIA } from "@/lib/config";
import type { BairroNoMapa, MapaDosTalentos as Dados } from "@/lib/servidor/mapa-dos-talentos";
import { carregarMapLibre, CORES_MAPA, ESTILO_MAPA, fonteDoEstilo, recolherCreditos, useMapaAVista } from "../mapa/maplibre";

function dadosDosBairros(bairros: BairroNoMapa[], escolhido: string | null): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: bairros.map((b) => ({
      type: "Feature",
      properties: { chave: b.chave, pessoas: b.pessoas, escolhido: b.chave === escolhido ? 1 : 0 },
      geometry: { type: "Point", coordinates: [b.lng, b.lat] },
    })),
  };
}

function dadosDasVagas(vagas: Dados["vagas"]): GeoJSON.FeatureCollection<GeoJSON.Point> {
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
 * O mapa dos talentos: um círculo por bairro, do tamanho de quantas pessoas moram nele (o número dentro), e as suas
 * vagas no ar em verde. Tocar num bairro mostra embaixo quem mora lá, com o link do currículo. Localização
 * aproximada: o centro do bairro que a pessoa escreveu no perfil, nunca a casa.
 */
export function MapaDosTalentos({ dados }: { dados: Dados }) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaML | null>(null);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);
  const aVista = useMapaAVista(caixa);
  const atuais = useRef({ bairros: dados.bairros, vagas: dados.vagas, escolhido });

  useEffect(() => {
    atuais.current = { bairros: dados.bairros, vagas: dados.vagas, escolhido };
    const m = mapa.current;
    (m?.getSource("bairros") as GeoJSONSource | undefined)?.setData(dadosDosBairros(dados.bairros, escolhido));
    (m?.getSource("vagas") as GeoJSONSource | undefined)?.setData(dadosDasVagas(dados.vagas));
  }, [dados.bairros, dados.vagas, escolhido]);

  useEffect(() => {
    if (!aVista) return;
    let cancelado = false;
    let instancia: MapaML | null = null;
    carregarMapLibre()
      .then((ml) => {
        if (cancelado || !caixa.current) return;
        const primeiro = atuais.current.bairros[0] ?? atuais.current.vagas[0] ?? CENTRO_GOIANIA;
        instancia = new ml.Map({
          container: caixa.current,
          style: ESTILO_MAPA,
          center: [primeiro.lng, primeiro.lat],
          zoom: 11,
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
          const { bairros, vagas, escolhido: atual } = atuais.current;
          m.addSource("bairros", { type: "geojson", data: dadosDosBairros(bairros, atual) });
          m.addSource("vagas", { type: "geojson", data: dadosDasVagas(vagas) });
          // a área aproximada do bairro: o círculo cresce com quantas pessoas moram nele
          m.addLayer({
            id: "bairros",
            type: "circle",
            source: "bairros",
            layout: { "circle-sort-key": ["get", "pessoas"] },
            paint: {
              "circle-radius": ["+", 11, ["*", 4, ["sqrt", ["get", "pessoas"]]]],
              "circle-color": CORES_MAPA.terra,
              "circle-opacity": 0.82,
              "circle-stroke-color": ["case", ["==", ["get", "escolhido"], 1], CORES_MAPA.ink, CORES_MAPA.branco],
              "circle-stroke-width": ["case", ["==", ["get", "escolhido"], 1], 3, 2],
            },
          });
          m.addLayer({
            id: "numeros",
            type: "symbol",
            source: "bairros",
            layout: {
              "text-field": ["to-string", ["get", "pessoas"]],
              "text-font": fonteDoEstilo(m),
              "text-size": 12,
              "text-allow-overlap": true,
            },
            paint: { "text-color": CORES_MAPA.branco },
          });
          m.addLayer({
            id: "vagas",
            type: "circle",
            source: "vagas",
            paint: {
              "circle-radius": 8,
              "circle-color": CORES_MAPA.cerrado,
              "circle-stroke-color": CORES_MAPA.branco,
              "circle-stroke-width": 2.5,
            },
          });
          m.on("click", "bairros", (e) => {
            const chave = e.features?.[0]?.properties?.chave;
            if (typeof chave === "string") setEscolhido(chave);
          });
          m.on("mouseenter", "bairros", () => (m.getCanvas().style.cursor = "pointer"));
          m.on("mouseleave", "bairros", () => (m.getCanvas().style.cursor = ""));
          const todos = [...bairros, ...vagas].map((p) => [p.lng, p.lat] as [number, number]);
          if (todos.length > 1) {
            const lngs = todos.map((t) => t[0]);
            const lats = todos.map((t) => t[1]);
            m.fitBounds(
              [
                [Math.min(...lngs), Math.min(...lats)],
                [Math.max(...lngs), Math.max(...lats)],
              ],
              { padding: 48, maxZoom: 14, duration: 0 },
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
  }, [aVista]);

  const bairro = dados.bairros.find((b) => b.chave === escolhido) ?? null;
  const noMapa = dados.bairros.reduce((t, b) => t + b.pessoas, 0);

  return (
    <section aria-labelledby="mapa-talentos-titulo" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="mapa-talentos-titulo" className="inline-flex items-center gap-2 text-h3">
          <IconeMapa aria-hidden className="size-5 text-ink-muted" />
          Onde estão os talentos
        </h2>
        <p className="text-body-sm text-ink-muted">
          {noMapa} no mapa
          {dados.semLugar > 0 ? ` · ${dados.semLugar} sem bairro no perfil` : ""}
        </p>
      </div>
      <div className="relative h-[min(52vh,26rem)] min-h-72 overflow-hidden rounded-lg border border-line bg-surface-300">
        <div
          ref={caixa}
          className="absolute inset-0"
          role="region"
          aria-label="Mapa dos talentos por bairro. Toque num bairro para ver quem mora lá na lista embaixo do mapa."
        />
        <p className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-x-3 gap-y-1 rounded-sm bg-surface-100/90 px-2 py-1 text-[12px] text-ink">
          {/* as cores fixas do mapa (o mapa não muda no tema escuro) */}
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: CORES_MAPA.terra }} /> Talentos
            no bairro (aproximado)
          </span>
          {dados.vagas.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: CORES_MAPA.cerrado }} />{" "}
              {dados.vagas.length === 1 ? "Sua vaga" : "Suas vagas"}
            </span>
          )}
        </p>
        {falhou && (
          <p className="absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-body-sm text-ink-muted">
            O mapa não carregou agora. A lista abaixo tem todos os talentos.
          </p>
        )}
      </div>
      {bairro ? (
        <div className="flex flex-col gap-2 rounded-lg border border-line-strong bg-surface-200 p-3 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="inline-flex items-center gap-1.5 text-label">
              <MapPin aria-hidden className="size-4 shrink-0 text-terra-text" />
              {bairro.bairro}, {bairro.cidade}: {bairro.pessoas} {bairro.pessoas === 1 ? "pessoa" : "pessoas"}
            </p>
            <button
              type="button"
              onClick={() => setEscolhido(null)}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-300 hover:text-ink"
              aria-label="Fechar o bairro"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
          <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {bairro.talentos.map((t) => (
              <li key={t.id} className="min-w-0">
                <Link href={`/talentos/${t.id}`} className="text-body-sm underline-offset-2 hover:underline">
                  <span className="text-label">{t.nome}</span>
                  {t.titulo ? <span className="text-ink-muted"> · {t.titulo}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
          {bairro.pessoas > bairro.talentos.length && (
            <p className="text-body-sm text-ink-muted">E mais {bairro.pessoas - bairro.talentos.length} neste bairro.</p>
          )}
        </div>
      ) : (
        <p className="text-body-sm text-ink-muted">
          Toque num bairro para ver quem mora lá. Cada pessoa aparece no centro do bairro que escreveu no perfil, nunca no
          endereço.
        </p>
      )}
    </section>
  );
}
