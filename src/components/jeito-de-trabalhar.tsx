"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { salvarMeuJeito } from "@/lib/acoes/jeito-de-trabalhar";
import { ITENS_DO_JEITO, type EscolhaDoJeito, type ItemDoJeito } from "@/lib/jeito-de-trabalhar";
import { Selo } from "./ui/basicos";
import { Botao } from "./ui/botao";
import { useAcao } from "./ui/usar-acao";

/**
 * "Seu jeito de trabalhar", embaixo do currículo (migração 20270309120000): para cada item, "Gosto/Topo", "Prefiro não"
 * ou nada. Não é teste: não tem certo nem errado. As empresas veem no currículo e no match, como sinal.
 */
export function JeitoDeTrabalhar({ inicial }: { inicial: EscolhaDoJeito[] }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [escolhas, setEscolhas] = useState(
    () => new Map(inicial.map((e) => e.split(":") as [ItemDoJeito, "sim" | "nao"])),
  );
  const [mudou, setMudou] = useState(false);
  function escolher(id: ItemDoJeito, v: "sim" | "nao") {
    setEscolhas((atual) => {
      const novo = new Map(atual);
      if (novo.get(id) === v) novo.delete(id);
      else novo.set(id, v);
      return novo;
    });
    setMudou(true);
  }
  return (
    <section
      aria-labelledby="jeito-titulo"
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5"
    >
      <div>
        <h2 id="jeito-titulo" className="flex flex-wrap items-center gap-2 text-h3">
          Seu jeito de trabalhar
          <Selo variante="novo">Novo</Selo>
        </h2>
        <p className="mt-1 text-body-sm text-ink-muted">
          Opcional. Não é teste: não tem certo nem errado. Conte do que você gosta e o que prefere evitar, e as empresas
          veem junto do currículo. Toque de novo para desmarcar.
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {ITENS_DO_JEITO.map((item) => {
          const v = escolhas.get(item.id);
          return (
            <li key={item.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-body-sm text-ink-muted">{item.vaga}</span>
              <div role="group" aria-label={item.vaga} className="flex flex-wrap gap-2">
                {(["sim", "nao"] as const).map((op) => (
                  <button
                    key={op}
                    type="button"
                    aria-pressed={v === op}
                    onClick={() => escolher(item.id, op)}
                    className={`inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3 text-body-sm transition-colors ${
                      v === op
                        ? "border-ink bg-ink text-surface-100"
                        : "border-line-strong bg-surface-200 text-ink hover:bg-surface-300"
                    }`}
                  >
                    {v === op && <Check aria-hidden className="size-4" />}
                    {op === "sim" ? item.sim : item.nao}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Botao
          variante="primario"
          tamanho="sm"
          disabled={pendente || !mudou}
          onClick={() =>
            rodar(
              () => salvarMeuJeito([...escolhas].map(([id, v]) => `${id}:${v}` as EscolhaDoJeito)),
              (r) => r.ok && setMudou(false),
            )
          }
        >
          {pendente ? "Salvando…" : "Salvar meu jeito"}
        </Botao>
        {mensagem}
      </div>
    </section>
  );
}
