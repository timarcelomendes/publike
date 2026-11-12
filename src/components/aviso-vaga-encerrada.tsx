"use client";

import { X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Aviso, Container } from "./ui/basicos";

// O aviso de quem abriu uma vaga que saiu do ar e veio parar nas parecidas (lib/servidor/vaga-fora-do-ar.ts):
// ?vaga=encerrada no endereço. Fechou, some e o endereço fica limpo (para compartilhar sem o aviso).
export function AvisoVagaEncerrada() {
  const encerrada = useSearchParams().get("vaga") === "encerrada";
  const caminho = usePathname();
  const [fechado, setFechado] = useState(false);
  if (!encerrada || fechado) return null;

  function fechar() {
    setFechado(true);
    const url = new URL(window.location.href);
    url.searchParams.delete("vaga");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  return (
    <Container className="pt-4">
      <div className="relative">
        <Aviso titulo="Essa vaga não está mais no ar">
          <p>{caminho === "/" ? "Veja as vagas abertas perto de você." : "Estas são parecidas e estão abertas agora."}</p>
        </Aviso>
        <button
          type="button"
          onClick={fechar}
          aria-label="Fechar o aviso"
          className="absolute top-1 right-1 inline-flex size-11 items-center justify-center rounded-pill text-ink-muted hover:text-ink"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
    </Container>
  );
}
