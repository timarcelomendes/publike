"use client";

import { Pencil, Trash2 } from "lucide-react";
import { faltaData, mesesDoPeriodo, textoDoPeriodo } from "@/lib/experiencia";
import { Botao } from "../ui/botao";

type ExperienciaDoForm = {
  cargo: string;
  onde: string;
  unidade?: string;
  inicio: string;
  fim: string;
  atual: boolean;
  descricao: string;
};

/** "2 anos e 9 meses", "8 meses" (sem as datas, nada). */
function quantoTempo(meses: number | null) {
  if (!meses) return null;
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  return [
    anos ? `${anos} ${anos === 1 ? "ano" : "anos"}` : "",
    resto ? `${resto} ${resto === 1 ? "mês" : "meses"}` : "",
  ]
    .filter(Boolean)
    .join(" e ");
}

/**
 * Uma experiência do currículo numa linha, como no currículo de papel: o cargo, onde, o período com o tempo que
 * ficou e o começo do que fazia, com Editar e Tirar. Sem as datas, o convite para pôr (as datas são opcionais).
 */
export function LinhaDaExperiencia({
  x,
  hoje,
  nome,
  idEditar,
  aoEditar,
  aoTirar,
}: {
  x: ExperienciaDoForm;
  /** "2026-11", do servidor: o trabalho atual conta até aqui */
  hoje: string;
  /** como chamar a experiência nos botões ("Auxiliar de cozinha") */
  nome: string;
  /** o id do Editar (o foco volta para ele quando a experiência fecha) */
  idEditar: string;
  aoEditar: (campo: "cargo" | "inicio-mes") => void;
  aoTirar: () => void;
}) {
  const periodo = { inicio: x.inicio, fim: x.atual ? null : x.fim || null, atual: x.atual };
  const texto = textoDoPeriodo(periodo);
  const tempo = quantoTempo(mesesDoPeriodo(periodo, hoje));
  const semDatas = faltaData(periodo);
  const onde = [x.onde.trim(), x.onde.trim() ? x.unidade?.trim() : ""].filter(Boolean).join(", ");
  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-100 p-4 sm:flex-row sm:items-start sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-label break-words">{x.cargo.trim()}</p>
        {onde && <p className="text-body-sm break-words text-ink-muted">{onde}</p>}
        {(texto || semDatas) && (
          <p className="mt-0.5 text-body-sm">
            {texto && (
              <span>
                {texto}
                {tempo && !semDatas && <span className="text-ink-muted"> ({tempo})</span>}
              </span>
            )}
            {semDatas && (
              <>
                {texto && <span className="text-ink-muted"> · </span>}
                <button
                  type="button"
                  onClick={() => aoEditar("inicio-mes")}
                  className="font-semibold underline underline-offset-2 hover:text-terra-text"
                >
                  {texto ? "Completar as datas" : "Pôr as datas"}
                </button>
              </>
            )}
          </p>
        )}
        {x.descricao.trim() && <p className="mt-1 line-clamp-2 text-body-sm text-ink-muted">{x.descricao.trim()}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        <Botao id={idEditar} tamanho="sm" onClick={() => aoEditar("cargo")} aria-label={`Editar ${nome}`}>
          <Pencil aria-hidden />
          Editar
        </Botao>
        <Botao tamanho="sm" variante="fantasma" onClick={aoTirar} aria-label={`Tirar ${nome}`}>
          <Trash2 aria-hidden />
          Tirar
        </Botao>
      </div>
    </div>
  );
}
