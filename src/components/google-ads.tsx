"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  CHAVE_PROPAGANDA,
  COOKIE_CONVERSAO,
  CONVERSOES,
  EVENTO_PROPAGANDA,
  GOOGLE_ADS_ID,
  lerConversoes,
} from "@/lib/google-ads";

// O código do Google Ads, só depois do "Aceitar" no aviso de cookies (lib/google-ads.ts).
// Também passa para o Google os momentos marcados pelo servidor (cookie publike_conversao).

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

// o endereço da primeira página da visita: o clique no anúncio chega com ?gclid=..., e a pessoa
// pode aceitar os cookies já em outra página
const PRIMEIRO_ENDERECO = typeof window === "undefined" ? "" : window.location.href;

export function aceitouPropaganda() {
  try {
    return window.localStorage.getItem(CHAVE_PROPAGANDA) === "sim";
  } catch {
    return false;
  }
}

export function guardarPropaganda(sim: boolean) {
  try {
    window.localStorage.setItem(CHAVE_PROPAGANDA, sim ? "sim" : "nao");
  } catch {
    // sem armazenamento: vale só nesta página
  }
  window.dispatchEvent(new Event(EVENTO_PROPAGANDA));
}

function carregarGoogle() {
  if (window.gtag) return;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag() {
    // o gtag.js espera o objeto "arguments", não uma lista
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", GOOGLE_ADS_ID, { page_location: PRIMEIRO_ENDERECO || window.location.href });
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`;
  document.head.appendChild(s);
}

function lerCookie() {
  const par = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE_CONVERSAO}=`));
  return par ? par.slice(COOKIE_CONVERSAO.length + 1) : null;
}

/** Passa para o Google os momentos marcados e apaga o cookie (sem aceite, só apaga). */
function conferirConversoes() {
  const valor = lerCookie();
  if (valor === null) return;
  document.cookie = `${COOKIE_CONVERSAO}=; path=/; max-age=0; samesite=lax`;
  if (!aceitouPropaganda()) return;
  carregarGoogle();
  for (const c of lerConversoes(valor)) {
    window.gtag!("event", "conversion", { send_to: `${GOOGLE_ADS_ID}/${CONVERSOES[c]}`, value: 1, currency: "BRL" });
  }
}

export function GoogleAds() {
  const caminho = usePathname();

  // aceitou (agora ou antes): carrega
  useEffect(() => {
    function ver() {
      if (aceitouPropaganda()) carregarGoogle();
      conferirConversoes();
    }
    ver();
    window.addEventListener(EVENTO_PROPAGANDA, ver);
    // a curtida não troca de página: o cookie chega na resposta da ação
    const loja = (window as { cookieStore?: EventTarget }).cookieStore;
    loja?.addEventListener("change", conferirConversoes);
    const vez = loja ? null : window.setInterval(conferirConversoes, 2000);
    return () => {
      window.removeEventListener(EVENTO_PROPAGANDA, ver);
      loja?.removeEventListener("change", conferirConversoes);
      if (vez) window.clearInterval(vez);
    };
  }, []);

  // cada página nova (as ações que publicam ou salvam levam para outra página)
  useEffect(() => {
    conferirConversoes();
  }, [caminho]);

  return null;
}
