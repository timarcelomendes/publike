import { onCLS, onFCP, onINP, onLCP, onTTFB, type MetricWithAttribution } from "web-vitals/attribution";
import type { AvisoDeVelocidade, Medida, Metrica } from "./velocidade";

// A velocidade de verdade, no navegador (migração 20270709120000; src/lib/velocidade.ts): a biblioteca web-vitals mede
// o LCP, o INP, o CLS, o FCP e o TTFB desta página aberta e diz o culpado de cada um. Tudo vai num aviso só, quando a
// página some da tela (outra aba, outro app, fechar), por navigator.sendBeacon, que chega mesmo fechando. Este arquivo
// só baixa depois que a página termina de carregar (components/medir-velocidade.tsx): não pesa na conta que ele mede.

/** Só o caminho do script (sem o domínio e sem o ?): o nome do pedaço do site que demorou. */
function soOCaminho(url: string | undefined) {
  if (!url) return undefined;
  try {
    return new URL(url).pathname.slice(-80);
  } catch {
    return url.slice(-80);
  }
}

function medida(m: MetricWithAttribution): Medida {
  const base = { n: m.name as Metrica, v: Math.round(m.value * (m.name === "CLS" ? 10000 : 1)) / (m.name === "CLS" ? 10000 : 1), r: m.rating };
  switch (m.name) {
    case "LCP": {
      const a = m.attribution;
      return {
        ...base,
        a: a.target,
        x: {
          timeToFirstByte: a.timeToFirstByte,
          resourceLoadDelay: a.resourceLoadDelay,
          resourceLoadDuration: a.resourceLoadDuration,
          elementRenderDelay: a.elementRenderDelay,
        },
      };
    }
    case "INP": {
      const a = m.attribution;
      const x: Record<string, number | string> = {
        inputDelay: a.inputDelay,
        processingDuration: a.processingDuration,
        presentationDelay: a.presentationDelay,
        carga: a.loadState,
      };
      if (a.interactionType) x.tipo = a.interactionType;
      const script = a.longestScript;
      if (script) {
        x.script = [script.entry.invoker, soOCaminho(script.entry.sourceURL)].filter(Boolean).join(" · ").slice(0, 120);
        x.parte = script.subpart;
      }
      return { ...base, a: a.interactionTarget, x };
    }
    case "CLS": {
      const a = m.attribution;
      return {
        ...base,
        a: a.largestShiftTarget,
        x: { ...(a.largestShiftValue != null ? { maiorPulo: a.largestShiftValue } : {}), ...(a.loadState ? { carga: a.loadState } : {}) },
      };
    }
    case "FCP": {
      const a = m.attribution;
      return { ...base, x: { timeToFirstByte: a.timeToFirstByte, firstByteToFCP: a.firstByteToFCP, carga: a.loadState } };
    }
    default: {
      const a = m.attribution;
      return {
        ...base,
        x: {
          waitingDuration: a.waitingDuration,
          cacheDuration: a.cacheDuration,
          dnsDuration: a.dnsDuration,
          connectionDuration: a.connectionDuration,
          requestDuration: a.requestDuration,
        },
      };
    }
  }
}

let comecou = false;

/** O código ao acaso de uma página aberta (o banco aceita de 8 a 24 letras e números). */
const novoCodigo = () => Math.random().toString(36).slice(2, 14).padEnd(10, "0");

/** Começa a medir esta página aberta (uma vez por carregamento). */
export function medirVelocidade(pagina: string) {
  if (comecou) return;
  comecou = true;
  const medidas = new Map<Metrica, Medida>();
  // o código desta página aberta: o mesmo aviso pode ir de novo (o INP e o CLS crescem) e o banco troca o valor
  let visita = novoCodigo();
  let navegacao: string | null = null;
  let enviado = false;
  const guardar = (m: MetricWithAttribution) => {
    medidas.set(m.name as Metrica, medida(m));
    navegacao ??= m.navigationType;
    enviado = false;
  };
  onTTFB(guardar);
  onFCP(guardar);
  onLCP(guardar);
  onCLS(guardar);
  onINP(guardar);

  const enviar = () => {
    if (enviado || !medidas.size) return;
    enviado = true;
    const conexao = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType;
    const aviso: AvisoDeVelocidade = {
      i: visita,
      p: pagina,
      c: window.matchMedia("(max-width: 767px)").matches,
      k: conexao ?? null,
      t: navegacao,
      m: [...medidas.values()],
    };
    const corpo = JSON.stringify(aviso);
    try {
      if (navigator.sendBeacon?.("/api/velocidade", new Blob([corpo], { type: "application/json" }))) return;
    } catch {
      // segue para o fetch
    }
    void fetch("/api/velocidade", {
      method: "POST",
      body: corpo,
      keepalive: true,
      headers: { "content-type": "application/json" },
    }).catch(() => {});
  };
  // Depois dos da web-vitals (que fecham o LCP, o CLS e o INP quando a página some): os valores já são os finais.
  // Só o visibilitychange: os navegadores de hoje (o Safari desde o 14.1) o disparam também ao sair da página, e o
  // pagehide vem antes dele no Chrome, com o LCP e o CLS ainda abertos (eram dois avisos por página, 17/11/2026).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") enviar();
  });
  // voltou pelo botão Voltar, do cache do navegador: é outra página aberta (a web-vitals mede de novo, com
  // navigationType "back-forward-cache"), com outro código, para não trocar as medidas da primeira
  window.addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    medidas.clear();
    visita = novoCodigo();
    navegacao = "back-forward-cache";
    enviado = false;
  });
}
