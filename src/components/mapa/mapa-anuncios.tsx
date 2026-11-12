"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MapaML, Marker, Popup } from "maplibre-gl";
import { LocateFixed, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { formatarMinutos } from "@/lib/deslocamento";
import { hrefFiltros, raioDaBusca, type Filtros } from "@/lib/filtros";
import { AVISOS_GPS, pedirPosicao } from "../explorar/barra-busca";
import { TRACOS } from "../trajeto";
import {
  caixaDoRaio,
  carregarMapLibre,
  circulo,
  CORES_MAPA,
  ESTILO_MAPA,
  recolherCreditos,
  useMapaAVista,
} from "./maplibre";
import { CAIXA_DO_PUBLIKE } from "@/lib/pracas";

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
  /** com o tempo: os minutos até a vaga (o rótulo no meio da linha do caminho e o caminho no cartão do mapa) */
  minutos?: number | null;
  /** o caminho é a pé (até 1,5 km); senão, de ônibus */
  aPe?: boolean;
  autor: string;
  /** vaga, para quem tem currículo: o % de match */
  match?: number | null;
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
  onibus:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>',
  pe: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/></svg>',
  // o alfinete cheio, como o do lugar nos cartões
  alfinete:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="var(--pk-surface-200)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>',
};

const SEM_TRAJETO: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

// O cartão do anúncio fica acima da etiqueta (34 px de altura) ou logo abaixo da ponta dela
const ACIMA: [number, number] = [0, -34];
const ABAIXO: [number, number] = [0, 6];
const DESLOCAMENTO_DO_CARTAO = {
  top: ABAIXO,
  "top-left": ABAIXO,
  "top-right": ABAIXO,
  bottom: ACIMA,
  "bottom-left": ACIMA,
  "bottom-right": ACIMA,
  left: [46, -17] as [number, number],
  right: [-46, -17] as [number, number],
  center: [0, -17] as [number, number],
};
/** Meia largura do cartão do anúncio (px), para ver se ele cabe de lado. */
const MEIA_LARGURA_DO_CARTAO = 140;

/** A altura do cartão (px, com a ponta), medida escondida, com a mesma largura e o mesmo respiro do de verdade. */
function alturaDoCartao(m: MapaML, conteudo: HTMLElement) {
  const medida = document.createElement("div");
  medida.className = "maplibregl-popup-content";
  medida.style.cssText = "position:absolute;visibility:hidden;left:0;top:0;max-width:280px";
  medida.append(conteudo);
  m.getContainer().append(medida);
  const altura = medida.offsetHeight + 12;
  medida.remove();
  return altura;
}

/**
 * De que lado da vaga o cartão abre (o "anchor" do MapLibre: "top" é o cartão embaixo). Com o caminho, do lado
 * oposto ao da origem: em cima da vaga, ele cobriria a linha até ela. Sem caminho, ou sem espaço, o MapLibre
 * escolhe (em cima, se couber).
 */
function ladoDoCartao(m: MapaML, vaga: [number, number], origem: OrigemMapa, alturaCartao: number) {
  if (!origem) return undefined;
  const v = m.project(vaga);
  const o = m.project([origem.lng, origem.lat]);
  const { clientWidth: largura, clientHeight: altura } = m.getContainer();
  const vertical =
    o.y < v.y && v.y + ABAIXO[1] + alturaCartao < altura
      ? "top"
      : o.y >= v.y && v.y + ACIMA[1] - alturaCartao > 0
        ? "bottom"
        : null;
  if (!vertical) return undefined;
  const lado = v.x < MEIA_LARGURA_DO_CARTAO ? "-left" : v.x > largura - MEIA_LARGURA_DO_CARTAO ? "-right" : "";
  return `${vertical}${lado}` as "top" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

/**
 * Marcador de um anúncio: uma etiqueta com o ícone (vaga ou serviço) e o valor. Fica escura com o mouse em cima,
 * com o cartão aberto (aria-pressed) e com o mouse no cartão dele na lista ao lado (data-foco). `aoPassar`: o
 * mouse (ou o Tab) entrou ou saiu.
 */
function criarEtiqueta(p: Props, abrir: () => void, aoPassar: (dentro: boolean) => void) {
  const botao = document.createElement("button");
  botao.type = "button";
  botao.setAttribute("aria-label", `${p.titulo}, ${p.curto}, ${p.lugar}`);
  botao.className =
    "group/marcador relative flex flex-col items-center outline-none focus-visible:[&>span:first-child]:outline-2 focus-visible:[&>span:first-child]:outline-focus";
  const corpo = document.createElement("span");
  corpo.className =
    "flex max-w-40 items-center gap-1 rounded-pill border border-line-strong bg-surface-200 py-1 pr-2.5 pl-1.5 text-caption font-semibold whitespace-nowrap text-ink shadow-card transition-colors group-hover/marcador:border-ink group-hover/marcador:bg-ink group-hover/marcador:text-surface-100 group-aria-pressed/marcador:border-ink group-aria-pressed/marcador:bg-ink group-aria-pressed/marcador:text-surface-100 group-data-foco/marcador:border-ink group-data-foco/marcador:bg-ink group-data-foco/marcador:text-surface-100";
  const icone = document.createElement("span");
  icone.className =
    "flex size-5 shrink-0 items-center justify-center rounded-pill bg-surface-300 text-ink [&>svg]:size-3 group-hover/marcador:bg-surface-100/20 group-hover/marcador:text-surface-100 group-aria-pressed/marcador:bg-surface-100/20 group-aria-pressed/marcador:text-surface-100 group-data-foco/marcador:bg-surface-100/20 group-data-foco/marcador:text-surface-100";
  icone.innerHTML = p.tipo === "vaga" ? ICONE.vaga : ICONE.servico;
  const texto = document.createElement("span");
  texto.className = "truncate";
  texto.textContent = p.curto;
  corpo.append(icone, texto);
  // a pontinha da etiqueta, apontando para o lugar
  const ponta = document.createElement("span");
  ponta.className =
    "-mt-1 size-2.5 rotate-45 border-r border-b border-line-strong bg-surface-200 transition-colors group-hover/marcador:border-ink group-hover/marcador:bg-ink group-aria-pressed/marcador:border-ink group-aria-pressed/marcador:bg-ink group-data-foco/marcador:border-ink group-data-foco/marcador:bg-ink";
  botao.append(corpo, ponta);
  botao.addEventListener("click", (e) => {
    e.stopPropagation();
    abrir();
  });
  // só o mouse: no toque, o caminho aparece ao abrir o cartão
  botao.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && aoPassar(true));
  botao.addEventListener("pointerleave", (e) => e.pointerType === "mouse" && aoPassar(false));
  botao.addEventListener("focus", () => aoPassar(true));
  botao.addEventListener("blur", () => aoPassar(false));
  botao.style.zIndex = "2";
  return botao;
}

/**
 * O caminho até a vaga no cartão do mapa: o mesmo TrajetoAteAVaga dos cartões da lista (trajeto.tsx), feito à mão.
 * `frase`: o que o leitor de tela lê ("~25 min de ônibus da sua casa").
 */
function criarTrajeto(de: "casa" | "voce", minutos: number, aPe: boolean, frase: string) {
  const linha = document.createElement("p");
  linha.className = "flex min-w-0 items-center gap-1 text-body-sm text-ink-muted";
  const leitor = document.createElement("span");
  leitor.className = "sr-only";
  leitor.textContent = frase;
  const visivel = document.createElement("span");
  visivel.setAttribute("aria-hidden", "true");
  visivel.className = "flex min-w-0 items-center gap-1";
  const origem = document.createElement("span");
  origem.className = "inline-flex shrink-0 items-center gap-1";
  const icone = document.createElement("span");
  if (de === "casa") {
    icone.className =
      "flex size-4 items-center justify-center rounded-pill bg-ink text-surface-100 [&>svg]:size-2.5 [&>svg]:stroke-3";
    icone.innerHTML = ICONE.casa;
  } else {
    icone.className = "flex size-4 items-center justify-center rounded-pill bg-ink/15";
    icone.innerHTML = '<span class="size-2.5 rounded-pill border-2 border-surface-200 bg-ink"></span>';
  }
  origem.append(icone, document.createTextNode(de === "casa" ? "Sua casa" : "Você"));
  const tracos = () => {
    const t = document.createElement("span");
    // mais curtos que os da lista: o cartão do mapa é estreito
    t.className = `${TRACOS} w-3`;
    return t;
  };
  const tempo = document.createElement("span");
  tempo.className =
    "inline-flex shrink-0 items-center gap-1 rounded-pill bg-surface-300 py-px pr-2 pl-1.5 font-semibold whitespace-nowrap text-ink [&>svg]:size-3.5";
  tempo.innerHTML = aPe ? ICONE.pe : ICONE.onibus;
  tempo.append(document.createTextNode(formatarMinutos(minutos)));
  const fim = document.createElement("span");
  fim.className = "flex size-4 shrink-0 text-terra-text [&>svg]:size-4";
  fim.innerHTML = ICONE.alfinete;
  visivel.append(origem, tracos(), tempo, tracos(), fim);
  linha.append(leitor, visivel);
  return linha;
}

/** O tempo no meio da linha do caminho: o ônibus (ou o pé) e os minutos. */
function criarRotuloDoTrajeto() {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.className =
    "pointer-events-none flex items-center gap-1 rounded-pill border-2 border-surface-200 bg-ink py-0.5 pr-2 pl-1.5 text-caption font-semibold whitespace-nowrap text-surface-100 shadow-raised [&>svg]:size-3.5";
  el.style.zIndex = "3";
  return el;
}

function preencherRotulo(el: HTMLElement, minutos: number, aPe: boolean) {
  el.innerHTML = aPe ? ICONE.pe : ICONE.onibus;
  el.append(document.createTextNode(formatarMinutos(minutos)));
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

/**
 * O cartão que abre ao tocar num anúncio. `caminho`: com a casa ou a localização, a vaga mostra o caminho até lá
 * (de onde contam, os minutos e se é a pé).
 */
function conteudoDoCartao(
  p: Props,
  ir: (href: string) => void,
  caminho: { de: "casa" | "voce"; minutos: number; aPe: boolean } | null,
) {
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
  if (p.tempo && caminho) {
    caixa.append(criarTrajeto(caminho.de, caminho.minutos, caminho.aPe, p.tempo));
  } else if (p.tempo) {
    const tempo = document.createElement("p");
    tempo.className = "text-body-sm text-ink";
    tempo.textContent = p.tempo;
    caixa.append(tempo);
  }
  if (p.match != null) {
    const match = document.createElement("p");
    match.className = `text-body-sm ${p.match >= 80 ? "font-semibold text-cerrado-text" : "text-ink"}`;
    match.textContent = `${p.match}% de match com seu currículo`;
    caixa.append(match);
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

/**
 * Mapa da busca: etiquetas com o valor, grupos de anúncios próximos, o raio e a casa. Com a casa (CEP) ou a
 * localização, o caminho até a vaga: uma linha reta tracejada com o tempo no meio, para a vaga com o mouse em
 * cima (no mapa ou na lista ao lado, `foco`) ou com o cartão aberto. Sem nenhum dos dois, um botão pede a
 * localização para mostrar o tempo.
 */
export function MapaAnuncios({
  pontos,
  filtros,
  origem = null,
  foco = null,
  aoMudarArea,
}: {
  pontos: PontoMapa[];
  filtros: Filtros;
  origem?: OrigemMapa;
  /** o anúncio com o mouse em cima na lista ao lado: fica marcado e, com a origem, mostra o caminho */
  foco?: string | null;
  /** a parte do mapa na tela mudou: [oeste, sul, leste, norte] (a lista mostra só o que está nela) */
  aoMudarArea?: (limites: [number, number, number, number] | null) => void;
}) {
  const router = useRouter();
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaML | null>(null);
  const marcadores = useRef(new Map<string, Marker>());
  const naTela = useRef(new Map<string, Marker>());
  const atualizar = useRef<() => void>(() => {});
  const avisarArea = useRef(aoMudarArea);
  useEffect(() => {
    avisarArea.current = aoMudarArea;
  }, [aoMudarArea]);
  // o que o caminho até a vaga precisa saber, à mão para os eventos do mapa (que é criado uma vez só)
  const origemAgora = useRef<OrigemMapa>(null);
  const porId = useRef(new Map<string, PontoMapa>());
  const focoAgora = useRef<string | null>(null);
  const refazerTrajeto = useRef<() => void>(() => {});
  const [pronto, setPronto] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [movido, setMovido] = useState(false);
  // sem casa nem localização: o botão que pede a localização para mostrar o tempo até as vagas
  const [procurando, setProcurando] = useState(false);
  const [indo, irDaqui] = useTransition();
  const [avisoGps, setAvisoGps] = useState<string | null>(null);
  // o MapLibre só baixa com o mapa à vista: escondido (a coluna do mapa no celular), não pesa
  const aVista = useMapaAVista(caixa);

  // Cria o mapa uma vez (quando ele aparece)
  useEffect(() => {
    if (!aVista) return;
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
            [CAIXA_DO_PUBLIKE.lngMin - 0.5, CAIXA_DO_PUBLIKE.latMin - 0.5],
            [CAIXA_DO_PUBLIKE.lngMax + 0.5, CAIXA_DO_PUBLIKE.latMax + 0.5],
          ],
        });
        mapa.current = instancia;
        instancia.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");

        // o anúncio com o cartão aberto e o com o mouse em cima (o caminho mostra o de cima, senão o aberto)
        let selecionado: string | null = null;
        let sobre: string | null = null;
        let rotulo: Marker | null = null;
        let pontas: [[number, number], [number, number]] | null = null;

        const desmarcar = () => {
          marcadoAgora?.setAttribute("aria-pressed", "false");
          marcadoAgora = null;
          selecionado = null;
          refazerTrajeto.current();
        };

        // curta demais na tela, o tempo cobriria a casa e o anúncio: some (o tempo continua no cartão)
        const mostrarRotulo = () => {
          if (!rotulo || !pontas || !instancia) return;
          const [a, b] = [instancia.project(pontas[0]), instancia.project(pontas[1])];
          rotulo.getElement().style.visibility = Math.hypot(a.x - b.x, a.y - b.y) < 170 ? "hidden" : "";
        };

        // O caminho de quem procura até a vaga: uma linha reta tracejada, porque a conta do tempo é pela
        // distância em linha reta (não pelas ruas), com o tempo no meio. Uma de cada vez: a do anúncio com o
        // mouse em cima (no mapa ou na lista ao lado), senão a do cartão aberto.
        refazerTrajeto.current = () => {
          const m = instancia;
          const fonte = m?.getSource("trajeto") as GeoJSONSource | undefined;
          if (!m || !fonte) return;
          const id = sobre ?? focoAgora.current ?? selecionado;
          const alvo = id ? porId.current.get(id) : undefined;
          const o = origemAgora.current;
          if (!o || !alvo || alvo.minutos == null) {
            fonte.setData(SEM_TRAJETO);
            rotulo?.remove();
            pontas = null;
            return;
          }
          pontas = [
            [o.lng, o.lat],
            [alvo.lng, alvo.lat],
          ];
          fonte.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: pontas } });
          rotulo ??= new ml.Marker({ element: criarRotuloDoTrajeto(), anchor: "center" });
          preencherRotulo(rotulo.getElement(), alvo.minutos, Boolean(alvo.aPe));
          rotulo.setLngLat([(o.lng + alvo.lng) / 2, (o.lat + alvo.lat) / 2]).addTo(m);
          mostrarRotulo();
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
                const el = criarEtiqueta(
                  p,
                  () => {
                    // o cartão de antes sai primeiro: ao fechar, ele desmarca o anúncio dele (depois, desmarcaria
                    // este)
                    cartao?.remove();
                    desmarcar();
                    marcadoAgora = el;
                    el.setAttribute("aria-pressed", "true");
                    selecionado = p.id;
                    const ponto = porId.current.get(p.id);
                    const de = origemAgora.current?.tipo;
                    const caminho =
                      de && ponto?.minutos != null ? { de, minutos: ponto.minutos, aPe: Boolean(ponto.aPe) } : null;
                    const conteudo = conteudoDoCartao(p, (href) => router.push(href), caminho);
                    cartao = new ml.Popup({
                      anchor: caminho
                        ? ladoDoCartao(m, coords, origemAgora.current, alturaDoCartao(m, conteudo))
                        : undefined,
                      offset: DESLOCAMENTO_DO_CARTAO,
                      maxWidth: "280px",
                      focusAfterOpen: false,
                    })
                      .setLngLat(coords)
                      .setDOMContent(conteudo)
                      .addTo(m);
                    cartao.on("close", desmarcar);
                    refazerTrajeto.current();
                  },
                  (dentro) => {
                    sobre = dentro ? p.id : sobre === p.id ? null : sobre;
                    refazerTrajeto.current();
                  },
                );
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

          // o caminho até a vaga (refazerTrajeto): o contorno claro destaca a linha das ruas e das quadras
          m.addSource("trajeto", { type: "geojson", data: SEM_TRAJETO });
          m.addLayer({
            id: "trajeto-contorno",
            type: "line",
            source: "trajeto",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": CORES_MAPA.branco, "line-width": 7, "line-opacity": 0.9 },
          });
          m.addLayer({
            id: "trajeto-linha",
            type: "line",
            source: "trajeto",
            layout: { "line-join": "round" },
            paint: { "line-color": CORES_MAPA.ink, "line-width": 3, "line-dasharray": [2, 1.5] },
          });
          m.on("zoom", mostrarRotulo);
          // mexendo no mapa, a etiqueta pode sair de baixo do mouse sem avisar: o caminho volta para o cartão aberto
          m.on("movestart", () => {
            if (!sobre) return;
            sobre = null;
            refazerTrajeto.current();
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
          // a lista acompanha a parte do mapa na tela: quando a pessoa mexe no mapa (ou a busca o move).
          // Se só o tamanho do mapa mudou, a lista fica como está: em Blocos + mapa, o mapa tem a altura
          // dos cartões, e a página 2 (mais curta) encolhia o mapa, a área mudava, a lista voltava para a
          // página 1, crescia, o mapa crescia de novo... e a tela ficava piscando entre as duas páginas.
          let ultimaCamera = "";
          const area = () => {
            const c = m.getCenter();
            const camera = `${c.lng.toFixed(6)},${c.lat.toFixed(6)},${m.getZoom().toFixed(3)}`;
            if (camera === ultimaCamera) return;
            ultimaCamera = camera;
            const b = m.getBounds();
            avisarArea.current?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
          };
          m.on("moveend", area);
          area();
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
      avisarArea.current?.(null);
      // o cartão aberto fecha junto com o mapa e chamaria o caminho de um mapa que já saiu
      refazerTrajeto.current = () => {};
      for (const marcador of todos.values()) marcador.remove();
      todos.clear();
      visiveis.clear();
      instancia?.remove();
      mapa.current = null;
    };
    // O mapa é criado uma vez; mudanças de filtro são tratadas abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aVista]);

  // Atualiza os anúncios quando a busca muda (as etiquetas são refeitas)
  useEffect(() => {
    const m = mapa.current;
    if (!pronto || !m) return;
    for (const marcador of marcadores.current.values()) marcador.remove();
    marcadores.current.clear();
    naTela.current.clear();
    (m.getSource("anuncios") as GeoJSONSource | undefined)?.setData(paraGeoJSON(pontos));
  }, [pronto, pontos]);

  // O caminho acompanha a origem e os anúncios da busca (sem a vaga, ou sem a origem, ele some)
  useEffect(() => {
    origemAgora.current = origem;
    porId.current = new Map(pontos.map((p) => [p.id, p]));
    refazerTrajeto.current();
  }, [pronto, origem, pontos]);

  // O cartão com o mouse em cima, na lista ao lado: o anúncio fica marcado no mapa (e o caminho até ele aparece)
  useEffect(() => {
    focoAgora.current = foco;
    refazerTrajeto.current();
    const el = pronto && foco ? marcadores.current.get(foco)?.getElement() : undefined;
    if (!el) return;
    el.setAttribute("data-foco", "");
    el.style.zIndex = "3";
    return () => {
      el.removeAttribute("data-foco");
      el.style.zIndex = "2";
    };
  }, [pronto, foco]);

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

  // como o "Perto de mim": a busca passa a contar de onde a pessoa está, e o tempo e o caminho aparecem
  function verTempoDaqui() {
    setAvisoGps(null);
    setProcurando(true);
    pedirPosicao(
      ({ lat, lng }) => {
        setProcurando(false);
        irDaqui(() => router.push(hrefFiltros(filtros, { lat, lng, origem: "gps", ordem: "perto" }), { scroll: false }));
      },
      (motivo) => {
        setProcurando(false);
        setAvisoGps(AVISOS_GPS[motivo]);
      },
    );
  }
  const pedeOrigem = !origem && !falhou && !movido && pontos.some((p) => p.tipo === "vaga");

  return (
    <div className="group/mapa relative h-full min-h-[320px] overflow-hidden rounded-lg border border-line bg-surface-300">
      {/* O MapLibre põe position: relative no próprio container (e o CSS dele vence o do Tailwind):
          por isso o container fica dentro de uma caixa absoluta e só ocupa 100% dela. */}
      <div className="absolute inset-0">
        <div ref={caixa} className="h-full w-full" aria-label="Mapa dos anúncios" role="region" />
      </div>
      {pedeOrigem && (
        // no canto de cima (o "Buscar nesta área", no meio, aparece quando a pessoa mexe no mapa: aí este some)
        <div className="absolute top-3 left-3 z-10 flex max-w-[calc(100%-4.5rem)] flex-col items-start gap-2">
          <button
            type="button"
            onClick={verTempoDaqui}
            disabled={procurando || indo}
            className="inline-flex min-h-10 items-center gap-2 rounded-pill border border-line-strong bg-surface-200 px-3.5 text-label text-ink shadow-raised hover:bg-surface-300 disabled:cursor-wait"
          >
            <LocateFixed aria-hidden className={`size-4 shrink-0 ${procurando || indo ? "animate-pulse" : ""}`} />
            {procurando || indo ? "Procurando você…" : "Ver o tempo de ônibus daqui"}
          </button>
          {avisoGps && (
            <p role="status" className="rounded-md bg-surface-200 px-3 py-2 text-body-sm text-terra-text shadow-card">
              {avisoGps}
            </p>
          )}
        </div>
      )}
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
          Não foi possível carregar o mapa agora. A lista continua funcionando: escolha Blocos.
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
