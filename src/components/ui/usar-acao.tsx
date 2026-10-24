"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import type { Resultado } from "@/lib/tipos";

/**
 * Roda uma ação do servidor e mostra o resultado embaixo dos botões. Se a ação nem chegar ao
 * servidor (internet caiu, site publicado de novo com a página aberta), mostra o aviso em vez da
 * página de erro, e `depois` recebe a falha (quem mudou a tela antes pode desfazer).
 */
export function useAcao() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  function rodar(acao: () => Promise<Resultado>, depois?: (r: Resultado) => void) {
    setAviso(null);
    iniciar(async () => {
      const r: Resultado = await chamarAcao(acao);
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
