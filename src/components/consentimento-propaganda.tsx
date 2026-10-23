"use client";

import { useSyncExternalStore } from "react";
import { EVENTO_PROPAGANDA } from "@/lib/google-ads";
import { aceitouPropaganda, guardarPropaganda } from "./google-ads";

// Na página Cookies (/cookies): liga ou desliga os cookies de propaganda (o Google Ads) depois do aviso.

function assinar(avisar: () => void) {
  window.addEventListener(EVENTO_PROPAGANDA, avisar);
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(EVENTO_PROPAGANDA, avisar);
    window.removeEventListener("storage", avisar);
  };
}

export function ConsentimentoPropaganda() {
  const ligado = useSyncExternalStore(assinar, aceitouPropaganda, () => false);
  return (
    <label className="flex items-start gap-3 rounded-lg border border-line bg-surface-200 p-4 text-body-sm">
      <input
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]"
        checked={ligado}
        onChange={(e) => {
          guardarPropaganda(e.target.checked);
          // desligou: o código do Google já carregado só sai recarregando a página
          if (!e.target.checked) window.location.reload();
        }}
      />
      <span>
        <span className="block text-label">Permitir os cookies do Google Ads neste navegador</span>
        <span className="text-ink-muted">
          {ligado ? "Ligado. Desmarque para parar." : "Desligado. Nada vai para o Google."}
        </span>
      </span>
    </label>
  );
}
