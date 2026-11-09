"use client";

import { PartyPopper } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { darParabens } from "@/lib/acoes/conquistas";

/**
 * "Dar os parabéns" por uma conquista (como a Força do post: muda na hora e volta atrás se o servidor recusar). Na
 * própria conquista, só o número.
 */
export function BotaoParabens({
  anuncioId,
  perfilId,
  parabens: iniciais,
  dei: deiInicial,
  minha,
}: {
  anuncioId: string;
  perfilId: string;
  parabens: number;
  dei: boolean;
  minha: boolean;
}) {
  const router = useRouter();
  const [parabens, setParabens] = useState(iniciais);
  const [dei, setDei] = useState(deiInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  if (minha) {
    return (
      <span className="inline-flex min-h-9 items-center gap-1.5 text-label text-ink-muted">
        <PartyPopper aria-hidden className="size-[18px]" />
        {parabens === 0 ? "Ainda sem parabéns" : parabens === 1 ? "1 parabéns" : `${parabens} parabéns`}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        aria-pressed={dei}
        disabled={pendente}
        onClick={() => {
          const antes = { parabens, dei };
          setErro(null);
          setDei(!dei);
          setParabens(Math.max(0, parabens + (dei ? -1 : 1)));
          iniciar(async () => {
            const r = await chamarAcao(() => darParabens(anuncioId, perfilId));
            if (!r.ok) {
              setParabens(antes.parabens);
              setDei(antes.dei);
              setErro(r.erro);
              if ("ir" in r && r.ir) router.push(r.ir);
              return;
            }
            if ("parabens" in r) {
              setParabens(r.parabens);
              setDei(r.dei);
            }
          });
        }}
        className={`relative z-10 inline-flex min-h-9 items-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors ${
          dei ? "border-cerrado bg-cerrado text-on-cerrado" : "border-line-strong bg-surface-100 text-ink hover:bg-surface-300"
        }`}
      >
        <PartyPopper aria-hidden className="size-[18px]" />
        {dei ? "Você deu os parabéns" : "Dar os parabéns"}
        {parabens > 0 && <span className="tabular-nums">{parabens}</span>}
      </button>
      {erro && (
        <span role="alert" className="text-body-sm text-danger">
          {erro}
        </span>
      )}
    </span>
  );
}
