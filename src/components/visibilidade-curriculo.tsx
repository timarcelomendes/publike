"use client";

import { UserSearch } from "lucide-react";
import { useState } from "react";
import { mudarVisibilidadeCurriculo } from "@/lib/acoes/talentos";
import { useAcao } from "./ui/usar-acao";

/**
 * "Deixar as empresas me encontrarem": com isso ligado, quem tem vaga na sua cidade vê
 * o currículo (sem telefone, sem e-mail e com o nome encurtado) e pode convidar você.
 */
export function VisibilidadeCurriculo({ visivel: inicial }: { visivel: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [visivel, setVisivel] = useState(inicial);
  return (
    <section
      aria-labelledby="talentos-titulo"
      className="mt-6 flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <UserSearch aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
        <div className="min-w-0 flex-1">
          <h2 id="talentos-titulo" className="text-h3">
            Deixar as empresas me encontrarem
          </h2>
          <p className="mt-1 text-body-sm text-ink-muted">
            Quem tem vaga na sua cidade vê seu currículo e pode convidar você. Telefone e e-mail continuam escondidos, e
            o nome aparece encurtado (ex.: Maria S.). O contato só sai se você curtir a vaga e a empresa aceitar.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={visivel}
          aria-labelledby="talentos-titulo"
          disabled={pendente}
          onClick={() => {
            const novo = !visivel;
            rodar(
              () => mudarVisibilidadeCurriculo(novo),
              (r) => r.ok && setVisivel(novo),
            );
          }}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-pill border transition-colors disabled:opacity-60 ${
            visivel ? "border-transparent bg-cerrado" : "border-line-strong bg-surface-300"
          }`}
        >
          <span
            aria-hidden
            className={`inline-block size-5 rounded-pill bg-surface-100 shadow-card transition-transform ${
              visivel ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      {mensagem}
    </section>
  );
}
