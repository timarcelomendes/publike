"use client";

import { useState } from "react";
import { mudarConfirmacaoDeLeitura } from "@/lib/acoes/avisos";
import { useAcao } from "../ui/usar-acao";

/**
 * Preferências › Conversas › Confirmação de leitura (claude/plano-confirmacao-de-leitura.md). Ligada (o
 * padrão), quem mandou vê quando a conta leu: os dois tiques. Desligada, ninguém vê, e a conta também não vê a dos
 * outros. Muda na hora e volta atrás se não salvar. `pode`: na conta com equipe, só o dono e quem administra.
 */
export function ConfirmacaoDeLeitura({ ligada: inicial, pode }: { ligada: boolean; pode: boolean }) {
  const acao = useAcao();
  const [ligada, setLigada] = useState(inicial);

  function mudar() {
    const nova = !ligada;
    setLigada(nova);
    // não salvou: volta como estava
    acao.rodar(
      () => mudarConfirmacaoDeLeitura(nova),
      (r) => !r.ok && setLigada(!nova),
    );
  }

  return (
    <div className="rounded-lg border border-line bg-surface-200 p-4 sm:p-5">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p id="confirmacao-de-leitura" className="text-label">
            Confirmação de leitura
          </p>
          <p id="confirmacao-de-leitura-ajuda" className="mt-0.5 text-body-sm text-ink-muted">
            Quem mandou a mensagem vê quando você leu (os dois tiques). Desligada, ninguém vê quando você leu, e você
            também não vê quando leram as suas.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={ligada}
          aria-labelledby="confirmacao-de-leitura"
          aria-describedby="confirmacao-de-leitura-ajuda"
          disabled={!pode || acao.pendente}
          onClick={mudar}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-pill border transition-colors motion-reduce:transition-none disabled:opacity-50 ${
            ligada ? "border-transparent bg-cerrado" : "border-line-strong bg-surface-300"
          }`}
        >
          <span
            aria-hidden
            className={`inline-block size-5 rounded-pill bg-surface-100 shadow-card transition-transform motion-reduce:transition-none ${
              ligada ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      {!pode && <p className="mt-3 text-body-sm text-ink-muted">Só quem administra a agência muda isto.</p>}
      {acao.mensagem}
    </div>
  );
}
