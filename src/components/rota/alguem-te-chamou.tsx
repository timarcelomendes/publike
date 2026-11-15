"use client";

import { useState, useTransition } from "react";
import { responderRota } from "@/lib/acoes/rota-curriculo";

const BOTAO =
  "inline-flex min-h-10 items-center justify-center rounded-pill border border-line-strong bg-surface-200 px-4 text-label text-ink transition-colors hover:bg-surface-300 disabled:opacity-60";

const DEPOIS: Record<string, string> = {
  sim: "Que bom! Boa sorte na conversa. Se der certo, conte no Publike.",
  ainda_nao: "Às vezes demora. Vale montar outra rota com uma distância maior ou outra função.",
  nao: "Obrigado por contar. Vale tentar outra função ou uma distância maior; e as vagas do Publike chegam toda semana.",
};

/** "Alguém te chamou?", uma semana depois de entregar as cópias (migração 20270606120000). */
export function AlguemTeChamou({ rota, resposta }: { rota: string; resposta: string | null }) {
  const [feita, setFeita] = useState<string | null>(resposta);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  if (feita) {
    return (
      <p role="status" id="chamou" className="rounded-lg border border-line bg-surface-200 px-4 py-3 text-body-sm text-ink">
        {DEPOIS[feita] ?? "Obrigado por contar."}
      </p>
    );
  }
  return (
    <section id="chamou" aria-label="Alguém te chamou?" className="flex flex-col gap-3 rounded-lg border border-line-strong bg-surface-200 p-4">
      <p className="text-label text-ink">Alguém te chamou depois que você entregou os currículos?</p>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["sim", "Sim, me chamaram"],
            ["ainda_nao", "Ainda não"],
            ["nao", "Não"],
          ] as const
        ).map(([valor, nome]) => (
          <button
            key={valor}
            type="button"
            disabled={enviando}
            className={BOTAO}
            onClick={() =>
              iniciar(async () => {
                setErro(null);
                const r = await responderRota(rota, valor);
                if (!r.ok) setErro(r.erro);
                else setFeita(valor);
              })
            }
          >
            {nome}
          </button>
        ))}
      </div>
      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
    </section>
  );
}
