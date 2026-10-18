"use client";

import { Heart, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { curtirAnuncio, curtirDeNovo, descurtirAnuncio } from "@/lib/acoes/curtidas";

/**
 * Botão de curtir do card (Design System: pill; "Curtido" com fundo like-soft
 * e coração vermelho). Curtir aqui é rápido; a mensagem opcional fica na
 * página do anúncio. Depois de curtir, um balão explica o que vem: quem publicou
 * decide se aceita, e só com o aceite vocês se conectam.
 */
export function BotaoCurtir({
  anuncioId,
  status,
  logado,
  servico = false,
  quem,
  className = "",
}: {
  anuncioId: string;
  status: string | null;
  logado: boolean;
  /** No serviço, curtir é pedir para contratar. */
  servico?: boolean;
  /** quem decide se aceita (o nome de quem publicou) */
  quem?: string;
  className?: string;
}) {
  const router = useRouter();
  const [atual, setAtual] = useOptimistic(status);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [explicar, setExplicar] = useState(false);

  useEffect(() => {
    if (!erro) return;
    const t = setTimeout(() => setErro(null), 6000);
    return () => clearTimeout(t);
  }, [erro]);

  useEffect(() => {
    if (!explicar) return;
    const t = setTimeout(() => setExplicar(false), 9000);
    return () => clearTimeout(t);
  }, [explicar]);

  // match desfeito: dá para curtir de novo (o servidor recusa se a outra pessoa bloqueou)
  const desfeito = atual === "desfeito";
  const curtido = atual !== null && !desfeito;
  const respondido = atual === "match" || atual === "dispensada";

  function clicar() {
    setErro(null);
    setExplicar(false);
    if (!logado) {
      // volta para a vaga com o quadro de curtir à mão (?curtir=1)
      router.push(`/entrar?next=${encodeURIComponent(`/anuncio/${anuncioId}?curtir=1`)}`);
      return;
    }
    if (respondido) {
      router.push(`/anuncio/${anuncioId}`);
      return;
    }
    const curtindo = !curtido;
    iniciar(async () => {
      setAtual(curtido ? null : "pendente");
      const r = desfeito
        ? await curtirDeNovo(anuncioId)
        : curtido
          ? await descurtirAnuncio(anuncioId)
          : await curtirAnuncio(anuncioId);
      if (!r.ok) {
        if (r.ir) router.push(r.ir);
        else setErro(r.erro);
      } else if (curtindo) {
        setExplicar(true);
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
        {atual === "match"
          ? "Deu match"
          : desfeito
            ? servico
              ? "Pedir de novo"
              : "Curtir de novo"
            : curtido
              ? servico
                ? "Pedido enviado"
                : "Curtido"
              : servico
                ? "Contratar"
                : "Curtir"}
      </button>
      {erro && (
        <p
          role="alert"
          className="absolute right-0 bottom-full z-20 mb-2 w-64 rounded-md border border-danger bg-surface-200 p-3 text-body-sm text-ink shadow-raised"
        >
          {erro}
        </p>
      )}
      {explicar && !erro && (
        <div
          role="status"
          className="absolute right-0 bottom-full z-20 mb-2 flex w-64 items-start gap-2 rounded-md border border-line-strong bg-surface-200 p-3 text-body-sm text-ink shadow-raised"
        >
          <p>
            <strong>{servico ? "Pedido enviado!" : "Curtido!"}</strong> Agora {quem || "quem publicou"} decide se aceita.
            Se aceitar, vocês se conectam e o contato aparece no seu painel.
          </p>
          <button
            type="button"
            onClick={() => setExplicar(false)}
            className="-m-1 flex size-8 shrink-0 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink"
          >
            <X aria-hidden className="size-4" />
            <span className="sr-only">Fechar</span>
          </button>
        </div>
      )}
    </div>
  );
}
