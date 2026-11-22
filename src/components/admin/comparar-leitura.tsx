"use client";

import { useState, useTransition } from "react";
import {
  compararUmCurriculo,
  curriculosParaComparar,
  type CurriculoDaComparacao,
  type ResultadoDoModelo,
} from "@/lib/acoes/admin-qualificados";
import { Aviso } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";

// Admin › Qualificados: a comparação Sonnet x Opus nos mesmos currículos de Talentos (21/11/2026; Marcelo:
// "Combinado" a testar os dois antes de ligar). Lê um currículo por vez com os dois modelos e mostra lado a lado,
// com as diferenças marcadas: as funções, o nível (pronto ou com treinamento) e a nota (15 pontos ou mais).

type Modelo = { id: string; nome: string; preco: { entrada: number; saida: number } };
type Linha = { cv: CurriculoDaComparacao; resultados: Record<string, ResultadoDoModelo> | null; erro?: string };

const NIVEL = { pronto: "pronto", treinamento: "com treinamento" } as const;

function resumoDoCurriculo(cv: CurriculoDaComparacao) {
  const exps = (Array.isArray(cv.experiencias) ? cv.experiencias : []) as { cargo?: string; descricao?: string }[];
  return {
    titulo: cv.titulo || "(sem título)",
    cargos: exps.map((e) => e.cargo).filter(Boolean).join(" · ") || "sem experiência",
    escreveu: exps.some((e) => (e.descricao ?? "").trim().length > 20),
  };
}

function diferencas(a: ResultadoDoModelo | undefined, b: ResultadoDoModelo | undefined) {
  if (!a?.ok || !b?.ok) return null;
  const fa = new Map(a.leitura.funcoes.map((f) => [f.cbo, f.nivel]));
  const fb = new Map(b.leitura.funcoes.map((f) => [f.cbo, f.nivel]));
  const funcoes = [...fa.keys()].some((k) => !fb.has(k)) || [...fb.keys()].some((k) => !fa.has(k));
  const nivel = [...fa].some(([k, n]) => fb.has(k) && fb.get(k) !== n);
  const nota = Math.abs(a.leitura.nota - b.leitura.nota) >= 15;
  return { funcoes, nivel, nota, alguma: funcoes || nivel || nota };
}

function custo(r: ResultadoDoModelo | undefined, modelos: Modelo[]) {
  if (!r?.ok || !r.leitura.tokens) return 0;
  const m = modelos.find((x) => x.id === r.leitura.modelo);
  return m ? (r.leitura.tokens.entrada * m.preco.entrada + r.leitura.tokens.saida * m.preco.saida) / 1_000_000 : 0;
}

export function CompararLeitura({ modelos }: { modelos: Modelo[] }) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [rodando, iniciar] = useTransition();
  const [so, setSo] = useState<"todas" | "diferentes">("todas");
  const [a, b] = modelos;

  const comecar = () =>
    iniciar(async () => {
      setErro(null);
      const r = await curriculosParaComparar();
      if (!r.ok) return setErro(r.erro);
      const base: Linha[] = r.curriculos.map((cv) => ({ cv, resultados: null }));
      setLinhas(base);
      // dois currículos por vez (cada um com os dois modelos ao mesmo tempo)
      for (let i = 0; i < base.length; i += 2) {
        await Promise.all(
          base.slice(i, i + 2).map(async (l, j) => {
            const x = await compararUmCurriculo(l.cv);
            setLinhas((atual) =>
              atual.map((y, k) =>
                k === i + j ? { ...y, resultados: x.ok ? x.resultados : {}, erro: x.ok ? undefined : x.erro } : y,
              ),
            );
          }),
        );
      }
    });

  const prontas = linhas.filter((l) => l.resultados);
  const difs = prontas.map((l) => diferencas(l.resultados?.[a.id], l.resultados?.[b.id]));
  const comparadas = difs.filter(Boolean).length;
  const conta = (k: "funcoes" | "nivel" | "nota") => difs.filter((d) => d?.[k]).length;
  const media = (id: string) => {
    const notas = prontas.map((l) => l.resultados?.[id]).filter((r) => r?.ok).map((r) => (r as Extract<ResultadoDoModelo, { ok: true }>).leitura.nota);
    return notas.length ? Math.round(notas.reduce((s, n) => s + n, 0) / notas.length) : null;
  };
  const gasto = (id: string) => prontas.reduce((s, l) => s + custo(l.resultados?.[id], modelos), 0);
  const visiveis = linhas.filter((l) => so === "todas" || (l.resultados && diferencas(l.resultados[a.id], l.resultados[b.id])?.alguma));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Botao type="button" variante="primario" onClick={comecar} disabled={rodando}>
          {rodando ? `Lendo… ${prontas.length} de ${linhas.length || 30}` : linhas.length ? "Comparar de novo" : "Comparar 30 currículos"}
        </Botao>
        <span className="text-body-sm text-ink-muted">
          Os 30 currículos de Talentos mais recentes, sem nome, foto, bairro nem contato. Custa menos de US$ 1.
        </span>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {prontas.length > 0 && (
        <div className="grid gap-3 rounded-md border border-line p-4 text-body-sm sm:grid-cols-3">
          <p>
            <span className="block text-caption text-ink-muted">Discordam nas funções</span>
            <span className="text-h3 tabular-nums">{conta("funcoes")}</span> de {comparadas}
          </p>
          <p>
            <span className="block text-caption text-ink-muted">Discordam no nível (mesma função)</span>
            <span className="text-h3 tabular-nums">{conta("nivel")}</span> de {comparadas}
          </p>
          <p>
            <span className="block text-caption text-ink-muted">Nota com 15 pontos ou mais de diferença</span>
            <span className="text-h3 tabular-nums">{conta("nota")}</span> de {comparadas}
          </p>
          {[a, b].map((m) => (
            <p key={m.id} className="sm:col-span-3 text-ink-muted">
              {m.nome}: nota média {media(m.id) ?? "—"} · gasto US$ {gasto(m.id).toFixed(3)}
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
              {v === "todas" ? "Todas" : "Só onde discordam"}
            </button>
          ))}
        </div>
      )}

      <ol className="flex flex-col gap-3">
        {visiveis.map((l) => {
          const r = resumoDoCurriculo(l.cv);
          const d = l.resultados ? diferencas(l.resultados[a.id], l.resultados[b.id]) : null;
          return (
            <li key={l.cv.perfil_id} className={`rounded-md border p-4 ${d?.alguma ? "border-terra" : "border-line"}`}>
              <p className="text-label">{r.titulo}</p>
              <p className="text-body-sm text-ink-muted">
                {r.cargos}
                {!r.escreveu && " · não escreveu o que fazia"}
              </p>
              {!l.resultados ? (
                <p className="mt-2 text-body-sm text-ink-muted">Lendo…</p>
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
                          {x?.ok && x.leitura.modelo !== m.id && ` · respondeu ${x.leitura.modelo}`}
                        </p>
                        {!x ? (
                          "—"
                        ) : !x.ok ? (
                          <p className="text-terra-text">{x.erro}</p>
                        ) : (
                          <>
                            <p className={`mt-1 ${d?.nota ? "font-semibold text-terra-text" : ""}`}>Nota {x.leitura.nota}</p>
                            {x.leitura.funcoes.length ? (
                              <ul className="mt-1 flex flex-col gap-1">
                                {x.leitura.funcoes.map((f) => (
                                  <li key={f.cbo}>
                                    <span className={d?.funcoes || d?.nivel ? "font-semibold" : ""}>
                                      {f.nome} ({NIVEL[f.nivel]})
                                    </span>
                                    <span className="block text-ink-muted">{f.porque}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="mt-1 text-ink-muted">Nenhuma função indicada.</p>
                            )}
                            {x.leitura.melhorar.length > 0 && (
                              <ul className="mt-2 list-disc pl-4 text-ink-muted">
                                {x.leitura.melhorar.map((t) => (
                                  <li key={t}>{t}</li>
                                ))}
                              </ul>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
