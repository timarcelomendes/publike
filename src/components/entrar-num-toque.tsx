"use client";

import { usePathname } from "next/navigation";
import { startTransition, useEffect } from "react";
import { ehNavegacao } from "@/lib/acao-segura";
import { registrarFunilVisitante } from "@/lib/acoes/funil-visitante";
import { irDepoisDoLogin } from "@/lib/acoes/perfil";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import { avisoDeCookiesFechado, EVENTO_AVISO_COOKIES } from "./aviso-cookies";
import { carregarGoogle, donoDoGoogle, novoNonce } from "./botao-google";

// Entrar com o Google num toque (One Tap; claude/plano-visitante-que-entra.md): para quem está sem conta, na página
// da vaga, na inicial e nas buscas, o quadro do próprio Google ("Continuar como Fulano") aparece no canto. Só para
// quem está logado no Google naquele navegador; se a pessoa fechar, o Google espera antes de mostrar de novo. Pedimos
// depois de 8 segundos na página, com o aviso de cookies já fechado e sem outra janela aberta. Quem entra segue o
// caminho de sempre (irDepoisDoLogin): conta nova completa o perfil e aceita as regras; depois volta para a página.

const ESPERA_MS = 8000;

/** Onde o quadro aparece: a inicial, a vaga e as buscas (cidade, área, função, bairro). */
function paginaDoToque(caminho: string) {
  return caminho === "/" || /^\/anuncio\/[^/]+$/.test(caminho) || /^\/(vagas|servicos)(\/|$)/.test(caminho);
}

export function EntrarNumToque({ clientId }: { clientId: string }) {
  const caminho = usePathname();

  useEffect(() => {
    if (!clientId || !paginaDoToque(caminho)) return;
    let cancelado = false;
    let espera: number | undefined;

    async function pedir() {
      if (cancelado) return;
      // outra janela aberta (as boas-vindas, uma pergunta): tenta de novo daqui a pouco
      if (document.querySelector("dialog[open], [role='dialog'][aria-modal='true']")) {
        espera = window.setTimeout(pedir, ESPERA_MS);
        return;
      }
      try {
        const [google, { nonce, hex }] = await Promise.all([carregarGoogle(), novoNonce()]);
        if (cancelado) return;
        // uma vez por carregamento (ou de novo, se o botão "Continuar com o Google" preparou o Google por último)
        if (donoDoGoogle.atual !== "toque") {
          donoDoGoogle.atual = "toque";
          google.initialize({
            client_id: clientId,
            nonce: hex,
            context: "signin",
            itp_support: true,
            use_fedcm_for_prompt: true,
            cancel_on_tap_outside: false,
            callback: (r: { credential?: string }) => {
              if (r.credential) void entrar(r.credential, nonce);
            },
          });
        }
        google.prompt();
        void registrarFunilVisitante("toque_mostrou").catch(() => {});
      } catch {
        // o script do Google não carregou (bloqueador, rede): fica sem o quadro
      }
    }

    function comecar() {
      window.clearTimeout(espera);
      espera = window.setTimeout(pedir, ESPERA_MS);
    }

    // depois do aviso de cookies: o quadro do Google não vai por cima dele
    if (avisoDeCookiesFechado()) comecar();
    else window.addEventListener(EVENTO_AVISO_COOKIES, comecar, { once: true });

    return () => {
      cancelado = true;
      window.clearTimeout(espera);
      window.removeEventListener(EVENTO_AVISO_COOKIES, comecar);
      window.google?.accounts?.id?.cancel();
    };
  }, [clientId, caminho]);

  return null;
}

/** O Google devolveu o token: o Supabase confere, abre a sessão e a pessoa segue (perfil novo ou a página). */
async function entrar(token: string, nonce: string) {
  const supabase = criarClienteNavegador();
  const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token, nonce });
  if (error) {
    console.warn("Publike: não deu para entrar num toque:", error.message);
    return;
  }
  void registrarFunilVisitante("toque_entrou").catch(() => {});
  const aqui = `${window.location.pathname}${window.location.search}`;
  startTransition(async () => {
    try {
      await irDepoisDoLogin(aqui);
    } catch (e) {
      if (ehNavegacao(e)) throw e;
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/auth/continuar?${new URLSearchParams({ next: aqui })}`);
    }
  });
}
