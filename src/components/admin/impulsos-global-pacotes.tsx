"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatarNumero, plural } from "@/lib/formato";
import type { Cliente } from "./impulsos-correndo";

// Admin › Impulsos › Visão global no produto de agora, os pacotes de candidatos (15/11/2026, Marcelo: "Quero que fique
// tudo aderente"): o pacote não tem verba nem cliques próprios no Google (corre na campanha geral), então a linha de
// cada cliente mostra os candidatos que chegaram contra os contratados (x/y, com a barra), os pacotes no ar, as visitas
// da vaga (e as que vieram de dentro do Publike) e as curtidas. Ordena por qualquer coluna; o total no fim.

type Linha = {
  c: Cliente;
  pacotes: number;
  noAr: number;
  chegaram: number;
  alvo: number;
  parte: number;
  visitas: number;
  quadro: number;
  curtidas: number;
};

const COLUNAS = [
  { chave: "nome", nome: "Cliente", valor: (l: Linha) => l.c.nome.toLowerCase() },
  { chave: "candidatos", nome: "Candidatos / contratados", valor: (l: Linha) => l.parte },
  { chave: "pacotes", nome: "No ar / pacotes", valor: (l: Linha) => l.noAr },
  { chave: "visitas", nome: "Visitas", valor: (l: Linha) => l.visitas },
  { chave: "quadro", nome: "No Publike", valor: (l: Linha) => l.quadro },
  { chave: "curtidas", nome: "Curtidas", valor: (l: Linha) => l.curtidas },
] as const;
type Chave = (typeof COLUNAS)[number]["chave"];

function linhaDo(c: Cliente): Linha {
  const todas = [...c.vagas, ...c.avulsos];
  const alvo = todas.reduce((t, i) => t + Number(i.alvo ?? 0), 0);
  const chegaram = todas.reduce((t, i) => t + Math.min(Number(i.entregues ?? 0), Number(i.alvo ?? 0)), 0);
  return {
    c,
    pacotes: todas.length,
    noAr: todas.filter((i) => i.situacao === "no_ar").length,
    chegaram,
    alvo,
    parte: alvo > 0 ? Math.min(100, (100 * chegaram) / alvo) : 0,
    visitas: todas.reduce((t, i) => t + i.totais.visitas, 0),
    quadro: todas.reduce((t, i) => t + (i.totais.visitas_quadro ?? 0), 0),
    curtidas: todas.reduce((t, i) => t + i.totais.curtidas, 0),
  };
}

export function VisaoGlobalDosPacotes({ clientes }: { clientes: Cliente[] }) {
  const [ordem, setOrdem] = useState<{ chave: Chave; desc: boolean }>({ chave: "candidatos", desc: false });

  const linhas = useMemo(() => {
    const col = COLUNAS.find((x) => x.chave === ordem.chave)!;
    return clientes.map(linhaDo).sort((a, b) => {
      const va = col.valor(a);
      const vb = col.valor(b);
      const r = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return ordem.desc ? -r : r;
    });
  }, [clientes, ordem]);

  if (linhas.length === 0) {
    return <p className="text-body-sm text-ink-muted">Nenhum cliente com pacote correndo agora.</p>;
  }

  const total = linhas.reduce(
    (t, l) => ({
      pacotes: t.pacotes + l.pacotes,
      noAr: t.noAr + l.noAr,
      chegaram: t.chegaram + l.chegaram,
      alvo: t.alvo + l.alvo,
      visitas: t.visitas + l.visitas,
      quadro: t.quadro + l.quadro,
      curtidas: t.curtidas + l.curtidas,
    }),
    { pacotes: 0, noAr: 0, chegaram: 0, alvo: 0, visitas: 0, quadro: 0, curtidas: 0 },
  );
  const mudar = (chave: Chave) =>
    setOrdem((o) => (o.chave === chave ? { chave, desc: !o.desc } : { chave, desc: chave !== "nome" && chave !== "candidatos" }));

  return (
    <div className="-mx-5 overflow-x-auto sm:-mx-6">
      <table className="w-full min-w-[44rem] text-left text-body-sm">
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
                {l.c.problema && <span className="block text-caption text-danger">com erro</span>}
              </td>
              <td className="min-w-52 px-3 py-3">
                <span className="tabular-nums">
                  <span className="text-label">{formatarNumero(l.chegaram)}</span>
                  <span className="text-ink-muted"> / {formatarNumero(l.alvo)}</span>
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
                <span className="text-ink-muted"> / {l.pacotes}</span>
              </td>
              <td className="px-3 py-3 text-right tabular-nums">{formatarNumero(l.visitas)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatarNumero(l.quadro)}</td>
              <td className="px-5 py-3 text-right tabular-nums sm:pr-6">{formatarNumero(l.curtidas)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="text-label">
            <td className="px-5 py-3 sm:pl-6">Total ({plural(linhas.length, "cliente", "clientes")})</td>
            <td className="px-3 py-3 tabular-nums">
              {formatarNumero(total.chegaram)}
              <span className="font-normal text-ink-muted"> / {formatarNumero(total.alvo)}</span>
            </td>
            <td className="px-3 py-3 tabular-nums">
              {total.noAr}
              <span className="font-normal text-ink-muted"> / {total.pacotes}</span>
            </td>
            <td className="px-3 py-3 text-right tabular-nums">{formatarNumero(total.visitas)}</td>
            <td className="px-3 py-3 text-right tabular-nums">{formatarNumero(total.quadro)}</td>
            <td className="px-5 py-3 text-right tabular-nums sm:pr-6">{formatarNumero(total.curtidas)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
