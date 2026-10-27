"use client";

import { Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ehAndroid } from "./instalar-app";
import { BotaoLink } from "./ui/botao";
import { PAGINA_DO_TESTE, TESTE_FECHADO } from "@/lib/android";

// Convite para o teste fechado da Play, no topo do Painel: só no Android (o app da Play só existe para
// ele), fora do app instalado e enquanto TESTE_FECHADO. "Agora não" guarda no navegador: volta em 7 dias,
// até 3 vezes.

const CHAVE = "publike_convite_teste";
const DIAS = 7;
const VEZES = 3;

function lerDispensa(): { vezes: number; em: number } {
  try {
    const [v, t] = (localStorage.getItem(CHAVE) ?? "").split("~").map(Number);
    return { vezes: v || 0, em: t || 0 };
  } catch {
    return { vezes: 0, em: 0 };
  }
}

function dispensar() {
  try {
    localStorage.setItem(CHAVE, `${lerDispensa().vezes + 1}~${Date.now()}`);
  } catch {
    // sem o navegador guardar, o convite só volta na próxima visita
  }
}

function podeMostrar() {
  if (!TESTE_FECHADO || !ehAndroid()) return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return false; // já está no app
  const { vezes, em } = lerDispensa();
  return vezes < VEZES && Date.now() - em >= DIAS * 86_400_000;
}

export function ConviteTesteAndroid() {
  // só o navegador sabe o aparelho: no servidor (e no primeiro desenho) não aparece nada
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- o aparelho só se sabe depois de montar
    setAberto(podeMostrar());
  }, []);
  if (!aberto) return null;

  function agoraNao() {
    dispensar();
    setAberto(false);
  }

  return (
    <section
      aria-label="Teste do app no Google Play"
      className="relative flex gap-3 rounded-lg border border-line bg-surface-200 p-4 pr-12 shadow-card"
    >
      <Smartphone aria-hidden className="mt-0.5 size-5 shrink-0 text-terra-text" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-label">Ajude a lançar o app do Publike no Google Play</p>
        <p className="text-body-sm text-ink-muted">
          O Google pede que pessoas com Android testem o app por 14 dias antes de ele ir para a loja. Leva 2 minutos e é
          grátis.
        </p>
        <span>
          <BotaoLink href={`${PAGINA_DO_TESTE}?de=painel`} tamanho="sm" onClick={dispensar}>
            Quero testar
          </BotaoLink>
        </span>
      </div>
      <button
        type="button"
        onClick={agoraNao}
        className="absolute top-2 right-2 flex size-9 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink"
      >
        <X aria-hidden className="size-4" />
        <span className="sr-only">Agora não</span>
      </button>
    </section>
  );
}
