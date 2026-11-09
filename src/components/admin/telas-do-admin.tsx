"use client";

import { Globe, Laptop } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { marcarTela } from "@/lib/acoes/admin-telas";
import type { Secao } from "@/lib/admin/telas";
import { MensagemErro } from "@/components/ui/campo";

export type GrupoDeTelas = { nome: string; telas: (Secao & { somente: boolean; noSite: boolean; fixa: boolean })[] };

/**
 * A lista das telas do Admin, em grupos, com a marca "Somente publike.org" de cada uma. Ao lado, se a tela já abre no
 * site no ar ou ainda só no computador do dono.
 */
export function TelasDoAdmin({ grupos }: { grupos: GrupoDeTelas[] }) {
  return (
    <div className="flex flex-col gap-6">
      {grupos.map((g) => (
        <section key={g.nome} aria-labelledby={`grupo-${g.nome}`} className="flex flex-col">
          <h3 id={`grupo-${g.nome}`} className="pb-2 text-label font-bold">
            {g.nome}
          </h3>
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface-100">
            {g.telas.map((t) => (
              <Linha key={t.href} tela={t} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Linha({ tela }: { tela: GrupoDeTelas["telas"][number] }) {
  const [somente, setSomente] = useOptimistic(tela.somente);
  const [erro, setErro] = useState<string | null>(null);
  const [mudando, iniciar] = useTransition();
  const id = `tela-${tela.href.replaceAll("/", "-")}`;

  function mudar(valor: boolean) {
    setErro(null);
    iniciar(async () => {
      setSomente(valor);
      const r = await marcarTela(tela.href, valor);
      if (!r.ok) setErro(r.erro);
    });
  }

  return (
    <li className="flex flex-col gap-1 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-[12rem] flex-1">
          <p id={`${id}-tela`} className="text-body font-semibold">
            {tela.nome}
          </p>
          <p className="flex items-center gap-1.5 text-body-sm text-ink-muted">
            {tela.noSite ? (
              <>
                <Globe aria-hidden className="size-3.5 shrink-0" />
                {somente ? "No site: só a equipe publike.org" : "No site: moderador e equipe publike.org"}
              </>
            ) : (
              <>
                <Laptop aria-hidden className="size-3.5 shrink-0" />
                Por enquanto, só no computador do admin
              </>
            )}
          </p>
        </div>
        <span className="flex items-center gap-2.5">
          <span id={id} className="text-label">
            Somente publike.org
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={somente}
            aria-labelledby={id}
            aria-describedby={`${id}-tela`}
            disabled={tela.fixa || mudando}
            onClick={() => mudar(!somente)}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-pill border transition-colors disabled:opacity-50 ${
              somente ? "border-transparent bg-cerrado" : "border-line-strong bg-surface-300"
            }`}
          >
            <span
              aria-hidden
              className={`inline-block size-5 rounded-pill bg-surface-100 shadow-card transition-transform ${
                somente ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </span>
      </div>
      {tela.fixa && <p className="text-body-sm text-ink-muted">Esta lista fica sempre só com a equipe publike.org.</p>}
      {erro && <MensagemErro>{erro}</MensagemErro>}
    </li>
  );
}
