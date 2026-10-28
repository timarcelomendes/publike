"use client";

import { useParams, usePathname } from "next/navigation";
import { useEffect } from "react";
import { chaveDaPagina, MAXIMO_SEGUNDOS, OCIOSO_MS, PAGINA_NAO_ENCONTRADA } from "@/lib/tempo-na-pagina";

// O tempo de cada página na tela, sem saber quem (src/lib/tempo-na-pagina.ts). Conta só com a página
// visível e alguém mexendo, e avisa ao trocar de página, ao esconder o site (outra aba, outro app, tela
// apagada) e ao fechar. Cada aviso leva os segundos que já tinham ido e os de agora: o banco soma a
// diferença, e a vez na página conta uma vez só. Não guarda nada no navegador.

/** O endereço da página "não encontrada" aberta agora (marcado pelo not-found). */
let naoEncontrada: string | null = null;

function avisar(pagina: string, de: number, ate: number) {
  const corpo = JSON.stringify({ pagina, de, ate });
  try {
    if (navigator.sendBeacon?.("/api/tempo", new Blob([corpo], { type: "application/json" }))) return;
  } catch {
    // segue para o fetch
  }
  void fetch("/api/tempo", {
    method: "POST",
    body: corpo,
    keepalive: true,
    headers: { "content-type": "application/json" },
  }).catch(() => {});
}

const MEXER = ["pointerdown", "pointermove", "keydown", "scroll", "wheel", "touchstart"] as const;
const OPCOES = { capture: true, passive: true } as const;

export function ContarTempo() {
  const caminho = usePathname();
  const params = useParams();
  const chave = chaveDaPagina(caminho, params);

  useEffect(() => {
    if (!chave) return;
    const endereco = window.location.pathname;
    let contado = 0; // os trechos já fechados, em ms
    let inicio: number | null = null; // o começo do trecho na tela
    let ultimoToque = performance.now();
    let avisado = 0; // os segundos já avisados
    const naTela = () => document.visibilityState === "visible";

    // o trecho termina agora ou 2 minutos depois do último toque, o que vier antes
    const fechar = (agora: number) => {
      if (inicio === null) return;
      const fim = Math.min(agora, ultimoToque + OCIOSO_MS);
      if (fim > inicio) contado += fim - inicio;
      inicio = null;
    };
    const abrir = (agora: number) => {
      if (inicio === null && naTela()) inicio = agora;
      ultimoToque = agora;
    };
    const enviar = () => {
      const segundos = Math.min(MAXIMO_SEGUNDOS, Math.floor(contado / 1000));
      if (segundos <= avisado) return;
      avisar(naoEncontrada === endereco ? PAGINA_NAO_ENCONTRADA : chave, avisado, segundos);
      avisado = segundos;
    };
    const mexeu = () => {
      const agora = performance.now();
      // parado mais de 2 minutos: aquele trecho já terminou, e um novo começa agora
      if (inicio !== null && agora > ultimoToque + OCIOSO_MS) fechar(agora);
      abrir(agora);
    };
    const mudouATela = () => {
      const agora = performance.now();
      if (naTela()) {
        abrir(agora);
      } else {
        fechar(agora);
        enviar();
      }
    };
    const saiu = () => {
      fechar(performance.now());
      enviar();
    };

    abrir(performance.now());
    for (const e of MEXER) window.addEventListener(e, mexeu, OPCOES);
    document.addEventListener("visibilitychange", mudouATela);
    window.addEventListener("pageshow", mudouATela);
    window.addEventListener("pagehide", saiu);
    return () => {
      for (const e of MEXER) window.removeEventListener(e, mexeu, OPCOES);
      document.removeEventListener("visibilitychange", mudouATela);
      window.removeEventListener("pageshow", mudouATela);
      window.removeEventListener("pagehide", saiu);
      // trocou de página no site
      saiu();
    };
  }, [chave, caminho]);

  return null;
}

/** No not-found: a página aberta agora conta como "não encontrada", qualquer que seja o endereço. */
export function MarcarNaoEncontrada() {
  useEffect(() => {
    naoEncontrada = window.location.pathname;
  }, []);
  return null;
}
