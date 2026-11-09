"use client";

import { PartyPopper } from "lucide-react";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { mostrarConquista, responderConquista } from "@/lib/acoes/conquistas";
import type { ConquistaPendente } from "@/lib/conquistas";
import { nomeCurtoDaConquista } from "./nomes";

// No alto do feed, para quem deu match numa vaga há 5 dias ou mais: "Deu certo?" e, depois do "Comecei!", "Mostrar
// no Publike?". Uma pergunta por vez (a mais recente); as outras vêm depois.

const BOTAO =
  "inline-flex min-h-10 items-center justify-center rounded-pill border px-4 text-label transition-colors disabled:opacity-60";

export function PerguntaDaConquista({ pendente, meuNome }: { pendente: ConquistaPendente; meuNome: string }) {
  const [resposta, setResposta] = useState(pendente.resposta);
  const [pronto, setPronto] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function rodar(acao: () => Promise<{ ok: boolean; erro?: string; mensagem?: string }>, depois?: () => void) {
    setErro(null);
    iniciar(async () => {
      const r = await chamarAcao(acao);
      if (!r.ok) return setErro("erro" in r && r.erro ? r.erro : "Não foi possível agora. Tente de novo.");
      depois?.();
      if ("mensagem" in r && r.mensagem) setPronto(r.mensagem);
    });
  }

  if (pronto && resposta !== "comecei") {
    return (
      <p role="status" className="rounded-lg border border-line bg-surface-200 px-4 py-3 text-body-sm text-ink">
        {pronto}
      </p>
    );
  }

  return (
    <section
      id="conquista"
      aria-labelledby={`conquista-${pendente.anuncio_id}`}
      className="flex scroll-mt-24 flex-col gap-3 rounded-lg border border-cerrado/40 bg-cerrado/10 px-4 py-3.5"
    >
      <h2 id={`conquista-${pendente.anuncio_id}`} className="flex items-start gap-2 text-label">
        <PartyPopper aria-hidden className="mt-0.5 size-[18px] shrink-0 text-cerrado-text" />
        {resposta === "comecei" ? (
          <span>Parabéns pelo trabalho novo! Mostrar a sua conquista no Publike?</span>
        ) : (
          <span>
            Deu certo com {pendente.empresa_nome}? Você começou a trabalhar na vaga “{pendente.titulo}”?
          </span>
        )}
      </h2>
      {resposta === "comecei" ? (
        <>
          <p className="text-body-sm text-ink">
            Aparece para quem está perto:{" "}
            <b>
              {nomeCurtoDaConquista(meuNome)} começou a trabalhar como {pendente.titulo} na {pendente.empresa_nome}
            </b>
            . Quando a empresa confirmar, ganha o selo “Confirmado pela empresa”. Dá para tirar quando quiser.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={enviando}
              onClick={() => rodar(() => mostrarConquista(pendente.anuncio_id, true), () => setResposta("mostrada"))}
              className={`${BOTAO} border-cerrado bg-cerrado text-on-cerrado hover:opacity-90`}
            >
              Mostrar
            </button>
            <button
              type="button"
              disabled={enviando}
              onClick={() => rodar(() => mostrarConquista(pendente.anuncio_id, false), () => setResposta("so_para_mim"))}
              className={`${BOTAO} border-line-strong bg-surface-100 text-ink hover:bg-surface-300`}
            >
              Só para mim
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={enviando}
            onClick={() => rodar(() => responderConquista(pendente.anuncio_id, "comecei"), () => setResposta("comecei"))}
            className={`${BOTAO} border-cerrado bg-cerrado text-on-cerrado hover:opacity-90`}
          >
            Comecei!
          </button>
          <button
            type="button"
            disabled={enviando}
            onClick={() => rodar(() => responderConquista(pendente.anuncio_id, "ainda_nao"), () => setResposta("ainda_nao"))}
            className={`${BOTAO} border-line-strong bg-surface-100 text-ink hover:bg-surface-300`}
          >
            Ainda não
          </button>
          <button
            type="button"
            disabled={enviando}
            onClick={() => rodar(() => responderConquista(pendente.anuncio_id, "nao_deu"), () => setResposta("nao_deu"))}
            className={`${BOTAO} border-transparent text-ink-muted hover:bg-surface-300 hover:text-ink`}
          >
            Não deu certo
          </button>
        </div>
      )}
      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
    </section>
  );
}
