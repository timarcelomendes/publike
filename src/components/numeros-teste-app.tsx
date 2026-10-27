"use client";

import { useEffect, type ComponentProps } from "react";
import { ORIGENS_TESTE_APP, type EventoTesteApp, type OrigemTesteApp } from "@/lib/teste-app";

// Na página do teste do app: conta que abriu (uma vez por aba) e os toques nos passos, sem saber quem.

function origemDaVisita(): OrigemTesteApp {
  const de = new URLSearchParams(window.location.search).get("de");
  return (ORIGENS_TESTE_APP as readonly string[]).includes(de ?? "") ? (de as OrigemTesteApp) : "outro";
}

function contar(evento: EventoTesteApp) {
  const corpo = JSON.stringify({ evento, origem: origemDaVisita() });
  try {
    if (navigator.sendBeacon?.("/api/teste-app", new Blob([corpo], { type: "application/json" }))) return;
  } catch {
    // segue para o fetch
  }
  void fetch("/api/teste-app", {
    method: "POST",
    body: corpo,
    keepalive: true,
    headers: { "content-type": "application/json" },
  }).catch(() => {});
}

/** Conta a visita à página: uma vez por aba (recarregar não conta de novo). */
export function ContarVisitaTesteApp() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem("publike_teste_app_visto")) return;
      sessionStorage.setItem("publike_teste_app_visto", "1");
    } catch {
      // sem sessionStorage: conta do mesmo jeito
    }
    contar("abriu");
  }, []);
  return null;
}

/** Um link da página do teste que conta o toque antes de sair. */
export function LinkDoTesteApp({ evento, ...props }: ComponentProps<"a"> & { evento: EventoTesteApp }) {
  return <a {...props} onClick={() => contar(evento)} />;
}
