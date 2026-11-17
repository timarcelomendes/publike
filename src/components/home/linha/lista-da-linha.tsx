"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

/** De quantos em quantos itens a linha cresce no "Ver mais". */
const PASSO = 20;

/**
 * A linha mostra 20 itens e o "Ver mais" traz mais 20. `partes` vem do servidor já na ordem
 * (separadores de dia, a marca e os itens); `contam` diz quais partes são itens. O servidor manda só os primeiros
 * (17/11/2026: os 120 iam inteiros no HTML); mostrados todos, o "Ver mais" pede mais ao servidor (`mais`), sem sair
 * do lugar na página.
 */
export function ListaDaLinha({
  partes,
  contam,
  fim = null,
  mais = null,
}: {
  partes: ReactNode[];
  contam: boolean[];
  /** o que vem no fim, quando a linha já mostra tudo (o "Exibir mais" do raio) */
  fim?: ReactNode;
  /** o endereço desta linha com mais itens (null: o servidor já mandou todos) */
  mais?: string | null;
}) {
  const router = useRouter();
  const [carregando, carregar] = useTransition();
  const [ate, setAte] = useState(PASSO);
  let itens = 0;
  let corte = partes.length;
  for (let i = 0; i < partes.length; i++) {
    if (!contam[i]) continue;
    itens++;
    if (itens > ate) {
      corte = i;
      break;
    }
  }
  // um separador de dia (ou a marca) sozinho no fim não serve: corta antes dele
  while (corte > 0 && corte < partes.length && !contam[corte - 1]) corte--;
  const mostraTudo = corte >= partes.length;

  function verMais() {
    setAte((n) => n + PASSO);
    // já mostra tudo o que veio: pede os próximos ao servidor (a página fica onde está)
    if (mostraTudo && mais) carregar(() => router.replace(mais, { scroll: false }));
  }

  return (
    <>
      {partes.slice(0, corte)}
      {(!mostraTudo || mais) && (
        <div className="flex justify-center pt-2 sm:pl-[112px]">
          <button
            type="button"
            onClick={verMais}
            disabled={carregando}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-pill border border-line-strong bg-surface-200 px-5 text-label hover:bg-surface-300 disabled:opacity-70"
          >
            {carregando ? "Carregando…" : "Ver mais"}
            <ChevronDown aria-hidden className="size-4" />
          </button>
        </div>
      )}
      {mostraTudo && !mais && fim}
    </>
  );
}
