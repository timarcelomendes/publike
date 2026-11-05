"use client";

import { useEffect } from "react";

// Quando a empresa toca no WhatsApp, no telefone ou no e-mail de um candidato, ou a pessoa no de quem publicou (os
// links marcados com data-contato="<anúncio>:<quem curtiu>" e data-canal), o site avisa o servidor
// (/api/contato-candidato), para Admin › Retorno e Curtidas saberem que houve contato fora do Publike. O banco vê de
// que lado é. Um ouvinte só, no painel, para todos esses botões.

export function ContarContato() {
  useEffect(() => {
    function aoClicar(e: MouseEvent) {
      const alvo = (e.target as Element | null)?.closest?.("a[data-contato]");
      if (!alvo) return;
      const [anuncio, perfil] = (alvo.getAttribute("data-contato") ?? "").split(":");
      const canal = alvo.getAttribute("data-canal") ?? "whatsapp";
      if (!anuncio || !perfil) return;
      const corpo = new Blob([JSON.stringify({ anuncio, perfil, canal })], { type: "application/json" });
      try {
        if (!navigator.sendBeacon?.("/api/contato-candidato", corpo)) throw new Error("sem beacon");
      } catch {
        fetch("/api/contato-candidato", { method: "POST", body: corpo, keepalive: true }).catch(() => {});
      }
    }
    document.addEventListener("click", aoClicar, true);
    return () => document.removeEventListener("click", aoClicar, true);
  }, []);
  return null;
}
