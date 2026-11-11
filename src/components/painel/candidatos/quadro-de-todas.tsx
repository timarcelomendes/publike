"use client";

import { GripVertical } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useState, useTransition, type DragEvent } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { moverCandidatos } from "@/lib/acoes/recrutamento";
import type { Aderencia } from "@/lib/aderencia";
import { Avatar } from "../../ui/basicos";
import { NotaAderencia } from "../nota-aderencia";

// O Quadro de todas as vagas (nos planos, claude/plano-visoes-dos-candidatos.md): as quatro etapas do caminho em
// colunas, com os candidatos de todas as vagas juntos. Arrastar o cartão (ou escolher em "Mover para", no celular e
// no teclado) muda a etapa como no quadro de cada vaga (moverCandidatos). O quadro de cada vaga continua grátis.

export type ColunaDoQuadro = "novos" | "analise" | "entrevista" | "contratados";

export type CartaoDeTodas = {
  chave: string;
  anuncioId: string;
  perfilId: string;
  nome: string;
  foto: string | null;
  /** duas letras da vaga, com o nome dela no title */
  sigla: string;
  vaga: string;
  onde: string;
  aderencia: Aderencia | null;
  coluna: ColunaDoQuadro;
  estado: string;
  alerta: boolean;
};

const COLUNAS: { valor: ColunaDoQuadro; nome: string; etapa: string }[] = [
  { valor: "novos", nome: "Novos", etapa: "novo" },
  { valor: "analise", nome: "Em análise", etapa: "analise" },
  { valor: "entrevista", nome: "Entrevista", etapa: "entrevista" },
  { valor: "contratados", nome: "Contratados", etapa: "contratado" },
];

export function QuadroDeTodas({ cartoes, fichaBase }: { cartoes: CartaoDeTodas[]; fichaBase: string }) {
  const [lista, mover] = useOptimistic(cartoes, (atual, m: { chave: string; coluna: ColunaDoQuadro }) =>
    atual.map((c) => (c.chave === m.chave ? { ...c, coluna: m.coluna, estado: "Mudando…", alerta: false } : c)),
  );
  const [, iniciar] = useTransition();
  const [sobre, setSobre] = useState<ColunaDoQuadro | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  function moverPara(chave: string, destino: string) {
    const c = lista.find((x) => x.chave === chave);
    const col = COLUNAS.find((x) => x.valor === destino);
    if (!c || (col && c.coluna === col.valor)) return;
    const etapa = col?.etapa ?? "nao_seguiu";
    setAviso(null);
    iniciar(async () => {
      if (col) mover({ chave, coluna: col.valor });
      const r = await chamarAcao(() => moverCandidatos(c.anuncioId, [c.perfilId], etapa));
      if (!r.ok) setAviso({ ok: false, texto: r.erro });
      else {
        const falhas = r.falhas.map((f) => `${c.nome.split(" ")[0]}: ${f.erro} Abra a ficha da pessoa para ver o que falta.`);
        setAviso({ ok: !falhas.length, texto: [r.mensagem, ...falhas].filter(Boolean).join(" ") });
      }
    });
  }

  function soltar(e: DragEvent, coluna: ColunaDoQuadro) {
    e.preventDefault();
    setSobre(null);
    const chave = e.dataTransfer.getData("text/plain");
    if (chave) moverPara(chave, coluna);
  }

  return (
    <div className="flex flex-col gap-3">
      {aviso && (
        <p role="status" className={`text-body-sm ${aviso.ok ? "text-cerrado-text" : "text-danger"}`}>
          {aviso.texto}
        </p>
      )}
      <div className="sem-barra -mx-4 snap-x snap-mandatory overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">
        <div className="grid min-w-[60rem] grid-cols-4 gap-3">
          {COLUNAS.map((col) => {
            const daColuna = lista.filter((c) => c.coluna === col.valor);
            const esperam = daColuna.filter((c) => c.alerta).length;
            return (
              <section
                key={col.valor}
                aria-label={col.nome}
                onDragOver={(e) => {
                  e.preventDefault();
                  setSobre(col.valor);
                }}
                onDragLeave={() => setSobre((s) => (s === col.valor ? null : s))}
                onDrop={(e) => soltar(e, col.valor)}
                className={`flex snap-start flex-col gap-2 rounded-lg p-2.5 transition-colors ${
                  sobre === col.valor ? "bg-terra-soft ring-2 ring-terra" : "bg-surface-300"
                }`}
              >
                <h3 className="flex items-center gap-2 px-1.5 py-0.5 font-display text-body-lg font-bold">
                  {col.nome}
                  <span
                    className={`inline-flex min-w-6 items-center justify-center rounded-pill px-1.5 text-caption font-bold ${
                      col.valor === "novos" && esperam ? "bg-terra-soft text-terra-text" : "bg-surface-100 text-ink"
                    }`}
                  >
                    {daColuna.length}
                  </span>
                  {esperam > 0 && (
                    <span className="ml-auto text-caption font-normal text-ink-muted">
                      {col.valor === "novos" ? `${esperam} esperam você` : `${esperam} pedem você`}
                    </span>
                  )}
                </h3>
                {daColuna.length === 0 && (
                  <p className="px-1.5 py-3 text-body-sm text-ink-muted">Ninguém aqui. Arraste um cartão para cá.</p>
                )}
                {daColuna.map((c) => (
                  <Cartao key={c.chave} c={c} href={`${fichaBase}${encodeURIComponent(c.chave)}`} aoMover={moverPara} />
                ))}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Cartao({ c, href, aoMover }: { c: CartaoDeTodas; href: string; aoMover: (chave: string, destino: string) => void }) {
  return (
    <article
      draggable
      onDragStart={(ev) => {
        ev.dataTransfer.setData("text/plain", c.chave);
        ev.dataTransfer.effectAllowed = "move";
      }}
      className="flex flex-col gap-2 rounded-md border border-line bg-surface-200 p-2.5 shadow-card"
    >
      <div className="flex items-start gap-2">
        <GripVertical aria-hidden className="mt-1 hidden size-4 shrink-0 cursor-grab text-ink-muted sm:block" />
        <Avatar nome={c.nome} foto={c.foto} tamanho={32} />
        <div className="min-w-0 flex-1">
          <Link href={href} className="line-clamp-2 text-label break-words text-ink underline-offset-2 hover:underline">
            {c.nome}
          </Link>
          {c.onde && <span className="block truncate text-caption text-ink-muted">{c.onde}</span>}
        </div>
        {c.aderencia && <NotaAderencia a={c.aderencia} />}
      </div>
      <div className="flex items-center gap-1.5 sm:pl-6">
        <span
          title={c.vaga}
          className="shrink-0 rounded-sm bg-surface-300 px-1 text-[11px] leading-[18px] font-bold text-ink"
        >
          {c.sigla}
        </span>
        <span className={`min-w-0 flex-1 text-body-sm ${c.alerta ? "font-semibold text-terra-text" : "text-ink-muted"}`}>
          {c.estado}
        </span>
      </div>
      <select
        aria-label={`Mover ${c.nome} para`}
        value=""
        onChange={(e) => e.target.value && aoMover(c.chave, e.target.value)}
        className="min-h-9 w-full rounded-pill border border-line bg-transparent px-3 text-body-sm text-ink-muted hover:bg-surface-300"
      >
        <option value="">Mover para…</option>
        {COLUNAS.filter((x) => x.valor !== c.coluna).map((x) => (
          <option key={x.valor} value={x.valor}>
            {x.nome}
          </option>
        ))}
        <option value="nao_seguiu">Não seguiu</option>
      </select>
    </article>
  );
}
