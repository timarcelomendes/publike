"use client";

import { CalendarPlus, Download } from "lucide-react";
import { conviteIcs, linkGoogleAgenda, type EventoAgenda } from "@/lib/agenda";

/** "Google Agenda" e "Baixar convite (.ics)" para pôr a entrevista na agenda do celular ou do computador. */
export function BotoesAgenda({ evento }: { evento: EventoAgenda }) {
  if (evento.cancelado) return null;
  // o arquivo é montado no toque (a data de agora entra no convite)
  function baixar() {
    const blob = new Blob([conviteIcs(evento, new Date())], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "entrevista.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const classe =
    "inline-flex min-h-10 items-center gap-1.5 rounded-md border border-line-strong bg-surface-200 px-3 text-label hover:bg-surface-300";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={linkGoogleAgenda(evento)} target="_blank" rel="noopener noreferrer" className={classe}>
        <CalendarPlus aria-hidden className="size-4" />
        Google Agenda
      </a>
      <button type="button" onClick={baixar} className={classe}>
        <Download aria-hidden className="size-4" />
        Outra agenda (.ics)
      </button>
    </div>
  );
}
