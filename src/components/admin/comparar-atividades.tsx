"use client";

import { useState, useTransition } from "react";
import { compararUmPar, paresParaComparar, type RespostaDoModelo } from "@/lib/acoes/admin-qualificados";
import type { ParDasAtividades } from "@/lib/servidor/atividades-da-vaga";
import { Aviso } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";

// Admin › Qualificados: a comparação Haiku x Sonnet das atividades da vaga (22/11/2026; Marcelo escolheu o Haiku, com a
// comparação antes de ligar). Os dois modelos leem os mesmos pares (a vaga e o que a pessoa fazia na mesma função) e a
// tela mostra lado a lado, com a borda laranja onde discordam. Se discordarem em mais de 15% dos pares, vale o Sonnet.

type Modelo = { id: string; nome: string };
type Linha = { par: ParDasAtividades; resultados: Record<string, RespostaDoModelo> | null; erro?: string };

const NOME = { sim: "mesmas atividades", parte: "em parte", nao: "outras atividades", sem: "não deu para comparar" } as const;

const resposta = (r: RespostaDoModelo | undefined) => (r?.ok ? r.resultado : null);

export function CompararAtividades({ modelos }: { modelos: Modelo[] }) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [rodando, iniciar] = useTransition();
  const [so, setSo] = useState<"todas" | "diferentes">("todas");
  const [a, b] = modelos;

  const comecar = () =>
    iniciar(async () => {
      setErro(null);
      const r = await paresParaComparar();
      if (!r.ok) return setErro(r.erro);
      if (!r.pares.length) return setErro("Nenhum par para comparar: ninguém com trabalho na mesma função de uma vaga no ar.");
      const base: Linha[] = r.pares.map((par) => ({ par, resultados: null }));
      setLinhas(base);
      for (let i = 0; i < base.length; i += 3) {
        await Promise.all(
          base.slice(i, i + 3).map(async (l, j) => {
            const x = await compararUmPar(l.par);
            setLinhas((atual) =>
              atual.map((y, k) => (k === i + j ? { ...y, resultados: x.ok ? x.resultados : {}, erro: x.ok ? undefined : x.erro } : y)),
            );
          }),
        );
      }
    });

  const prontas = linhas.filter((l) => l.resultados && !l.erro);
  const discorda = (l: Linha) => {
    const ra = resposta(l.resultados?.[a.id]);
    const rb = resposta(l.resultados?.[b.id]);
    return ra !== null && rb !== null && ra !== rb;
  };
  const comparadas = prontas.filter((l) => resposta(l.resultados?.[a.id]) && resposta(l.resultados?.[b.id])).length;
  const diferentes = prontas.filter(discorda).length;
  const gasto = (id: string) => prontas.reduce((s, l) => s + (l.resultados?.[id]?.ok ? (l.resultados[id] as { custo: number }).custo : 0), 0);
  const visiveis = linhas.filter((l) => so === "todas" || discorda(l));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Botao type="button" variante="primario" onClick={comecar} disabled={rodando}>
          {rodando ? `Comparando… ${prontas.length} de ${linhas.length || 30}` : linhas.length ? "Comparar de novo" : "Comparar 30 pares"}
        </Botao>
        <span className="text-body-sm text-ink-muted">
          Até 30 pares de vagas diferentes, primeiro quem se candidatou. Sem nome, foto, bairro nem contato. Custa centavos.
        </span>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {prontas.length > 0 && (
        <div className="grid gap-3 rounded-md border border-line p-4 text-body-sm sm:grid-cols-2">
          <p>
            <span className="block text-caption text-ink-muted">Discordam</span>
            <span className="text-h3 tabular-nums">{diferentes}</span> de {comparadas}
            {comparadas > 0 && ` (${Math.round((100 * diferentes) / comparadas)}%)`}
          </p>
          <p className="text-ink-muted">
            {comparadas > 0 && diferentes / comparadas > 0.15
              ? `Discordam em mais de 15%: vale ligar com o ${b.nome}.`
              : comparadas > 0
                ? `Discordam em até 15%: o ${a.nome} dá conta.`
                : null}
          </p>
          {[a, b].map((m) => (
            <p key={m.id} className="text-ink-muted">
              {m.nome}: gasto US$ {gasto(m.id).toFixed(3)}
            </p>
          ))}
        </div>
      )}

      {linhas.length > 0 && (
        <div className="flex gap-2 text-body-sm">
          {(["todas", "diferentes"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setSo(v)}
              aria-pressed={so === v}
              className={`rounded-pill px-3 py-1 ${so === v ? "bg-ink text-surface-100" : "bg-surface-300"}`}
            >
              {v === "todas" ? "Todos" : "Só onde discordam"}
            </button>
          ))}
        </div>
      )}

      <ol className="flex flex-col gap-3">
        {visiveis.map((l) => (
          <li
            key={`${l.par.vaga.id}:${l.par.perfil_id}`}
            className={`rounded-md border p-4 ${discorda(l) ? "border-terra" : "border-line"}`}
          >
            <p className="text-label">
              {l.par.vaga.titulo}
              {l.par.candidato && <span className="text-caption text-ink-muted"> · candidato</span>}
            </p>
            <p className="line-clamp-2 text-body-sm text-ink-muted">{l.par.vaga.descricao}</p>
            <ul className="mt-2 flex flex-col gap-1 text-body-sm">
              {l.par.trabalhos.map((t, i) => (
                <li key={i}>
                  <span className="text-label">{t.cargo}</span>
                  <span className="text-ink-muted"> · {t.descricao || "(não escreveu o que fazia)"}</span>
                </li>
              ))}
            </ul>
            {!l.resultados ? (
              <p className="mt-2 text-body-sm text-ink-muted">Comparando…</p>
            ) : l.erro ? (
              <p className="mt-2 text-body-sm text-terra-text">{l.erro}</p>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {[a, b].map((m) => {
                  const x = l.resultados?.[m.id];
                  return (
                    <div key={m.id} className="rounded-md bg-surface-200 p-3 text-body-sm">
                      <p className="text-caption text-ink-muted">
                        {m.nome}
                        {x?.ok && ` · ${(x.ms / 1000).toFixed(1)} s`}
                        {x?.ok && x.modelo !== m.id && x.resultado !== "sem" && ` · respondeu ${x.modelo}`}
                      </p>
                      {!x ? (
                        "—"
                      ) : !x.ok ? (
                        <p className="text-terra-text">{x.erro}</p>
                      ) : (
                        <>
                          <p className={`mt-1 ${discorda(l) ? "font-semibold text-terra-text" : ""}`}>{NOME[x.resultado]}</p>
                          {x.trecho && <p className="mt-1 text-ink-muted">“{x.trecho}”</p>}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
