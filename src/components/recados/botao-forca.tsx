"use client";

import { BicepsFlexed } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { darForca } from "@/lib/acoes/recados";

/**
 * A Força de um recado (a reação: no Publike, "Curtir" é candidatar-se). Muda na hora e volta
 * atrás se o servidor recusar. No próprio recado, só o número. Sem conta, leva para entrar.
 */
export function BotaoForca({
  recadoId,
  forcas: forcasIniciais,
  dei: deiInicial,
  proprio,
  logado,
}: {
  recadoId: string;
  forcas: number;
  dei: boolean;
  proprio: boolean;
  logado: boolean;
}) {
  const router = useRouter();
  const [forcas, setForcas] = useState(forcasIniciais);
  const [dei, setDei] = useState(deiInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const rotulo = forcas === 1 ? "1 Força" : `${forcas} Força`;

  if (proprio) {
    return (
      <span className="inline-flex min-h-9 items-center gap-1.5 px-1 text-label text-ink-muted">
        <BicepsFlexed aria-hidden className="size-[18px]" />
        {forcas > 0 ? rotulo : "Sem Força ainda"}
      </span>
    );
  }
  const classe = `relative z-10 inline-flex min-h-9 items-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors ${
    dei ? "border-ink bg-ink text-surface-100" : "border-line-strong bg-surface-100 text-ink hover:bg-surface-300"
  }`;
  if (!logado) {
    return (
      <Link href={`/entrar?next=${encodeURIComponent(`/recado/${recadoId}`)}`} className={classe}>
        <BicepsFlexed aria-hidden className="size-[18px]" />
        Força{forcas > 0 && <span className="tabular-nums">{forcas}</span>}
      </Link>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        aria-pressed={dei}
        // um toque por vez: o segundo, antes da resposta, desfazia a conta da mudança na hora
        disabled={pendente}
        onClick={() => {
          const antes = { forcas, dei };
          setErro(null);
          setDei(!dei);
          setForcas(Math.max(0, forcas + (dei ? -1 : 1)));
          iniciar(async () => {
            const r = await chamarAcao(() => darForca(recadoId));
            if (!r.ok) {
              setForcas(antes.forcas);
              setDei(antes.dei);
              setErro(r.erro);
              if ("ir" in r && r.ir) router.push(r.ir);
              return;
            }
            if ("forcas" in r) {
              setForcas(r.forcas);
              setDei(r.dei);
            }
          });
        }}
        className={classe}
      >
        <BicepsFlexed aria-hidden className="size-[18px]" />
        Força
        {forcas > 0 && <span className="tabular-nums">{forcas}</span>}
        <span className="sr-only">{dei ? " (você deu Força)" : ""}</span>
      </button>
      {erro && (
        <span role="alert" className="text-body-sm text-danger">
          {erro}
        </span>
      )}
    </span>
  );
}
