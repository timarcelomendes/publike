"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MapaML } from "maplibre-gl";
import { LocateFixed } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CENTRO_GOIANIA, REGIAO } from "@/lib/config";
import { Botao } from "../ui/botao";
import { carregarMapLibre, circulo, CORES_MAPA, ESTILO_MAPA } from "./maplibre";

type Ponto = { lat: number; lng: number };

function dentroDaRegiao(p: Ponto) {
  return p.lat >= REGIAO.latMin && p.lat <= REGIAO.latMax && p.lng >= REGIAO.lngMin && p.lng <= REGIAO.lngMax;
}

/**
 * Escolha da região do trabalho. A pessoa toca no mapa (ou usa a
 * localização); guardamos só uma área de ~500 m, nunca o endereço.
 */
export function SeletorLocal({
  inicial,
  erro,
}: {
  inicial: Ponto | null;
  erro?: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaML | null>(null);
  const [ponto, setPonto] = useState<Ponto | null>(inicial);
  const [pronto, setPronto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [buscandoGps, setBuscandoGps] = useState(false);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let cancelado = false;
    let instancia: MapaML | null = null;
    carregarMapLibre()
      .then((ml) => {
      if (cancelado || !caixa.current) return;
      const centro = inicial ?? CENTRO_GOIANIA;
      instancia = new ml.Map({
        container: caixa.current,
        style: ESTILO_MAPA,
        center: [centro.lng, centro.lat],
        zoom: inicial ? 14 : 11,
        cooperativeGestures: true,
        attributionControl: { compact: true },
      });
      mapa.current = instancia;
      instancia.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      instancia.on("error", (e) => {
        if (!instancia?.isStyleLoaded() && e.error) setFalhou(true);
      });
      instancia.on("load", () => {
        const m = instancia!;
        m.addSource("escolha", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({
          id: "escolha-fundo",
          type: "fill",
          source: "escolha",
          paint: { "fill-color": CORES_MAPA.terra, "fill-opacity": 0.18 },
        });
        m.addLayer({
          id: "escolha-borda",
          type: "line",
          source: "escolha",
          paint: { "line-color": CORES_MAPA.terra, "line-width": 2 },
        });
        m.on("click", (e) => {
          const p = { lat: e.lngLat.lat, lng: e.lngLat.lng };
          if (!dentroDaRegiao(p)) {
            setAviso("Por enquanto o Publike funciona em Goiânia e região.");
            return;
          }
          setAviso(null);
          setPonto(p);
        });
        setPronto(true);
      });
    })
      .catch(() => setFalhou(true));
    return () => {
      cancelado = true;
      instancia?.remove();
      mapa.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = mapa.current;
    if (!pronto || !m) return;
    const fonte = m.getSource("escolha") as GeoJSONSource | undefined;
    fonte?.setData(ponto ? circulo(ponto.lat, ponto.lng, 0.5) : { type: "FeatureCollection", features: [] });
  }, [pronto, ponto]);

  function usarMinhaLocalizacao() {
    if (!("geolocation" in navigator)) {
      setAviso("Seu navegador não informa a localização. Toque no mapa para marcar.");
      return;
    }
    setBuscandoGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBuscandoGps(false);
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!dentroDaRegiao(p)) {
          setAviso("Você parece estar fora de Goiânia e região. Toque no mapa para marcar o local do trabalho.");
          return;
        }
        setAviso(null);
        setPonto(p);
        mapa.current?.flyTo({ center: [p.lng, p.lat], zoom: 14 });
      },
      () => {
        setBuscandoGps(false);
        setAviso("Não conseguimos sua localização. Toque no mapa para marcar.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className={`relative h-72 overflow-hidden rounded-lg border bg-surface-300 ${erro && !ponto ? "border-danger" : "border-line"}`}
      >
        {/* Container do MapLibre dentro de uma caixa absoluta: o CSS dele troca o position do container. */}
        <div className="absolute inset-0">
          <div ref={caixa} className="h-full w-full" role="region" aria-label="Mapa para marcar a região do trabalho" />
        </div>
        {falhou && (
          <p className="absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-body-sm text-ink">
            O mapa não carregou agora. Use o botão “Usar minha localização” abaixo, ou recarregue a página.
          </p>
        )}
        {!ponto && !falhou && (
          <p className="pointer-events-none absolute inset-x-3 bottom-3 rounded-md bg-surface-200/95 px-3 py-2 text-center text-body-sm text-ink shadow-card">
            Toque no mapa perto de onde é o trabalho
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Botao tamanho="sm" onClick={usarMinhaLocalizacao} disabled={buscandoGps}>
          <LocateFixed aria-hidden />
          {buscandoGps ? "Procurando…" : "Usar minha localização"}
        </Botao>
        <p className="text-body-sm text-ink-muted" aria-live="polite">
          {ponto ? "Região marcada. Mostramos só uma área de uns 500 m." : "Nenhuma região marcada ainda."}
        </p>
      </div>
      {aviso && <p className="text-body-sm text-terra-text">{aviso}</p>}
      <input type="hidden" name="lat" value={ponto ? ponto.lat.toFixed(5) : ""} />
      <input type="hidden" name="lng" value={ponto ? ponto.lng.toFixed(5) : ""} />
    </div>
  );
}
