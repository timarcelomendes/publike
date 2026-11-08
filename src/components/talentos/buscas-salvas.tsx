"use client";

import { Bell, BellOff, Bookmark, Trash2 } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { apagarBuscaDeTalentos, avisoDaBuscaDeTalentos, salvarBuscaDeTalentos } from "@/lib/acoes/buscas-talentos";
import type { BuscaSalva } from "@/lib/servidor/buscas-talentos";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

// Buscas salvas de Talentos (migração 20270308120000): "Salvar esta busca" (com o aviso da semana, se quiser) e a
// lista das salvas, para abrir de novo, ligar ou desligar o aviso e apagar.

function hrefDaBusca(b: { texto: string | null; cidade: string | null }) {
  const q = new URLSearchParams({ ver: "todos" });
  if (b.texto) q.set("q", b.texto);
  if (b.cidade) q.set("cidade", b.cidade);
  return `/talentos?${q.toString()}`;
}

export function BuscasSalvas({
  buscas,
  atual,
}: {
  buscas: BuscaSalva[];
  /** a busca aberta agora (o texto e a cidade); sem nada, não há o que salvar */
  atual: { texto: string; cidade: string | null };
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const [salvando, setSalvando] = useState(false);
  const [nome, setNome] = useState(atual.texto || atual.cidade || "");
  const [avisar, setAvisar] = useState(true);
  const id = useId();
  const temAtual = Boolean(atual.texto || atual.cidade);
  const jaSalva = buscas.some((b) => (b.texto ?? "") === atual.texto && (b.cidade ?? null) === atual.cidade);
  if (!buscas.length && !temAtual) return null;
  return (
    <div className="mt-3 flex flex-col gap-2">
      {buscas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body-sm text-ink-muted">Buscas salvas:</span>
          {buscas.map((b) => (
            <span
              key={b.id}
              className="inline-flex items-center gap-1 rounded-pill border border-line-strong bg-surface-200 py-0.5 pr-1 pl-3"
            >
              <Link href={hrefDaBusca(b)} className="text-label hover:underline">
                {b.nome}
              </Link>
              <button
                type="button"
                disabled={pendente}
                onClick={() => rodar(() => avisoDaBuscaDeTalentos(b.id, !b.avisar))}
                aria-label={b.avisar ? `Desligar o aviso da semana de ${b.nome}` : `Ligar o aviso da semana de ${b.nome}`}
                title={b.avisar ? "Aviso da semana ligado" : "Sem aviso"}
                className="inline-flex size-8 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink"
              >
                {b.avisar ? <Bell aria-hidden className="size-4 text-terra-text" /> : <BellOff aria-hidden className="size-4" />}
              </button>
              <button
                type="button"
                disabled={pendente}
                onClick={() => rodar(() => apagarBuscaDeTalentos(b.id))}
                aria-label={`Apagar a busca ${b.nome}`}
                title="Apagar"
                className="inline-flex size-8 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink"
              >
                <Trash2 aria-hidden className="size-4" />
              </button>
            </span>
          ))}
        </div>
      )}
      {temAtual && !jaSalva && !salvando && (
        <button
          type="button"
          onClick={() => setSalvando(true)}
          className="inline-flex min-h-10 items-center gap-1.5 self-start text-label underline underline-offset-2"
        >
          <Bookmark aria-hidden className="size-4" />
          Salvar esta busca
        </button>
      )}
      {salvando && (
        <div className="flex flex-wrap items-end gap-3 rounded-md border border-line bg-surface-200 p-3">
          <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
            <label htmlFor={`${id}-nome`} className="text-body-sm text-ink-muted">
              Nome da busca
            </label>
            <input
              id={`${id}-nome`}
              value={nome}
              maxLength={60}
              onChange={(e) => setNome(e.target.value)}
              className={classesEntrada}
            />
          </div>
          <label className="inline-flex min-h-11 items-center gap-2 text-body-sm">
            <input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} className="size-4" />
            Avisar toda semana quando chegar talento novo
          </label>
          <Botao
            tamanho="sm"
            variante="primario"
            disabled={pendente || nome.trim().length < 2}
            onClick={() =>
              rodar(
                () => salvarBuscaDeTalentos(nome, atual.texto || null, atual.cidade, avisar),
                (r) => r.ok && setSalvando(false),
              )
            }
          >
            Salvar
          </Botao>
          <Botao tamanho="sm" variante="fantasma" onClick={() => setSalvando(false)}>
            Agora não
          </Botao>
        </div>
      )}
      {mensagem}
    </div>
  );
}
