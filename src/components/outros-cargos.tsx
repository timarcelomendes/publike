"use client";

import { Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { Selo } from "./ui/basicos";
import { classesEntrada } from "./ui/campo";

/** Quantos cargos a mais numa publicação (o banco ainda confere o limite de vagas por dia). */
export const MAX_OUTROS_CARGOS = 9;

/**
 * "Publicar também para outros cargos com as mesmas condições" (passo 5 do publicar): a empresa que contrata
 * vários cargos de uma vez (o caso do Atacadão) escreve só o nome de cada um. Cada cargo vira uma vaga com o
 * mesmo pagamento, horário, local e o resto; a descrição o Publike escreve pelo título. Vai no envio como
 * `outros_cargos` (um por campo).
 */
export function OutrosCargos() {
  const id = useId();
  const [cargos, setCargos] = useState<string[]>([]);
  const mudar = (i: number, v: string) => setCargos((l) => l.map((c, k) => (k === i ? v : c)));
  return (
    <fieldset className="flex flex-col gap-3 rounded-md border border-line bg-surface-200 p-4">
      <legend className="sr-only">Outros cargos</legend>
      <div>
        <p className="flex flex-wrap items-center gap-2 text-label">
          Publicar também para outros cargos com as mesmas condições
          <Selo variante="novo">Novo</Selo>
        </p>
        <p className="mt-0.5 text-body-sm text-ink-muted">
          Cada cargo vira uma vaga com o mesmo pagamento, horário e local. A descrição de cada uma o Publike escreve
          pelo nome do cargo; depois dá para editar em Vagas.
        </p>
      </div>
      {cargos.length > 0 && (
        <ul className="flex flex-col gap-2">
          {cargos.map((c, i) => (
            <li key={i} className="flex items-center gap-2">
              <label htmlFor={`${id}-${i}`} className="sr-only">
                Cargo {i + 2}
              </label>
              <input
                id={`${id}-${i}`}
                name="outros_cargos"
                value={c}
                onChange={(e) => mudar(i, e.target.value)}
                maxLength={90}
                placeholder="Ex.: Auxiliar de cozinha"
                className={classesEntrada}
              />
              <button
                type="button"
                onClick={() => setCargos((l) => l.filter((_, k) => k !== i))}
                aria-label={`Tirar o cargo ${c || i + 2}`}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-300 hover:text-ink"
              >
                <Trash2 aria-hidden className="size-5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {cargos.length < MAX_OUTROS_CARGOS && (
        <button
          type="button"
          onClick={() => setCargos((l) => [...l, ""])}
          className="inline-flex min-h-10 items-center gap-1.5 self-start rounded-md border border-line-strong px-3.5 text-label hover:bg-surface-300"
        >
          <Plus aria-hidden className="size-4" />
          {cargos.length ? "Mais um cargo" : "Adicionar outro cargo"}
        </button>
      )}
    </fieldset>
  );
}
