"use client";

import { useEffect, useRef, useState } from "react";

// Verificação contra robôs (Cloudflare Turnstile) no pedido do link de acesso
// e do código por SMS. O Supabase confere o token (Authentication > Attack
// Protection) antes de mandar o e-mail ou o SMS: sem ela, um robô poderia
// disparar milhares de e-mails e gastar os créditos do Zoho.
// No modo "interaction-only" quase ninguém vê nada; só aparece uma caixinha
// quando o Cloudflare desconfia. Cada token vale uma vez só.

type Turnstile = {
  render: (elemento: HTMLElement, opcoes: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let carregando: Promise<Turnstile> | null = null;

function carregarTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  carregando ??= new Promise<Turnstile>((resolver, rejeitar) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => {
      if (window.turnstile) resolver(window.turnstile);
      else rejeitar(new Error("Turnstile não carregou"));
    };
    script.onerror = () => {
      carregando = null;
      rejeitar(new Error("Turnstile não carregou"));
    };
    document.head.appendChild(script);
  });
  return carregando;
}

type Avisos = {
  /** token novo (vale uma vez, por uns 5 minutos) */
  aoVerificar: (token: string) => void;
  /** o token venceu antes de ser usado; o Turnstile já busca outro */
  aoExpirar: () => void;
};

export function VerificacaoRobo({ siteKey, aoVerificar, aoExpirar }: { siteKey: string } & Avisos) {
  const caixa = useRef<HTMLDivElement>(null);
  const avisos = useRef<Avisos>({ aoVerificar, aoExpirar });
  const [falhou, setFalhou] = useState(false);

  // sempre a versão mais nova das funções, sem recriar o widget
  useEffect(() => {
    avisos.current = { aoVerificar, aoExpirar };
  });

  useEffect(() => {
    let ativo = true;
    let id: string | null = null;
    carregarTurnstile()
      .then((turnstile) => {
        if (!ativo || !caixa.current) return;
        id = turnstile.render(caixa.current, {
          sitekey: siteKey,
          action: "entrar",
          language: "pt-br",
          theme: "auto",
          size: "flexible",
          appearance: "interaction-only",
          "refresh-expired": "auto",
          callback: (token: string) => {
            setFalhou(false);
            avisos.current.aoVerificar(token);
          },
          "expired-callback": () => avisos.current.aoExpirar(),
          "error-callback": () => {
            setFalhou(true);
          },
        });
      })
      .catch(() => {
        if (ativo) setFalhou(true);
      });
    return () => {
      ativo = false;
      if (id) window.turnstile?.remove(id);
    };
  }, [siteKey]);

  return (
    <div>
      <div ref={caixa} />
      {falhou && (
        <p role="alert" className="mt-2 text-body-sm text-danger">
          A verificação de segurança não carregou. Recarregue a página; se continuar, desative o bloqueador de
          anúncios ou tente outro navegador.
        </p>
      )}
    </div>
  );
}
