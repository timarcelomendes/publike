"use client";

import { Star } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { salvarVaga } from "@/lib/acoes/descobrir";

const CLASSES =
  "inline-flex min-h-11 items-center gap-2 rounded-pill border border-line-strong bg-surface-200 px-4 text-label text-ink transition-colors hover:bg-surface-300 disabled:opacity-60";

/** Estrela de "salvar para depois" na página da vaga. */
export function BotaoSalvarVaga({ anuncioId, salva, logado }: { anuncioId: string; salva: boolean; logado: boolean }) {
  const [marcada, setMarcada] = useState(salva);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  if (!logado) {
    return (
      <Link href={`/entrar?next=${encodeURIComponent(`/anuncio/${anuncioId}`)}`} className={CLASSES}>
        <Star aria-hidden className="size-[18px] text-ipe" />
        Salvar
      </Link>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-pressed={marcada}
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await salvarVaga(anuncioId, !marcada);
            if (r.ok) {
              setMarcada(!marcada);
              setErro(null);
            } else setErro(r.erro);
          })
        }
        className={CLASSES}
      >
        <Star aria-hidden className="size-[18px] text-ipe" fill={marcada ? "currentColor" : "none"} />
        {marcada ? "Salva" : "Salvar"}
      </button>
      {erro && <p className="text-body-sm text-danger">{erro}</p>}
    </div>
  );
}
