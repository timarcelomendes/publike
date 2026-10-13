"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MapaML } from "maplibre-gl";
import { LocateFixed } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { buscarEnderecoDoPonto } from "@/lib/acoes/cep";
import { CENTRO_GOIANIA, REGIAO } from "@/lib/config";
import { distanciaKm } from "@/lib/descobrir";
import { chaveBairro } from "@/lib/regioes";
import { Botao } from "../ui/botao";
import { carregarMapLibre, circulo, CORES_MAPA, ESTILO_MAPA, recolherCreditos } from "./maplibre";

type Ponto = { lat: number; lng: number };

/** Cidade e bairro de um ponto, para preencher o formulário. */
export type LugarDoPonto = { cidade: string; bairro: string | null };

/**
 * Põe o bairro achado no campo "bairro" do formulário. Devolve se mudou
 * ("Setor Bueno" e "Bueno" contam como o mesmo bairro, como no banco).
 */
export function trocarBairro(campo: Element | RadioNodeList | null | undefined, bairro: string | null) {
  if (!bairro || !(campo instanceof HTMLInputElement)) return false;
  if (chaveBairro(campo.value) === chaveBairro(bairro)) return false;
  campo.value = bairro;
  return true;
}

/** O que está escrito no campo "bairro" do formulário onde fica o elemento. */
export function bairroEscrito(elemento: Element | null | undefined) {
  const campo = elemento?.closest("form")?.elements.namedItem("bairro");
  return campo instanceof HTMLInputElement ? campo.value : null;
}

// Um toque até esta distância de um endereço já achado (CEP, localização ou outro
// toque) é ajuste do pino: o bairro continua. O ponto salvo fica numa grade de ~500 m.
const AJUSTE_KM = 0.4;

function dentroDaRegiao(p: Ponto) {
  return p.lat >= REGIAO.latMin && p.lat <= REGIAO.latMax && p.lng >= REGIAO.lngMin && p.lng <= REGIAO.lngMax;
}

/**
 * Escolha do local do trabalho. A pessoa toca no mapa, usa a localização ou
 * busca pelo CEP (`irPara`). Com endereço público (`exato`), o pino marca a
 * porta; sem ele, guardamos só uma área de ~500 m.
 *
 * Com `preencher`, tocar no mapa longe do último endereço achado busca o
 * endereço do ponto e acerta a cidade e o bairro do formulário, para o bairro
 * do anúncio não ficar diferente do lugar marcado.
 */
export function SeletorLocal({
  inicial,
  erro,
  exato = false,
  irPara = null,
  aoUsarLocalizacao,
  preencher,
}: {
  inicial: Ponto | null;
  erro?: string;
  /** o ponto é o endereço exato (comércio, empresa ou agência com endereço) */
  exato?: boolean;
  /** leva o mapa (e o pino, a não ser com `marcar: false`) até este ponto; `vez` muda a cada busca */
  irPara?: (Ponto & { vez: number; zoom?: number; marcar?: boolean }) | null;
  /** depois de marcar o ponto pela localização do aparelho (para preencher o endereço) */
  aoUsarLocalizacao?: (p: Ponto) => void;
  /** cidade e bairro do ponto marcado, para o formulário; devolve se o bairro mudou */
  preencher?: (lugar: LugarDoPonto) => boolean;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaML | null>(null);
  const [ponto, setPonto] = useState<Ponto | null>(inicial);
  const [pronto, setPronto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [buscandoGps, setBuscandoGps] = useState(false);
  const [falhou, setFalhou] = useState(false);

  // bairro pelo ponto: o último ponto com endereço achado, a espera entre toques
  // seguidos e a vez (um toque novo descarta a resposta de um toque anterior)
  const ancora = useRef<Ponto | null>(null);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vez = useRef(0);
  const [avisoBairro, setAvisoBairro] = useState<{ texto: string; alerta: boolean } | null>(null);
  const [procurandoBairro, iniciarBairro] = useTransition();

  function cancelarBairro() {
    vez.current++;
    if (espera.current) clearTimeout(espera.current);
  }

  function bairroDoPonto(p: Ponto, agora = false) {
    if (!preencher) return;
    cancelarBairro();
    const a = ancora.current;
    if (!agora && a && distanciaKm(a.lat, a.lng, p.lat, p.lng) < AJUSTE_KM) return;
    const minha = vez.current;
    setAvisoBairro(null);
    espera.current = setTimeout(
      () =>
        iniciarBairro(async () => {
          const r = await buscarEnderecoDoPonto(p.lat, p.lng, bairroEscrito(caixa.current));
          if (minha !== vez.current) return;
          if (!r.ok) {
            setAvisoBairro({ texto: "Não achamos o bairro deste ponto. Confira o campo Bairro.", alerta: true });
            return;
          }
          ancora.current = p;
          // o bairro escrito fica perto do ponto: só acerta a cidade
          const mudou = preencher({ cidade: r.endereco.cidade, bairro: r.manterBairro ? null : r.endereco.bairro });
          setAvisoBairro(
            r.manterBairro
              ? null
              : !r.endereco.bairro
                ? { texto: "Não achamos o bairro deste ponto. Confira o campo Bairro.", alerta: true }
                : mudou
                  ? { texto: `Mudamos o bairro para “${r.endereco.bairro}”, pelo ponto no mapa. Confira.`, alerta: false }
                  : null,
          );
        }),
      agora ? 0 : 600,
    );
  }

  // o toque no mapa é registrado uma vez só; ele chama sempre a versão atual
  const aoTocar = useRef(bairroDoPonto);
  useEffect(() => {
    aoTocar.current = bairroDoPonto;
  });
  useEffect(() => () => cancelarBairro(), []);

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
        recolherCreditos(instancia);
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
          m.addSource("pino", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
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
          m.on("click", (e) => {
            const p = { lat: e.lngLat.lat, lng: e.lngLat.lng };
            if (!dentroDaRegiao(p)) {
              setAviso("Por enquanto o Publike funciona em Goiânia e região.");
              return;
            }
            setAviso(null);
            setPonto(p);
            aoTocar.current(p);
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
    const vazio = { type: "FeatureCollection" as const, features: [] };
    const area = m.getSource("escolha") as GeoJSONSource | undefined;
    const pino = m.getSource("pino") as GeoJSONSource | undefined;
    area?.setData(ponto && !exato ? circulo(ponto.lat, ponto.lng, 0.4) : vazio);
    pino?.setData(
      ponto && exato
        ? { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [ponto.lng, ponto.lat] } }
        : vazio,
    );
  }, [pronto, ponto, exato]);

  // busca pelo CEP: põe o pino lá e aproxima o mapa
  const [vezAtendida, setVezAtendida] = useState<number | null>(null);
  if (irPara && irPara.vez !== vezAtendida) {
    setVezAtendida(irPara.vez);
    if (irPara.marcar !== false) setPonto({ lat: irPara.lat, lng: irPara.lng });
    setAviso(null);
  }
  useEffect(() => {
    if (!irPara || !pronto) return;
    mapa.current?.flyTo({ center: [irPara.lng, irPara.lat], zoom: irPara.zoom ?? 16 });
  }, [irPara, pronto]);
  // o CEP já trouxe o bairro: ajustar o pino perto dele não troca o bairro
  useEffect(() => {
    if (!irPara || irPara.marcar === false) return;
    cancelarBairro();
    ancora.current = { lat: irPara.lat, lng: irPara.lng };
  }, [irPara]);

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
        mapa.current?.flyTo({ center: [p.lng, p.lat], zoom: exato ? 17 : 14 });
        if (aoUsarLocalizacao) {
          // quem chamou preenche o endereço inteiro pela localização
          cancelarBairro();
          ancora.current = p;
          aoUsarLocalizacao(p);
        } else {
          bairroDoPonto(p, true);
        }
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
          <div ref={caixa} className="h-full w-full" role="region" aria-label="Mapa para marcar o local do trabalho" />
        </div>
        {falhou && (
          <p className="absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-body-sm text-ink">
            O mapa não carregou agora. Use o botão “Usar minha localização” abaixo, ou recarregue a página.
          </p>
        )}
        {!ponto && !falhou && (
          <p className="pointer-events-none absolute inset-x-3 bottom-3 rounded-md bg-surface-200/95 px-3 py-2 text-center text-body-sm text-ink shadow-card">
            {exato ? "Toque no mapa na porta do trabalho" : "Toque no mapa perto de onde é o trabalho"}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Botao tamanho="sm" onClick={usarMinhaLocalizacao} disabled={buscandoGps}>
          <LocateFixed aria-hidden />
          {buscandoGps ? "Procurando…" : "Usar minha localização"}
        </Botao>
        <p className="text-body-sm text-ink-muted" aria-live="polite">
          {ponto
            ? exato
              ? "Local marcado. Toque no mapa para ajustar o pino."
              : "Região marcada. Mostramos só uma área de uns 500 m."
            : "Nenhum local marcado ainda."}
        </p>
      </div>
      {aviso && <p className="text-body-sm text-terra-text">{aviso}</p>}
      {preencher && (
        <p
          className={`text-body-sm ${avisoBairro?.alerta ? "text-terra-text" : "text-ink"}`}
          aria-live="polite"
          data-bairro-do-ponto
        >
          {procurandoBairro ? "Procurando o bairro deste ponto…" : avisoBairro?.texto}
        </p>
      )}
      <input type="hidden" name="lat" value={ponto ? ponto.lat.toFixed(5) : ""} />
      <input type="hidden" name="lng" value={ponto ? ponto.lng.toFixed(5) : ""} />
    </div>
  );
}
