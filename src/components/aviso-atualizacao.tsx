"use client";

import { RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Botao } from "./ui/botao";

// Quando sai uma versão nova do Publike, quem está com o site aberto vê um aviso no alto
// da tela com o botão "Atualizar". A página guarda a versão com que foi aberta e, de tempos
// em tempos (e quando a pessoa volta para a aba), pergunta ao servidor a versão atual (/versao).
// "Agora não" esconde o aviso até sair outra versão.

const MINHA = process.env.NEXT_PUBLIC_VERSAO ?? "";
const A_CADA = 5 * 60 * 1000; // conferir a cada 5 minutos com a aba aberta
const INTERVALO_MINIMO = 60 * 1000; // e não mais que uma vez por minuto
const CHAVE_ADIADA = "publike_versao_adiada";

function adiada() {
  try {
    return window.sessionStorage.getItem(CHAVE_ADIADA);
  } catch {
    return null;
  }
}

export function AvisoAtualizacao() {
  const [nova, setNova] = useState<string | null>(null);

  useEffect(() => {
    if (!MINHA) return;
    let ultima = Date.now();
    let parado = false;

    async function conferir(agora = false) {
      if (parado || document.visibilityState !== "visible") return;
      if (!agora && Date.now() - ultima < INTERVALO_MINIMO) return;
      ultima = Date.now();
      try {
        const r = await fetch(`/versao?t=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) return;
        const { versao } = (await r.json()) as { versao?: string };
        if (versao && versao !== MINHA && versao !== adiada()) setNova(versao);
      } catch {
        // sem internet: confere de novo depois
      }
    }

    const relogio = window.setInterval(() => conferir(true), A_CADA);
    const aoVoltar = () => conferir();
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    window.addEventListener("online", aoVoltar);
    return () => {
      parado = true;
      window.clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
      window.removeEventListener("online", aoVoltar);
    };
  }, []);

  if (!nova) return null;

  function agoraNao() {
    try {
      if (nova) window.sessionStorage.setItem(CHAVE_ADIADA, nova);
    } catch {
      // sem armazenamento: o aviso só some até recarregar
    }
    setNova(null);
  }

  return (
    <section
      role="status"
      aria-label="Versão nova do Publike"
      className="fixed inset-x-3 top-[4.5rem] z-[46] flex flex-col gap-3 rounded-lg border border-line-strong bg-surface-200 p-4 shadow-raised sm:inset-x-auto sm:right-6 sm:w-[22rem]"
    >
      <div className="flex items-start gap-3">
        <RefreshCw aria-hidden className="mt-0.5 size-5 shrink-0 text-terra-text" />
        <p className="flex-1 text-body-sm text-ink">
          <strong className="block text-label">Tem uma versão nova do Publike.</strong>
          Atualize para ver as melhorias. Se estiver escrevendo algo, termine antes.
        </p>
        <button
          type="button"
          onClick={agoraNao}
          aria-label="Fechar o aviso"
          className="-m-2 inline-flex size-10 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-300 hover:text-ink"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <div className="flex justify-end gap-2">
        <Botao variante="fantasma" tamanho="sm" onClick={agoraNao}>
          Agora não
        </Botao>
        <Botao variante="secundario" tamanho="sm" onClick={() => window.location.reload()}>
          <RefreshCw aria-hidden className="size-4" />
          Atualizar
        </Botao>
      </div>
    </section>
  );
}
