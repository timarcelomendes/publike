"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";
import { Botao } from "../ui/botao";

/** Compartilhar o anúncio (no celular abre o menu do sistema, com WhatsApp). */
export function BotaoCompartilhar({ titulo, texto }: { titulo: string; texto: string }) {
  const [copiado, setCopiado] = useState(false);

  async function compartilhar() {
    const url = window.location.href.split("?")[0];
    if (navigator.share) {
      try {
        await navigator.share({ title: titulo, text: texto, url });
        return;
      } catch {
        // a pessoa fechou o menu: segue para copiar
      }
    }
    try {
      await navigator.clipboard.writeText(`${texto} ${url}`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${texto} ${url}`)}`, "_blank", "noopener");
    }
  }

  return (
    <Botao tamanho="sm" onClick={compartilhar}>
      {copiado ? <Check aria-hidden /> : <Share2 aria-hidden />}
      <span aria-live="polite">{copiado ? "Link copiado" : "Compartilhar"}</span>
    </Botao>
  );
}
