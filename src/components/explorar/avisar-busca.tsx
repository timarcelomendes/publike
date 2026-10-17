"use client";

import { BellOff, BellPlus, BellRing } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { apagarBusca, salvarBusca } from "@/lib/acoes/buscas";
import { useAcao } from "../ui/usar-acao";

const link =
  "inline-flex min-h-9 items-center gap-1 text-body-sm font-semibold text-terra-text underline-offset-2 hover:underline disabled:opacity-60";

/**
 * "Me avise de vagas assim": guarda a busca (palavra, área, contratação, turno e
 * distância) e chega um aviso quando entrar no ar uma vaga nova que bate. Já salva:
 * "Avisando de vagas assim", com "Parar" ao lado.
 */
export function AvisarBusca({
  caminho,
  salvaId,
  logado,
}: {
  caminho: string;
  salvaId: number | null;
  logado: boolean;
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const [id, setId] = useState(salvaId);

  if (!logado) {
    return (
      <Link href={`/entrar?next=${encodeURIComponent(caminho)}`} className={link}>
        <BellPlus aria-hidden className="size-4 shrink-0" />
        Me avise de vagas assim
      </Link>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3">
      {id === null ? (
        <button
          type="button"
          disabled={pendente}
          className={link}
          onClick={() =>
            rodar(
              () => salvarBusca(caminho),
              (r) => {
                if (r.ok && "id" in r && typeof r.id === "number") setId(r.id);
              },
            )
          }
        >
          <BellPlus aria-hidden className="size-4 shrink-0" />
          Me avise de vagas assim
        </button>
      ) : (
        <>
          <span className="inline-flex min-h-9 items-center gap-1 text-body-sm font-semibold text-cerrado-text">
            <BellRing aria-hidden className="size-4 shrink-0" />
            Avisando de vagas assim
          </span>
          <button
            type="button"
            disabled={pendente}
            className="inline-flex min-h-9 items-center gap-1 text-body-sm text-ink-muted underline underline-offset-2 hover:text-ink disabled:opacity-60"
            onClick={() =>
              rodar(
                () => apagarBusca(id),
                (r) => r.ok && setId(null),
              )
            }
          >
            <BellOff aria-hidden className="size-3.5 shrink-0" />
            Parar
          </button>
        </>
      )}
      {mensagem}
    </span>
  );
}

/** Na lista do painel (Seguindo): parar o aviso de uma busca. */
export function PararBusca({ id }: { id: number }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [parada, setParada] = useState(false);
  if (parada) return <span className="text-body-sm text-ink-muted">Aviso parado</span>;
  return (
    <span className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pendente}
        className="inline-flex min-h-9 items-center gap-1 rounded-md border border-line-strong px-3 text-label hover:bg-surface-300 disabled:opacity-60"
        onClick={() =>
          rodar(
            () => apagarBusca(id),
            (r) => r.ok && setParada(true),
          )
        }
      >
        <BellOff aria-hidden className="size-4 shrink-0" />
        Parar de avisar
      </button>
      {mensagem}
    </span>
  );
}
