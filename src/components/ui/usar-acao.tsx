"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Resultado } from "@/lib/tipos";

/** Roda uma ação do servidor e mostra o resultado embaixo dos botões. */
export function useAcao() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  function rodar(acao: () => Promise<Resultado>, depois?: (r: Resultado) => void) {
    setAviso(null);
    iniciar(async () => {
      const r = await acao();
      if (!r.ok) {
        if (r.ir) router.push(r.ir);
        else setAviso({ ok: false, texto: r.erro });
      } else if (r.mensagem) {
        setAviso({ ok: true, texto: r.mensagem });
      }
      depois?.(r);
    });
  }

  const mensagem = aviso ? (
    <p role="status" className={`text-body-sm ${aviso.ok ? "text-cerrado-text" : "text-danger"}`}>
      {aviso.texto}
    </p>
  ) : null;

  return { rodar, pendente, mensagem };
}
