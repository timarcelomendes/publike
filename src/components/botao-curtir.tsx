"use client";

import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { curtirAnuncio, descurtirAnuncio } from "@/lib/acoes/curtidas";

/**
 * Botão de curtir do card (Design System: pill; "Curtido" com fundo like-soft
 * e coração vermelho). Curtir aqui é rápido; a mensagem opcional fica na
 * página do anúncio.
 */
export function BotaoCurtir({
  anuncioId,
  status,
  logado,
  className = "",
}: {
  anuncioId: string;
  status: string | null;
  logado: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [atual, setAtual] = useOptimistic(status);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!erro) return;
    const t = setTimeout(() => setErro(null), 6000);
    return () => clearTimeout(t);
  }, [erro]);

  const curtido = atual !== null;
  const respondido = atual === "match" || atual === "dispensada";

  function clicar() {
    setErro(null);
    if (!logado) {
      router.push(`/entrar?next=${encodeURIComponent(`/anuncio/${anuncioId}`)}`);
      return;
    }
    if (respondido) {
      router.push(`/anuncio/${anuncioId}`);
      return;
    }
    iniciar(async () => {
      setAtual(curtido ? null : "pendente");
      const r = curtido ? await descurtirAnuncio(anuncioId) : await curtirAnuncio(anuncioId);
      if (!r.ok) {
        if (r.ir) router.push(r.ir);
        else setErro(r.erro);
      }
    });
  }

  const estilo =
    atual === "match"
      ? "border-transparent bg-cerrado text-on-cerrado"
      : curtido
        ? "border-like-soft bg-like-soft text-like-text"
        : "border-line-strong bg-surface-200 text-ink hover:bg-surface-300";

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={clicar}
        disabled={pendente}
        aria-pressed={curtido}
        className={`inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors disabled:opacity-70 ${estilo}`}
      >
        <Heart
          aria-hidden
          className={`size-4 ${curtido && atual !== "match" ? "text-like" : ""}`}
          fill={curtido ? "currentColor" : "none"}
        />
        {atual === "match" ? "Deu match" : curtido ? "Curtido" : "Curtir"}
      </button>
      {erro && (
        <p
          role="alert"
          className="absolute right-0 bottom-full z-20 mb-2 w-64 rounded-md border border-danger bg-surface-200 p-3 text-body-sm text-ink shadow-raised"
        >
          {erro}
        </p>
      )}
    </div>
  );
}
