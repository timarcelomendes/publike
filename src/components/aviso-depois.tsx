"use client";

import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AVISOS_DEPOIS, COOKIE_AVISO_DEPOIS, ehAvisoDepois } from "@/lib/aviso-depois";
import { Aviso } from "./ui/basicos";

/** O cookie do aviso, apagado na leitura (aparece uma vez só). */
function pegarAviso() {
  const par = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE_AVISO_DEPOIS}=`));
  if (!par) return null;
  document.cookie = `${COOKIE_AVISO_DEPOIS}=; path=/; max-age=0; samesite=lax`;
  const chave = decodeURIComponent(par.slice(COOKIE_AVISO_DEPOIS.length + 1));
  return ehAvisoDepois(chave) ? AVISOS_DEPOIS[chave] : null;
}

/**
 * Mostra o "salvo" de uma ação que levou a pessoa para outra página (lib/aviso-depois.ts). Some
 * sozinho em 6 segundos ou no X. Fica acima da barra de baixo do celular.
 */
export function AvisoDepois() {
  const caminho = usePathname();
  const [texto, setTexto] = useState<string | null>(null);

  // a cada página nova (o redirect da ação troca o endereço sem recarregar)
  useEffect(() => {
    const t = window.setTimeout(() => {
      const achado = pegarAviso();
      if (achado) setTexto(achado);
    }, 0);
    return () => window.clearTimeout(t);
  }, [caminho]);

  useEffect(() => {
    if (!texto) return;
    const t = window.setTimeout(() => setTexto(null), 6000);
    return () => window.clearTimeout(t);
  }, [texto]);

  if (!texto) return null;
  return (
    <div className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[46] rounded-md border border-line-strong shadow-raised md:inset-x-auto md:bottom-6 md:left-1/2 md:w-[24rem] md:-translate-x-1/2">
      <Aviso tipo="sucesso" titulo={texto} className="pr-12" />
      <button
        type="button"
        onClick={() => setTexto(null)}
        aria-label="Fechar o aviso"
        className="absolute top-1/2 right-1 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-pill text-ink-muted hover:text-ink"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
