"use client";

import { Check, Copy, MessageCircle } from "lucide-react";
import { useState } from "react";
import { Botao, classesBotao } from "../ui/botao";

/** Mandar o passo a passo para alguém: pelo WhatsApp ou copiando o link. */
export function CompartilharCaminho({ url, texto }: { url: string; texto: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {}
  }
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={`https://wa.me/?text=${encodeURIComponent(`${texto}\n${url}`)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={classesBotao("sucesso", "sm")}
      >
        <MessageCircle aria-hidden />
        Mandar pelo WhatsApp
      </a>
      <Botao tamanho="sm" variante="fantasma" onClick={copiar}>
        {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
        <span aria-live="polite">{copiado ? "Link copiado" : "Copiar o link"}</span>
      </Botao>
    </div>
  );
}
