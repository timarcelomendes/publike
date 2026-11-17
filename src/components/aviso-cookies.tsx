"use client";

import { Cookie } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { guardarPropaganda } from "./google-ads";
import { CHAVE_AVISO_COOKIES, VERSAO_AVISO_COOKIES } from "@/lib/aviso-cookies";
import { assinarBoasVindas, esperandoBoasVindas } from "./boas-vindas-parceiro";
import { Botao } from "./ui/botao";

// Aviso de cookies: os necessários (sessão e escolhas da pessoa) sempre; os de propaganda (o código do
// Google Ads, para saber se o anúncio trouxe gente) só com o "Aceitar". "Só os necessários" fecha sem eles.
// A escolha muda depois na página Cookies (/cookies).
// Fica no lugar do convite para instalar o app, que espera o aviso ser fechado,
// e espera as boas-vindas da primeira visita fecharem (boas-vindas-parceiro.tsx).

const CHAVE = CHAVE_AVISO_COOKIES;
const VERSAO = VERSAO_AVISO_COOKIES;
/** Avisa quem espera o aviso fechar (o convite de instalar o app e o banner da página inicial). */
export const EVENTO_AVISO_COOKIES = "publike:aviso-cookies";
const EVENTO = EVENTO_AVISO_COOKIES;

function jaViu() {
  try {
    return window.localStorage.getItem(CHAVE) === VERSAO;
  } catch {
    return false;
  }
}

function assinar(avisar: () => void) {
  window.addEventListener(EVENTO, avisar);
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(EVENTO, avisar);
    window.removeEventListener("storage", avisar);
  };
}

/** Para o convite de instalar o app esperar o aviso de cookies ser fechado. */
export function avisoDeCookiesFechado() {
  return jaViu();
}

export function AvisoCookies() {
  // no servidor o aviso vem no HTML (SCRIPT_AVISO_COOKIES o esconde, antes de pintar, de quem não deve vê-lo)
  const visto = useSyncExternalStore(assinar, jaViu, () => false);
  // na primeira visita, as boas-vindas vêm antes: o aviso espera elas fecharem. O endereço vem do navegador (e não
  // do usePathname): sem ler o endereço no servidor, o aviso vai no HTML fora de Suspense, logo na primeira pintura;
  // num Suspense, ele ia escondido para o fim do HTML e virava o LCP das páginas de área (17/11/2026). As boas-vindas
  // avisam quando a página muda (EVENTO_BOAS_VINDAS).
  const esperando = useSyncExternalStore(
    assinarBoasVindas,
    () => esperandoBoasVindas(window.location.pathname),
    () => false,
  );
  const [fechado, setFechado] = useState(false);
  // já com o React: as marcas do <html> saem quando o aviso deve aparecer (as boas-vindas fecharam, por exemplo)
  const mostrar = !visto && !fechado && !esperando;
  useEffect(() => {
    if (!mostrar) return;
    document.documentElement.removeAttribute("data-ck-visto");
    document.documentElement.removeAttribute("data-bv-pendente");
  }, [mostrar]);
  if (visto || fechado || esperando) return null;

  function escolher(propaganda: boolean) {
    guardarPropaganda(propaganda);
    try {
      window.localStorage.setItem(CHAVE, VERSAO);
    } catch {
      // sem armazenamento: o aviso volta na próxima visita
    }
    setFechado(true);
    window.dispatchEvent(new Event(EVENTO));
  }

  return (
    <section
      data-aviso-cookies=""
      aria-label="Aviso de cookies"
      className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[45] rounded-lg border border-line-strong bg-surface-200 p-4 shadow-raised md:inset-x-auto md:bottom-6 md:left-6 md:w-[24rem]"
    >
      <p className="flex items-start gap-3 text-body-sm text-ink">
        <Cookie aria-hidden className="mt-0.5 size-5 shrink-0 text-terra-text" />
        <span>
          O Publike usa cookies para você continuar conectado e para lembrar suas escolhas, como o bairro de casa.
          Com o seu aceite, também os do Google, para saber se nossos anúncios trazem gente ao site.
        </span>
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
        <Link href="/cookies" className="text-label text-ink-muted underline-offset-2 hover:text-ink hover:underline">
          Saiba mais
        </Link>
        <Botao tamanho="sm" onClick={() => escolher(false)}>
          Só os necessários
        </Botao>
        <Botao tamanho="sm" onClick={() => escolher(true)}>
          Aceitar
        </Botao>
      </div>
    </section>
  );
}
