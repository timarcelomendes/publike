"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MapaML } from "maplibre-gl";
import { ChevronDown, ChevronLeft, MapPin } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CENTRO_GOIANIA } from "@/lib/config";
import { formatarNumero } from "@/lib/formato";
import type { BairroNoMapa, MapaDosTalentos as Dados } from "@/lib/mapa-dos-talentos";
import { carregarMapLibre, CORES_MAPA, ESTILO_MAPA, fonteDoEstilo, recolherCreditos, useMapaAVista } from "../mapa/maplibre";

/** No celular, quantos bairros a lista mostra antes do "Ver mais bairros". */
const BAIRROS_NO_CELULAR = 5;

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

/** A nota de aderência no painel do bairro (as mesmas cores da nota dos candidatos). */
function Nota({ nota }: { nota: number }) {
  const cor = nota >= 80 ? "bg-cerrado text-on-cerrado" : nota >= 50 ? "bg-ipe text-on-ipe" : "bg-surface-300 text-ink";
  return (
    <span className={`shrink-0 rounded-pill px-2 py-0.5 text-caption font-semibold tabular-nums ${cor}`}>{nota}%</span>
  );
}

/**
 * O mapa dos talentos: um círculo por bairro, do tamanho de quantas pessoas moram nele (o número dentro), e as suas
 * vagas no ar em verde. Ao lado (embaixo, no celular), os bairros com mais gente; tocar num bairro, no mapa ou na
 * lista, mostra quem mora lá (no "Para a sua vaga", com o quanto combina). Localização aproximada: o centro do bairro
 * que a pessoa escreveu no perfil, nunca a casa.
 */
export function MapaDosTalentos({
  dados,
  titulo = "Onde estão os talentos",
  descricao = "Cada círculo é um bairro, do tamanho de quantas pessoas moram nele. Toque num bairro para ver quem mora lá.",
}: {
  dados: Dados;
  titulo?: string;
  descricao?: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaML | null>(null);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [todosOsBairros, setTodosOsBairros] = useState(false);
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
            layout: { "circle-sort-key": ["+", ["get", "pessoas"], ["*", 1000, ["get", "escolhido"]]] },
            paint: {
              "circle-radius": ["+", 11, ["*", 4, ["sqrt", ["get", "pessoas"]]]],
              "circle-color": CORES_MAPA.terra,
              "circle-opacity": ["case", ["==", ["get", "escolhido"], 1], 1, 0.85],
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
              { padding: 40, maxZoom: 14, duration: 0 },
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

  /** Escolhe o bairro pela lista: o mapa vai até ele. */
  function escolher(b: BairroNoMapa) {
    setEscolhido(b.chave);
    mapa.current?.easeTo({ center: [b.lng, b.lat], zoom: Math.max(mapa.current.getZoom(), 13), duration: 500 });
  }

  const bairro = dados.bairros.find((b) => b.chave === escolhido) ?? null;
  const noMapa = dados.bairros.reduce((t, b) => t + b.pessoas, 0);
  const maior = dados.bairros[0]?.pessoas ?? 1;

  return (
    <section
      aria-labelledby="mapa-talentos-titulo"
      className="overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 px-4 pt-4 sm:px-5">
        <div className="min-w-0">
          <h2 id="mapa-talentos-titulo" className="text-h3">
            {titulo}
          </h2>
          <p className="mt-0.5 max-w-prose text-body-sm text-ink-muted">{descricao}</p>
        </div>
        <p className="text-body-sm text-ink-muted">
          <span className="font-display text-[20px] leading-6 font-bold text-ink tabular-nums">
            {formatarNumero(noMapa)}
          </span>{" "}
          no mapa
          {dados.semLugar > 0 && <span> · {formatarNumero(dados.semLugar)} sem bairro no perfil</span>}
        </p>
      </div>

      <div className="mt-3 grid border-t border-line lg:grid-cols-[minmax(0,1fr)_16.5rem]">
        <div className="relative h-72 bg-surface-300 sm:h-80 lg:h-[25rem]">
          {/* o MapLibre põe position: relative na caixa dele: ela fica dentro de uma caixa absoluta, com h-full */}
          <div className="absolute inset-0">
            <div
              ref={caixa}
              className="h-full w-full"
              role="region"
              aria-label="Mapa dos talentos por bairro. Os bairros também estão na lista ao lado do mapa."
            />
          </div>
          <p className="pointer-events-none absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-x-3 gap-y-1 rounded-sm bg-surface-100/90 px-2 py-1 text-[12px] text-ink">
            {/* as cores fixas do mapa (o mapa não muda no tema escuro) */}
            <span className="inline-flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: CORES_MAPA.terra }} />{" "}
              Pessoas no bairro (aproximado)
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
              O mapa não carregou agora. Os bairros estão na lista.
            </p>
          )}
        </div>

        <div className="flex min-h-0 flex-col border-t border-line lg:max-h-[25rem] lg:border-t-0 lg:border-l">
          {bairro ? (
            <div className="flex min-h-0 flex-col">
              <button
                type="button"
                onClick={() => setEscolhido(null)}
                className="inline-flex min-h-11 items-center gap-1 self-start px-3 text-label text-ink-muted hover:text-ink"
              >
                <ChevronLeft aria-hidden className="size-4" />
                Todos os bairros
              </button>
              <div className="px-4 pb-2">
                <p className="flex items-start gap-1.5 text-label">
                  <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-terra-text" />
                  <span>
                    {bairro.bairro}
                    <span className="font-normal text-ink-muted">, {bairro.cidade}</span>
                  </span>
                </p>
                <p className="text-body-sm text-ink-muted">
                  {bairro.pessoas} {bairro.pessoas === 1 ? "pessoa mora" : "pessoas moram"} aqui
                </p>
              </div>
              <ul className="min-h-0 overflow-y-auto border-t border-line">
                {bairro.talentos.map((t) => (
                  <li key={t.id} className="border-b border-line last:border-b-0">
                    <Link
                      href={`/talentos/${t.id}`}
                      className="flex min-h-12 items-center gap-2 px-4 py-2 hover:bg-surface-300"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-label">{t.nome}</span>
                        {t.titulo && <span className="block truncate text-body-sm text-ink-muted">{t.titulo}</span>}
                      </span>
                      {typeof t.nota === "number" && <Nota nota={t.nota} />}
                    </Link>
                  </li>
                ))}
              </ul>
              {bairro.pessoas > bairro.talentos.length && (
                <p className="border-t border-line px-4 py-2 text-body-sm text-ink-muted">
                  E mais {bairro.pessoas - bairro.talentos.length} neste bairro, na lista embaixo.
                </p>
              )}
            </div>
          ) : (
            <div className="flex min-h-0 flex-col">
              <p className="px-4 pt-3 pb-1 text-label">Onde tem mais gente</p>
              <ul className="min-h-0 overflow-y-auto pb-2">
                {dados.bairros.map((b, i) => (
                  <li key={b.chave} className={!todosOsBairros && i >= BAIRROS_NO_CELULAR ? "hidden lg:block" : ""}>
                    <button
                      type="button"
                      onClick={() => escolher(b)}
                      className="flex w-full flex-col gap-1 px-4 py-2 text-left hover:bg-surface-300"
                    >
                      <span className="flex w-full items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-body-sm">{b.bairro}</span>
                        <span className="shrink-0 text-label tabular-nums">{b.pessoas}</span>
                      </span>
                      <span aria-hidden className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-300">
                        <span
                          className="block h-full rounded-pill bg-terra"
                          style={{ width: `${Math.max(6, Math.round((b.pessoas / maior) * 100))}%` }}
                        />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {dados.bairros.length > BAIRROS_NO_CELULAR && !todosOsBairros && (
                <button
                  type="button"
                  onClick={() => setTodosOsBairros(true)}
                  className="mb-2 inline-flex min-h-10 items-center gap-1 self-start px-4 text-label text-ink-muted hover:text-ink lg:hidden"
                >
                  Ver mais {dados.bairros.length - BAIRROS_NO_CELULAR} bairros
                  <ChevronDown aria-hidden className="size-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
