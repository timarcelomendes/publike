"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatarMoeda, formatarNumero, plural } from "@/lib/formato";
import { numerosDoCliente, type Cliente } from "./impulsos-correndo";

// Admin › Impulsos › Visão global (13/11/2026, Marcelo: "uma aba visão global com x/y por cliente"): uma linha por
// cliente com impulso correndo, para comparar: o gasto contra a verba (x/y, com a barra), as vagas no ar de quantas, as
// vistas, os cliques (e a % das vistas), o custo do clique e as curtidas. Ordena por qualquer coluna; o total no fim.

const reais = (v: number) => formatarMoeda(Math.round(v * 100) / 100);
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

type Linha = ReturnType<typeof numerosDoCliente> & { c: Cliente; porClique: number | null; porCurtida: number | null };

const COLUNAS = [
  { chave: "nome", nome: "Cliente", valor: (l: Linha) => l.c.nome.toLowerCase() },
  { chave: "gasto", nome: "Gasto / verba", valor: (l: Linha) => l.parte },
  { chave: "vagas", nome: "No ar / vagas", valor: (l: Linha) => l.noAr },
  { chave: "vistas", nome: "Vistas", valor: (l: Linha) => l.soma.impressoes },
  { chave: "cliques", nome: "Cliques", valor: (l: Linha) => l.soma.cliques },
  { chave: "taxa", nome: "Cliques / vistas", valor: (l: Linha) => l.taxa ?? -1 },
  { chave: "clique", nome: "Por clique", valor: (l: Linha) => l.porClique ?? Infinity },
  { chave: "curtidas", nome: "Curtidas", valor: (l: Linha) => l.soma.curtidas },
] as const;
type Chave = (typeof COLUNAS)[number]["chave"];

export function VisaoGlobal({ clientes }: { clientes: Cliente[] }) {
  const [ordem, setOrdem] = useState<{ chave: Chave; desc: boolean }>({ chave: "gasto", desc: true });

  const linhas = useMemo(() => {
    const ls: Linha[] = clientes.map((c) => {
      const n = numerosDoCliente(c);
      return {
        ...n,
        c,
        porClique: n.soma.cliques > 0 ? n.soma.gasto / n.soma.cliques : null,
        porCurtida: n.soma.curtidas > 0 ? n.soma.gasto / n.soma.curtidas : null,
      };
    });
    const col = COLUNAS.find((x) => x.chave === ordem.chave)!;
    return ls.sort((a, b) => {
      const va = col.valor(a);
      const vb = col.valor(b);
      const r = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return ordem.desc ? -r : r;
    });
  }, [clientes, ordem]);

  const total = linhas.reduce(
    (t, l) => ({
      gasto: t.gasto + l.soma.gasto,
      verba: t.verba + l.verba,
      noAr: t.noAr + l.noAr,
      vagas: t.vagas + l.vagas,
      vistas: t.vistas + l.soma.impressoes,
      cliques: t.cliques + l.soma.cliques,
      curtidas: t.curtidas + l.soma.curtidas,
    }),
    { gasto: 0, verba: 0, noAr: 0, vagas: 0, vistas: 0, cliques: 0, curtidas: 0 },
  );

  if (linhas.length === 0) {
    return <p className="text-body-sm text-ink-muted">Nenhum cliente com impulso correndo agora.</p>;
  }

  const mudar = (chave: Chave) =>
    setOrdem((o) => (o.chave === chave ? { chave, desc: !o.desc } : { chave, desc: chave !== "nome" && chave !== "clique" }));

  return (
    <div className="-mx-5 overflow-x-auto sm:-mx-6">
      <table className="w-full min-w-[56rem] text-left text-body-sm">
        <thead className="text-ink-muted">
          <tr className="border-b border-line">
            {COLUNAS.map((col, i) => {
              const atual = ordem.chave === col.chave;
              return (
                <th
                  key={col.chave}
                  scope="col"
                  aria-sort={atual ? (ordem.desc ? "descending" : "ascending") : undefined}
                  className={`whitespace-nowrap py-2 font-normal ${i === 0 ? "px-5 sm:pl-6" : "px-3"} ${i >= 3 ? "text-right" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => mudar(col.chave)}
                    className={`inline-flex items-center gap-1 hover:text-ink ${atual ? "text-ink" : ""}`}
                  >
                    {col.nome}
                    <span aria-hidden className="w-3 text-caption">
                      {atual ? (ordem.desc ? "↓" : "↑") : ""}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.c.conta_id} className="border-b border-line align-middle">
              <td className="min-w-48 px-5 py-3 sm:pl-6">
                <Link href={`/perfil/${l.c.conta_id}/vagas`} className="text-label hover:underline">
                  {l.c.nome}
                </Link>
                <span className="block text-caption text-ink-muted">
                  {l.c.campanha ? "Campanha do cliente" : plural(l.vagas, "vaga sozinha", "vagas sozinhas")}
                  {l.c.problema && <span className="text-danger"> · com erro</span>}
                </span>
              </td>
              <td className="min-w-52 px-3 py-3">
                <span className="tabular-nums">
                  <span className="text-label">{reais(l.soma.gasto)}</span>
                  <span className="text-ink-muted"> / {reais(l.verba)}</span>
                </span>
                <span className="mt-1 flex items-center gap-2">
                  <span className="block h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-300" aria-hidden>
                    <span className="block h-full rounded-pill bg-ink" style={{ width: `${l.parte}%` }} />
                  </span>
                  <span className="w-9 text-right text-caption text-ink-muted tabular-nums">{Math.round(l.parte)}%</span>
                </span>
              </td>
              <td className="px-3 py-3 tabular-nums">
                <span className="text-label">{l.noAr}</span>
                <span className="text-ink-muted"> / {l.vagas}</span>
              </td>
              <td className="px-3 py-3 text-right tabular-nums">{formatarNumero(l.soma.impressoes)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatarNumero(l.soma.cliques)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{pct(l.taxa)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{l.porClique === null ? "—" : reais(l.porClique)}</td>
              <td className="px-5 py-3 text-right tabular-nums sm:pr-6">
                {formatarNumero(l.soma.curtidas)}
                {l.porCurtida !== null && (
                  <span className="block text-caption text-ink-muted">{reais(l.porCurtida)} cada</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="text-label">
            <td className="px-5 py-3 sm:pl-6">Total ({plural(linhas.length, "cliente", "clientes")})</td>
            <td className="px-3 py-3 tabular-nums">
              {reais(total.gasto)}
              <span className="font-normal text-ink-muted"> / {reais(total.verba)}</span>
            </td>
            <td className="px-3 py-3 tabular-nums">
              {total.noAr}
              <span className="font-normal text-ink-muted"> / {total.vagas}</span>
            </td>
            <td className="px-3 py-3 text-right tabular-nums">{formatarNumero(total.vistas)}</td>
            <td className="px-3 py-3 text-right tabular-nums">{formatarNumero(total.cliques)}</td>
            <td className="px-3 py-3 text-right tabular-nums">
              {pct(total.vistas > 0 ? (100 * total.cliques) / total.vistas : null)}
            </td>
            <td className="px-3 py-3 text-right tabular-nums">
              {total.cliques > 0 ? reais(total.gasto / total.cliques) : "—"}
            </td>
            <td className="px-5 py-3 text-right tabular-nums sm:pr-6">{formatarNumero(total.curtidas)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
