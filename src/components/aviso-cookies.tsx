"use client";

import { Cookie } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { guardarPropaganda } from "./google-ads";
import { assinarBoasVindas, esperandoBoasVindas } from "./boas-vindas-parceiro";
import { Botao } from "./ui/botao";

// Aviso de cookies: os necessários (sessão e escolhas da pessoa) sempre; os de propaganda (o código do
// Google Ads, para saber se o anúncio trouxe gente) só com o "Aceitar". "Só os necessários" fecha sem eles.
// A escolha muda depois na política de privacidade (#cookies).
// Fica no lugar do convite para instalar o app, que espera o aviso ser fechado,
// e espera as boas-vindas da primeira visita fecharem (boas-vindas-parceiro.tsx).

const CHAVE = "publike_aviso_cookies";
const VERSAO = "1";
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
  // no servidor (e antes de ler o navegador) o aviso não aparece: nada pisca para quem já viu
  const visto = useSyncExternalStore(assinar, jaViu, () => true);
  // na primeira visita, as boas-vindas vêm antes: o aviso espera elas fecharem
  const caminho = usePathname() ?? "/";
  const esperando = useSyncExternalStore(
    assinarBoasVindas,
    () => esperandoBoasVindas(caminho),
    () => true,
  );
  const [fechado, setFechado] = useState(false);
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
        <Link href="/privacidade#cookies" className="text-label text-ink-muted underline-offset-2 hover:text-ink hover:underline">
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
