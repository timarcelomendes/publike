"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// Botão oficial "Continuar com o Google" (Google Identity Services).
// O login acontece no próprio site: a janela do Google mostra o endereço do
// Publike, e não o do Supabase. O Google devolve um token de identidade, que
// o Supabase confere (signInWithIdToken).
// O botão acompanha o tema do site: claro (outline) ou escuro (filled_black).
// Os botões do Facebook e do LinkedIn copiam esse padrão (classesBotaoRede).

type RespostaGoogle = { credential?: string };

type GoogleId = {
  initialize: (opcoes: Record<string, unknown>) => void;
  renderButton: (elemento: HTMLElement, opcoes: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } };
  }
}

const SCRIPT = "https://accounts.google.com/gsi/client";
let carregando: Promise<GoogleId> | null = null;

function carregarGoogle(): Promise<GoogleId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  carregando ??= new Promise<GoogleId>((resolver, rejeitar) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => {
      const id = window.google?.accounts?.id;
      if (id) resolver(id);
      else rejeitar(new Error("Google Identity Services não carregou"));
    };
    script.onerror = () => {
      carregando = null;
      rejeitar(new Error("Google Identity Services não carregou"));
    };
    document.head.appendChild(script);
  });
  return carregando;
}

/** Texto aleatório de uso único. O Google recebe a impressão (SHA-256); o Supabase, o original. */
async function novoNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const nonce = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
  const hex = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
  return { nonce, hex };
}

// O tema do site segue o do sistema (prefers-color-scheme no globals.css).
const ESCURO = "(prefers-color-scheme: dark)";

function acompanharTema(avisar: () => void) {
  const consulta = window.matchMedia(ESCURO);
  consulta.addEventListener("change", avisar);
  return () => consulta.removeEventListener("change", avisar);
}

/** true quando o site está no tema escuro; muda na hora em que o sistema troca. */
function useTemaEscuro() {
  return useSyncExternalStore(
    acompanharTema,
    () => window.matchMedia(ESCURO).matches,
    () => false,
  );
}

export function BotaoGoogle({
  clientId,
  aoEntrar,
  aoFalhar,
}: {
  clientId: string;
  /** Recebe o token do Google e o nonce original. */
  aoEntrar: (token: string, nonce: string) => void;
  /** O script do Google não carregou (bloqueador, rede): quem chama mostra o botão comum. */
  aoFalhar: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [google, setGoogle] = useState<GoogleId | null>(null);
  const escuro = useTemaEscuro();
  // as funções mudam a cada render; o Google guarda só a que recebeu no initialize
  const retorno = useRef({ aoEntrar, aoFalhar });
  useEffect(() => {
    retorno.current = { aoEntrar, aoFalhar };
  });

  // Carrega o script do Google e prepara o login (uma vez).
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [id, { nonce, hex }] = await Promise.all([carregarGoogle(), novoNonce()]);
        if (cancelado) return;
        id.initialize({
          client_id: clientId,
          nonce: hex,
          context: "signin",
          ux_mode: "popup",
          itp_support: true,
          use_fedcm_for_button: true,
          callback: (r: RespostaGoogle) => {
            if (r.credential) retorno.current.aoEntrar(r.credential, nonce);
          },
        });
        setGoogle(id);
      } catch {
        if (!cancelado) retorno.current.aoFalhar();
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [clientId]);

  // Desenha o botão e desenha de novo quando o tema muda.
  useEffect(() => {
    const elemento = caixa.current;
    if (!google || !elemento) return;
    elemento.replaceChildren();
    google.renderButton(elemento, {
      type: "standard",
      theme: escuro ? "filled_black" : "outline",
      size: "large",
      text: "continue_with",
      shape: "pill",
      logo_alignment: "center",
      locale: "pt-BR",
      width: Math.min(400, Math.max(200, Math.round(elemento.getBoundingClientRect().width))),
    });
  }, [google, escuro]);

  return (
    <div className="relative min-h-10 w-full">
      {/* enquanto o script do Google carrega, uma pílula no lugar evita o pulo da tela */}
      {!google && (
        <div aria-hidden className="absolute inset-0 rounded-pill bg-surface-300 animate-pulse motion-reduce:animate-none" />
      )}
      <div
        ref={caixa}
        aria-busy={!google}
        // O quadro do Google é sempre "claro" por dentro. Sem isto, no tema escuro o
        // navegador pinta um retângulo branco em volta do botão.
        style={{ colorScheme: "light" }}
        className="flex min-h-10 w-full items-center justify-center"
      />
    </div>
  );
}
