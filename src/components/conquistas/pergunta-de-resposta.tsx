"use client";

import { MessageCircleQuestion } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { responderSeRespondeu } from "@/lib/acoes/conquistas";
import type { PerguntaDeResposta } from "@/lib/conquistas";

// No alto do feed, 2 dias depois do contato numa vaga: "A empresa te respondeu?" (migração 20270526120000). O "Ainda
// não" avisa quem publicou e mostra as vagas parecidas.

const BOTAO =
  "inline-flex min-h-10 items-center justify-center rounded-pill border px-4 text-label transition-colors disabled:opacity-60";

export function PerguntaDeRespostaNoFeed({ pergunta }: { pergunta: PerguntaDeResposta }) {
  const [resposta, setResposta] = useState<string | null>(null);
  const [pronto, setPronto] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function responder(r: "sim" | "ainda_nao" | "desisti") {
    setErro(null);
    iniciar(async () => {
      const x = await chamarAcao(() => responderSeRespondeu(pergunta.anuncio_id, r));
      if (!x.ok) return setErro("erro" in x && x.erro ? x.erro : "Não foi possível agora. Tente de novo.");
      setResposta(r);
      setPronto("mensagem" in x && x.mensagem ? x.mensagem : "Obrigado por contar.");
    });
  }

  if (pronto) {
    return (
      <div role="status" className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 px-4 py-3 text-body-sm text-ink">
        <p>{pronto}</p>
        {resposta !== "sim" && (
          <Link
            href={`/anuncio/${pergunta.anuncio_id}/parecidas`}
            className="self-start text-label text-ink underline underline-offset-4 hover:no-underline"
          >
            Ver vagas parecidas
          </Link>
        )}
      </div>
    );
  }

  return (
    <section
      id="te-respondeu"
      aria-labelledby={`te-respondeu-${pergunta.anuncio_id}`}
      className="flex scroll-mt-24 flex-col gap-3 rounded-lg border border-line-strong bg-surface-200 px-4 py-3.5"
    >
      <h2 id={`te-respondeu-${pergunta.anuncio_id}`} className="flex items-start gap-2 text-label">
        <MessageCircleQuestion aria-hidden className="mt-0.5 size-[18px] shrink-0 text-ink-muted" />
        <span>
          {pergunta.empresa_nome} te respondeu sobre a vaga “{pergunta.titulo}”?
        </span>
      </h2>
      <p className="-mt-1 text-body-sm text-ink-muted">
        A resposta ajuda quem procura trabalho a saber quais empresas respondem.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={enviando}
          onClick={() => responder("sim")}
          className={`${BOTAO} border-ink bg-ink text-surface-200 hover:opacity-90`}
        >
          Sim
        </button>
        <button
          type="button"
          disabled={enviando}
          onClick={() => responder("ainda_nao")}
          className={`${BOTAO} border-line-strong bg-surface-100 text-ink hover:bg-surface-300`}
        >
          Ainda não
        </button>
        <button
          type="button"
          disabled={enviando}
          onClick={() => responder("desisti")}
          className={`${BOTAO} border-transparent text-ink-muted hover:bg-surface-300 hover:text-ink`}
        >
          Desisti
        </button>
      </div>
      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
    </section>
  );
}
