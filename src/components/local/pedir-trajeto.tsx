"use client";

import { LocateFixed } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AVISOS_GPS, pedirPosicao } from "../explorar/barra-busca";

/**
 * No lugar do caminho até a vaga, quando a lista não sabe de onde contar (26/11/2026, Marcelo: "para ver distância e
 * tempo exige localização mas não informa isso ao usuário"): o convite para ver a distância e o tempo de ônibus. O
 * toque pede a localização ao navegador e a lista volta contando de onde a pessoa está (como o "Onde estou agora").
 */
export function PedirTrajeto({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<"parado" | "procurando" | string>("parado");

  function pedir() {
    setEstado("procurando");
    pedirPosicao(
      ({ lat, lng }) => {
        const url = new URL(window.location.href);
        url.searchParams.set("lat", String(lat));
        url.searchParams.set("lng", String(lng));
        url.searchParams.set("origem", "gps");
        router.push(`${url.pathname}?${url.searchParams.toString()}`, { scroll: false });
      },
      (motivo) => setEstado(AVISOS_GPS[motivo]),
    );
  }

  const erro = estado !== "parado" && estado !== "procurando" ? estado : null;
  return (
    <span className={`flex min-w-0 flex-col gap-0.5 ${className}`}>
      <button
        type="button"
        onClick={pedir}
        disabled={estado === "procurando"}
        className="relative z-10 inline-flex min-h-8 items-center gap-1.5 self-start text-left text-body-sm text-ink-muted underline decoration-dotted underline-offset-2 hover:text-ink disabled:opacity-60"
      >
        <LocateFixed aria-hidden className="size-4 shrink-0 text-cerrado-text" />
        {estado === "procurando" ? "Procurando você…" : "Ver a distância e o tempo de ônibus (usa a sua localização)"}
      </button>
      {erro && (
        <span role="status" className="relative z-10 text-caption text-terra-text">
          {erro}
        </span>
      )}
    </span>
  );
}
