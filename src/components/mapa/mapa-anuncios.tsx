"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MapaML, Marker, Popup } from "maplibre-gl";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { REGIAO } from "@/lib/config";
import { hrefFiltros, raioDaBusca, type Filtros } from "@/lib/filtros";
import { caixaDoRaio, carregarMapLibre, circulo, CORES_MAPA, ESTILO_MAPA, recolherCreditos } from "./maplibre";

export type PontoMapa = {
  id: string;
  lat: number;
  lng: number;
  titulo: string;
  tipo: string;
  lugar: string;
  valor: string;
  /** o valor curto do marcador: "R$ 1.750/mês", "A combinar" */
  curto: string;
  /** "CLT", "Diária", "Serviço" */
  modalidade: string;
  /** "1,2 km" (null sem distância) */
  distancia: string | null;
  /** "~25 min de ônibus da sua casa" (só com CEP de casa ou GPS) */
  tempo: string | null;
  autor: string;
};

/** De onde a busca mede: a casa (CEP), o GPS ou nenhum marcador. */
/** De onde contam as distâncias: a casa (CEP) ou onde a pessoa está agora (localização do navegador). */
export type OrigemMapa = { lat: number; lng: number; rotulo: string; tipo: "casa" | "voce" } | null;

type Props = Omit<PontoMapa, "lat" | "lng">;

function paraGeoJSON(pontos: PontoMapa[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: pontos.map(({ lat, lng, ...p }) => ({
      type: "Feature",
      properties: p,
      geometry: { type: "Point", coordinates: [lng, lat] },
    })),
  };
}

// Ícones (Lucide) em texto, para os marcadores feitos à mão
const ICONE = {
  vaga: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/></svg>',
  servico:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  casa: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
};

/** Marcador de um anúncio: uma etiqueta com o ícone (vaga ou serviço) e o valor. */
function criarEtiqueta(p: Props, abrir: () => void) {
  const botao = document.createElement("button");
  botao.type = "button";
  botao.setAttribute("aria-label", `${p.titulo}, ${p.curto}, ${p.lugar}`);
  botao.className =
    "group/marcador relative flex flex-col items-center outline-none focus-visible:[&>span:first-child]:outline-2 focus-visible:[&>span:first-child]:outline-focus";
  const corpo = document.createElement("span");
  corpo.className =
    "flex max-w-40 items-center gap-1 rounded-pill border border-line-strong bg-surface-200 py-1 pr-2.5 pl-1.5 text-caption font-semibold whitespace-nowrap text-ink shadow-card transition-colors group-hover/marcador:border-ink group-hover/marcador:bg-ink group-hover/marcador:text-surface-100 group-aria-pressed/marcador:border-ink group-aria-pressed/marcador:bg-ink group-aria-pressed/marcador:text-surface-100";
  const icone = document.createElement("span");
  icone.className =
    "flex size-5 shrink-0 items-center justify-center rounded-pill bg-surface-300 text-ink [&>svg]:size-3 group-hover/marcador:bg-surface-100/20 group-hover/marcador:text-surface-100 group-aria-pressed/marcador:bg-surface-100/20 group-aria-pressed/marcador:text-surface-100";
  icone.innerHTML = p.tipo === "vaga" ? ICONE.vaga : ICONE.servico;
  const texto = document.createElement("span");
  texto.className = "truncate";
  texto.textContent = p.curto;
  corpo.append(icone, texto);
  // a pontinha da etiqueta, apontando para o lugar
  const ponta = document.createElement("span");
  ponta.className =
    "-mt-1 size-2.5 rotate-45 border-r border-b border-line-strong bg-surface-200 transition-colors group-hover/marcador:border-ink group-hover/marcador:bg-ink group-aria-pressed/marcador:border-ink group-aria-pressed/marcador:bg-ink";
  botao.append(corpo, ponta);
  botao.addEventListener("click", (e) => {
    e.stopPropagation();
    abrir();
  });
  botao.style.zIndex = "2";
  return botao;
}

/** Marcador de um grupo de anúncios próximos: um círculo com a quantidade. */
function criarGrupo(quantos: number, abrir: () => void) {
  const botao = document.createElement("button");
  botao.type = "button";
  botao.setAttribute("aria-label", `${quantos} anúncios aqui. Aproximar`);
  const tamanho = quantos >= 30 ? "size-12" : quantos >= 10 ? "size-10" : "size-9";
  // o MapLibre posiciona o marcador com transform: o efeito de aumentar fica num filho
  // (um scale no próprio marcador o tiraria de baixo do cursor)
  botao.className = "group/grupo rounded-pill outline-none focus-visible:outline-2 focus-visible:outline-focus";
  const circulo = document.createElement("span");
  circulo.className = `flex ${tamanho} items-center justify-center rounded-pill border-[3px] border-surface-200 bg-ink text-label text-surface-100 shadow-raised transition-transform group-hover/grupo:scale-110`;
  circulo.textContent = String(quantos);
  botao.append(circulo);
  botao.addEventListener("click", (e) => {
    e.stopPropagation();
    abrir();
  });
  botao.style.zIndex = "2";
  return botao;
}

/** Marcador de onde a busca mede (casa ou GPS): só o ícone, para não cobrir os anúncios. */
function criarOrigem(origem: NonNullable<OrigemMapa>) {
  const el = document.createElement("div");
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", origem.rotulo);
  el.style.zIndex = "1"; // fica embaixo das etiquetas
  if (origem.tipo === "voce") {
    // o ponto, com uma onda em volta (parada para quem pede menos movimento); fica embaixo dos anúncios
    el.className = "pointer-events-none relative flex size-3.5 items-center justify-center";
    el.innerHTML =
      '<span class="absolute inset-[-7px] rounded-pill bg-ink/25 animate-ping motion-reduce:animate-none"></span>' +
      '<span class="relative size-3.5 rounded-pill border-2 border-surface-200 bg-ink shadow-raised"></span>';
    return el;
  }
  el.className =
    "pointer-events-none flex size-8 items-center justify-center rounded-pill border-[3px] border-surface-200 bg-ink text-surface-100 shadow-raised [&>svg]:size-4";
  el.innerHTML = ICONE.casa;
  return el;
}

/** A etiqueta "Você", acima do ponto e por cima de tudo: aparece mesmo quando há anúncios no mesmo lugar. */
function criarEtiquetaVoce() {
  const el = document.createElement("div");
  el.className = "pointer-events-none flex flex-col items-center";
  el.style.zIndex = "3";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML =
    '<span class="rounded-pill bg-ink px-2 py-0.5 text-caption font-semibold text-surface-100 shadow-raised">Você</span>' +
    '<span class="-mt-px size-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-ink"></span>';
  return el;
}

/** O cartão que abre ao tocar num anúncio. */
function conteudoDoCartao(p: Props, ir: (href: string) => void) {
  const caixa = document.createElement("div");
  caixa.className = "flex w-60 flex-col gap-1 pr-4";
  const topo = document.createElement("p");
  topo.className = "flex items-center gap-1.5 text-caption text-ink-muted uppercase";
  const marca = document.createElement("span");
  marca.className = "flex size-4 items-center justify-center text-ink [&>svg]:size-3.5";
  marca.innerHTML = p.tipo === "vaga" ? ICONE.vaga : ICONE.servico;
  topo.append(marca, document.createTextNode(p.modalidade));
  const titulo = document.createElement("a");
  titulo.href = `/anuncio/${p.id}`;
  titulo.className = "font-display text-label leading-snug text-ink hover:underline";
  titulo.textContent = p.titulo;
  const autor = document.createElement("p");
  autor.className = "truncate text-body-sm text-ink-muted";
  autor.textContent = p.autor;
  const lugar = document.createElement("p");
  lugar.className = "text-body-sm text-ink-muted";
  lugar.textContent = p.distancia ? `${p.lugar} · ${p.distancia}` : p.lugar;
  caixa.append(topo, titulo, autor, lugar);
  if (p.tempo) {
    const tempo = document.createElement("p");
    tempo.className = "text-body-sm text-ink";
    tempo.textContent = p.tempo;
    caixa.append(tempo);
  }
  const valor = document.createElement("p");
  valor.className = "mt-1 text-label text-ink";
  valor.textContent = p.valor;
  const ver = document.createElement("a");
  ver.href = `/anuncio/${p.id}`;
  ver.className = "mt-1 text-label text-terra-text underline-offset-2 hover:underline";
  ver.textContent = p.tipo === "vaga" ? "Ver a vaga →" : "Ver o serviço →";
  caixa.append(valor, ver);
  for (const link of [titulo, ver]) {
    link.addEventListener("click", (ev) => {
      ev.preventDefault();
      ir(link.getAttribute("href")!);
    });
  }
  return caixa;
}

/** Mapa da busca: etiquetas com o valor, grupos de anúncios próximos, o raio e a casa. */
export function MapaAnuncios({
  pontos,
  filtros,
  origem = null,
}: {
  pontos: PontoMapa[];
  filtros: Filtros;
  origem?: OrigemMapa;
}) {
  const router = useRouter();
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaML | null>(null);
  const marcadores = useRef(new Map<string, Marker>());
  const naTela = useRef(new Map<string, Marker>());
  const atualizar = useRef<() => void>(() => {});
  const [pronto, setPronto] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [movido, setMovido] = useState(false);

  // Cria o mapa uma vez
  useEffect(() => {
    let cancelado = false;
    let instancia: MapaML | null = null;
    let cartao: Popup | null = null;
    let marcadoAgora: HTMLElement | null = null;
    const todos = marcadores.current;
    const visiveis = naTela.current;

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

        const desmarcar = () => {
          marcadoAgora?.setAttribute("aria-pressed", "false");
          marcadoAgora = null;
        };

        // Etiquetas em HTML para o que está na tela (os grupos vêm do próprio mapa)
        atualizar.current = () => {
          const m = instancia;
          if (!m || !m.getSource("anuncios") || !m.isSourceLoaded("anuncios")) return;
          const agora = new Map<string, Marker>();
          for (const f of m.querySourceFeatures("anuncios")) {
            if (f.geometry.type !== "Point") continue;
            const coords = f.geometry.coordinates as [number, number];
            const props = f.properties as Record<string, unknown>;
            const grupo = Boolean(props.cluster);
            const chave = grupo ? `grupo-${props.cluster_id}` : String(props.id);
            if (agora.has(chave)) continue;
            let marcador = todos.get(chave);
            if (!marcador) {
              if (grupo) {
                const el = criarGrupo(Number(props.point_count), async () => {
                  const fonte = m.getSource("anuncios") as GeoJSONSource;
                  const zoom = await fonte
                    .getClusterExpansionZoom(Number(props.cluster_id))
                    .catch(() => m.getZoom() + 2);
                  m.easeTo({ center: coords, zoom: zoom + 0.2 });
                });
                marcador = new ml.Marker({
                  element: el,
                  anchor: "center",
                }).setLngLat(coords);
              } else {
                const p = props as unknown as Props;
                const el = criarEtiqueta(p, () => {
                  desmarcar();
                  marcadoAgora = el;
                  el.setAttribute("aria-pressed", "true");
                  cartao?.remove();
                  cartao = new ml.Popup({
                    offset: [0, -34],
                    maxWidth: "280px",
                    focusAfterOpen: false,
                  })
                    .setLngLat(coords)
                    .setDOMContent(conteudoDoCartao(p, (href) => router.push(href)))
                    .addTo(m);
                  cartao.on("close", desmarcar);
                });
                marcador = new ml.Marker({
                  element: el,
                  anchor: "bottom",
                }).setLngLat(coords);
              }
              todos.set(chave, marcador);
            }
            agora.set(chave, marcador);
            if (!visiveis.has(chave)) marcador.addTo(m);
          }
          for (const [chave, marcador] of visiveis) if (!agora.has(chave)) marcador.remove();
          visiveis.clear();
          for (const [chave, marcador] of agora) visiveis.set(chave, marcador);
        };

        recolherCreditos(instancia);
        instancia.on("load", () => {
          const m = instancia!;
          m.addSource("raio", {
            type: "geojson",
            data: circulo(filtros.lat, filtros.lng, raioDaBusca(filtros)),
          });
          m.addLayer({
            id: "raio-fundo",
            type: "fill",
            source: "raio",
            paint: { "fill-color": CORES_MAPA.ink, "fill-opacity": 0.03 },
          });
          m.addLayer({
            id: "raio-borda",
            type: "line",
            source: "raio",
            paint: {
              "line-color": CORES_MAPA.ink,
              "line-width": 1.5,
              "line-opacity": 0.35,
              "line-dasharray": [2, 2],
            },
          });

          m.addSource("anuncios", {
            type: "geojson",
            data: paraGeoJSON([]),
            cluster: true,
            clusterRadius: 56,
            clusterMaxZoom: 15,
          });
          // camada invisível: só para o mapa calcular os grupos e as etiquetas da tela
          m.addLayer({
            id: "anuncios-base",
            type: "circle",
            source: "anuncios",
            paint: {
              "circle-radius": 1,
              "circle-opacity": 0,
              "circle-stroke-opacity": 0,
            },
          });

          // Refaz as etiquetas quando o mapa para de mexer ou os dados chegam (não a cada quadro:
          // no meio de um toque a etiqueta sumiria e o clique cairia no mapa)
          m.on("moveend", () => atualizar.current());
          m.on("sourcedata", (e) => {
            if (e.sourceId === "anuncios" && e.isSourceLoaded) atualizar.current();
          });
          m.on("click", () => {
            cartao?.remove();
            desmarcar();
          });
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
      for (const marcador of todos.values()) marcador.remove();
      todos.clear();
      visiveis.clear();
      instancia?.remove();
      mapa.current = null;
    };
    // O mapa é criado uma vez; mudanças de filtro são tratadas abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Atualiza os anúncios quando a busca muda (as etiquetas são refeitas)
  useEffect(() => {
    const m = mapa.current;
    if (!pronto || !m) return;
    for (const marcador of marcadores.current.values()) marcador.remove();
    marcadores.current.clear();
    naTela.current.clear();
    (m.getSource("anuncios") as GeoJSONSource | undefined)?.setData(paraGeoJSON(pontos));
  }, [pronto, pontos]);

  // A casa (ou o GPS) no mapa
  useEffect(() => {
    const m = mapa.current;
    if (!pronto || !m || !origem) return;
    let marcadores: Marker[] = [];
    let cancelado = false;
    carregarMapLibre().then((ml) => {
      if (cancelado) return;
      marcadores = [
        new ml.Marker({ element: criarOrigem(origem), anchor: "center" }).setLngLat([origem.lng, origem.lat]).addTo(m),
      ];
      if (origem.tipo === "voce") {
        marcadores.push(
          new ml.Marker({ element: criarEtiquetaVoce(), anchor: "bottom", offset: [0, -9] })
            .setLngLat([origem.lng, origem.lat])
            .addTo(m),
        );
      }
    });
    return () => {
      cancelado = true;
      for (const x of marcadores) x.remove();
    };
  }, [pronto, origem]);

  // Reenquadra quando o centro ou o raio (ou o tempo de ônibus) mudam
  const raioKm = raioDaBusca(filtros);
  useEffect(() => {
    const m = mapa.current;
    if (!pronto || !m) return;
    (m.getSource("raio") as GeoJSONSource | undefined)?.setData(circulo(filtros.lat, filtros.lng, raioKm));
    m.fitBounds(caixaDoRaio(filtros.lat, filtros.lng, raioKm), {
      padding: 24,
      duration: 600,
    });
    setMovido(false);
  }, [pronto, filtros.lat, filtros.lng, raioKm]);

  function buscarAqui() {
    const m = mapa.current;
    if (!m) return;
    const c = m.getCenter();
    setMovido(false);
    router.push(
      hrefFiltros(filtros, {
        lat: Math.round(c.lat * 10000) / 10000,
        lng: Math.round(c.lng * 10000) / 10000,
        origem: "mapa",
      }),
      { scroll: false },
    );
  }

  return (
    <div className="group/mapa relative h-full min-h-[320px] overflow-hidden rounded-lg border border-line bg-surface-300">
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
          Não foi possível carregar o mapa agora. A lista continua funcionando: escolha Lista, Grade ou Blocos.
        </p>
      )}
      {/* A legenda some enquanto os créditos do mapa estão abertos (botão "i"), para não cobrir o texto. */}
      <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex items-center gap-3 rounded-pill bg-surface-200/95 px-3 py-1.5 text-caption text-ink shadow-card transition-opacity group-has-[.maplibregl-compact-show]/mapa:opacity-0">
        <span className="flex items-center gap-1.5">
          <span
            className="flex size-4 items-center justify-center rounded-pill bg-surface-300 text-ink [&>svg]:size-2.5"
            dangerouslySetInnerHTML={{ __html: ICONE.vaga }}
          />
          Vagas
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="flex size-4 items-center justify-center rounded-pill bg-surface-300 text-ink [&>svg]:size-2.5"
            dangerouslySetInnerHTML={{ __html: ICONE.servico }}
          />
          Serviços
        </span>
        {origem && (
          <span className="flex items-center gap-1.5">
            {origem.tipo === "voce" ? (
              <span className="flex size-4 items-center justify-center rounded-pill bg-ink/20">
                <span className="size-2.5 rounded-pill border-2 border-surface-200 bg-ink" />
              </span>
            ) : (
              <span
                className="flex size-4 items-center justify-center rounded-pill bg-ink text-surface-100 [&>svg]:size-2.5"
                dangerouslySetInnerHTML={{ __html: ICONE.casa }}
              />
            )}
            {origem.rotulo}
          </span>
        )}
      </div>
    </div>
  );
}
