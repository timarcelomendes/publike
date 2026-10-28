"use client";

import { useState } from "react";
import { ligarPartesDoCopiloto } from "@/lib/acoes/copiloto";
import { useAcao } from "../ui/usar-acao";

function Chave({
  id,
  titulo,
  ligado,
  pendente,
  aoMudar,
  children,
}: {
  id: string;
  titulo: string;
  ligado: boolean;
  pendente: boolean;
  aoMudar: () => void;
  children: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p id={id} className="text-label">
          {titulo}
        </p>
        <p className="text-body-sm text-ink-muted">{children}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        aria-labelledby={id}
        disabled={pendente}
        onClick={aoMudar}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-pill border transition-colors disabled:opacity-60 ${
          ligado ? "border-transparent bg-cerrado" : "border-line-strong bg-surface-300"
        }`}
      >
        <span
          aria-hidden
          className={`inline-block size-5 rounded-pill bg-surface-100 shadow-card transition-transform ${
            ligado ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

/** As partes do copiloto que ligam e desligam na vaga (e, se quiser, nas próximas vagas). */
export function PartesDoCopiloto({
  anuncioId,
  triagem,
  busca,
}: {
  anuncioId: string;
  triagem: boolean;
  busca: boolean;
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const [partes, setPartes] = useState({ triagem, busca });
  const [padrao, setPadrao] = useState(false);

  function mudar(novo: { triagem: boolean; busca: boolean }) {
    const antes = partes;
    setPartes(novo);
    rodar(
      () => ligarPartesDoCopiloto(anuncioId, { ...novo, padrao }),
      (r) => !r.ok && setPartes(antes),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Chave
        id="parte-busca"
        titulo="Buscar em Talentos"
        ligado={partes.busca}
        pendente={pendente}
        aoMudar={() => mudar({ ...partes, busca: !partes.busca })}
      >
        Procura quem deixou o currículo visível para as empresas e mostra quem combina, para você convidar.
      </Chave>
      <Chave
        id="parte-triagem"
        titulo="Ler os candidatos da vaga"
        ligado={partes.triagem}
        pendente={pendente}
        aoMudar={() => mudar({ ...partes, triagem: !partes.triagem })}
      >
        Lê o currículo de quem curtiu a vaga contra os critérios. Aceitar e recusar continuam com você, no quadro.
      </Chave>
      <label className="inline-flex cursor-pointer items-center gap-2 text-body-sm">
        <input
          type="checkbox"
          checked={padrao}
          onChange={(e) => setPadrao(e.target.checked)}
          className="size-4 accent-[var(--pk-ink)]"
        />
        Usar a mesma escolha nas próximas vagas
      </label>
      {mensagem}
    </div>
  );
}
