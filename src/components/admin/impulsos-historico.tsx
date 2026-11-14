"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Selo } from "@/components/ui/basicos";
import { classesEntrada } from "@/components/ui/campo";
import type { ImpulsoDoAdmin } from "@/lib/acoes/admin-impulsos";
import { formatarMoeda, formatarNumero, plural, tempoRelativo } from "@/lib/formato";
import { PararImpulso } from "./impulsos";
import {
  NOME_DA_ORIGEM,
  VARIANTE_DA_SITUACAO,
  candidatosDoPacote,
  ehCorrendo,
  ehPacote,
  nomeDaSituacao,
  origemDo,
} from "./impulsos-nomes";

// Admin › Impulsos › Histórico: os impulsos dos últimos tempos (os 200 mais novos e todos os que correm), com filtros
// por situação, origem, tipo de vaga e cliente, sem ir ao servidor de novo.

const SITUACOES = [
  { valor: "todas", nome: "Todas" },
  { valor: "correndo", nome: "Correndo" },
  { valor: "acabou", nome: "Acabaram" },
  { valor: "parou", nome: "Paradas ou devolvidas" },
] as const;

// "Manuais": o que a equipe pediu (a campanha do cliente e o impulso pelo admin de antes); "Automático": o que o robô
// escolheu sozinho; o resto, o que o cliente pagou ou ganhou
export const ORIGENS = [
  { valor: "todas", nome: "Todas" },
  { valor: "automatico", nome: "Automático" },
  { valor: "manual", nome: "Manuais" },
  { valor: "compra", nome: "Pago" },
  { valor: "cortesia", nome: "Grátis" },
  { valor: "credito", nome: "Crédito" },
] as const;

export function Filtro<T extends string>({
  rotulo,
  opcoes,
  atual,
  mudar,
}: {
  rotulo: string;
  opcoes: readonly { valor: T; nome: string; numero?: number }[];
  atual: T;
  mudar: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-body-sm text-ink-muted">{rotulo}</span>
      <div className="sem-barra -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {opcoes.map((o) => {
          const ativo = o.valor === atual;
          return (
            <button
              key={o.valor}
              type="button"
              aria-pressed={ativo}
              onClick={() => mudar(o.valor)}
              className={`inline-flex min-h-8 shrink-0 items-center gap-1 rounded-pill border px-3 text-body-sm transition-colors ${
                ativo ? "border-ink bg-ink font-semibold text-surface-100" : "border-line text-ink hover:bg-surface-300"
              }`}
            >
              {o.nome}
              {o.numero !== undefined && (
                <span className={`tabular-nums ${ativo ? "text-surface-100/75" : "text-ink-muted"}`}>{o.numero}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function HistoricoDeImpulsos({
  impulsos,
  tipos,
  agora,
}: {
  impulsos: ImpulsoDoAdmin[];
  tipos: string[];
  agora: number;
}) {
  const [situacao, setSituacao] = useState<(typeof SITUACOES)[number]["valor"]>("todas");
  const [origem, setOrigem] = useState<(typeof ORIGENS)[number]["valor"]>("todas");
  const [tipo, setTipo] = useState("todos");
  const [busca, setBusca] = useState("");

  const lista = useMemo(() => {
    const termo = busca
      .normalize("NFD")
      .replace(/\p{Mn}/gu, "")
      .toLowerCase()
      .trim();
    const semAcento = (t: string) =>
      t
        .normalize("NFD")
        .replace(/\p{Mn}/gu, "")
        .toLowerCase();
    return impulsos.filter((i) => {
      if (situacao === "correndo" && !ehCorrendo(i.situacao)) return false;
      if (situacao === "acabou" && i.situacao !== "encerrado") return false;
      if (situacao === "parou" && !["credito", "devolvido"].includes(i.situacao)) return false;
      const de = origemDo(i);
      if (origem === "manual" ? de !== "cliente" && de !== "admin" : origem !== "todas" && de !== origem) return false;
      if (tipo !== "todos" && (i.tipo ?? "Outros") !== tipo) return false;
      if (termo && !semAcento(`${i.titulo} ${i.conta}`).includes(termo)) return false;
      return true;
    });
  }, [impulsos, situacao, origem, tipo, busca]);

  const opcoesDeTipo = useMemo(() => {
    const conta = new Map<string, number>();
    for (const i of impulsos) conta.set(i.tipo ?? "Outros", (conta.get(i.tipo ?? "Outros") ?? 0) + 1);
    return [
      { valor: "todos", nome: "Todos" },
      ...[...tipos, "Outros"].filter((t) => conta.has(t)).map((t) => ({ valor: t, nome: t, numero: conta.get(t) })),
    ];
  }, [impulsos, tipos]);

  const soma = lista.reduce(
    (t, i) => ({
      gasto: t.gasto + Number(i.gasto ?? 0),
      cliques: t.cliques + i.totais.cliques,
      curtidas: t.curtidas + i.totais.curtidas,
    }),
    { gasto: 0, cliques: 0, curtidas: 0 },
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <Filtro rotulo="Situação" opcoes={SITUACOES} atual={situacao} mudar={setSituacao} />
        <Filtro rotulo="Origem" opcoes={ORIGENS} atual={origem} mudar={setOrigem} />
        <Filtro rotulo="Tipo de vaga" opcoes={opcoesDeTipo} atual={tipo} mudar={setTipo} />
        <label className="flex flex-col gap-1.5">
          <span className="text-body-sm text-ink-muted">Cliente ou vaga</span>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome do cliente ou título da vaga"
            className={`${classesEntrada} max-w-sm`}
          />
        </label>
      </div>

      <p className="text-body-sm text-ink-muted">
        {plural(lista.length, "impulso", "impulsos")}: {formatarMoeda(Math.round(soma.gasto * 100) / 100)} no Google,{" "}
        {plural(soma.cliques, "clique", "cliques")} e {plural(soma.curtidas, "curtida", "curtidas")}.
      </p>

      {lista.length === 0 ? (
        <p className="text-body-sm text-ink-muted">Nenhum impulso com esses filtros.</p>
      ) : (
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[52rem] text-left text-body-sm">
            <thead className="text-ink-muted">
              <tr className="border-b border-line">
                <th className="px-5 py-2 font-normal sm:pl-6">Vaga</th>
                <th className="px-3 py-2 font-normal">Situação</th>
                <th className="px-3 py-2 font-normal">Origem</th>
                <th className="px-3 py-2 text-right font-normal">Gasto</th>
                <th className="px-3 py-2 text-right font-normal">Cliques</th>
                <th className="px-3 py-2 text-right font-normal">Curtidas</th>
                <th className="px-3 py-2 font-normal">Quando</th>
                <th className="relative px-5 py-2 font-normal sm:pr-6">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.map((i) => (
                <tr key={i.id} className="border-b border-line align-top last:border-0">
                  <td className="min-w-60 px-5 py-3 sm:pl-6">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {i.anuncio_id ? (
                        <Link href={`/anuncio/${i.anuncio_id}`} className="text-label hover:underline">
                          {i.titulo}
                        </Link>
                      ) : (
                        <span className="text-label">{i.titulo}</span>
                      )}
                      <Selo variante="contorno">{i.tipo ?? "Outros"}</Selo>
                    </span>
                    <span className="block text-ink-muted">{i.conta}</span>
                    {(i.erro || i.motivo) && (
                      <span
                        title={i.erro ?? i.motivo ?? undefined}
                        className={`mt-1 line-clamp-3 max-w-md ${i.erro ? "text-danger" : "text-ink-muted"}`}
                      >
                        {i.erro && i.erro_desde && `Desde ${tempoRelativo(i.erro_desde, agora)}: `}
                        {i.erro ?? i.motivo}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className="flex flex-wrap gap-1 whitespace-nowrap">
                      <Selo variante={VARIANTE_DA_SITUACAO[i.situacao] ?? "neutro"}>{nomeDaSituacao(i)}</Selo>
                      {/* o pacote de candidatos (migração 20270519120000) */}
                      {ehPacote(i) && <Selo variante="contorno">Pacote</Selo>}
                      {i.pausar && <Selo variante="novo">Parando</Selo>}
                      {i.sandbox && <Selo variante="contorno">Teste</Selo>}
                      {/* a garantia da verba estendeu o prazo (migração 20270518120000) */}
                      {i.estendido_em && <Selo variante="aviso">Garantia</Selo>}
                    </span>
                  </td>
                  {ehPacote(i) ? (
                    <td className="min-w-44 px-3 py-3">
                      {NOME_DA_ORIGEM[origemDo(i)]}, {candidatosDoPacote(i)}
                      <span className="block text-ink-muted">
                        {i.origem === "compra" ? `${formatarMoeda(i.valor)}, ` : ""}
                        {formatarNumero(i.totais.visitas)} {i.totais.visitas === 1 ? "visita" : "visitas"} (
                        {formatarNumero(i.totais.visitas_quadro ?? 0)} no Publike)
                      </span>
                    </td>
                  ) : (
                    <td className="min-w-44 px-3 py-3">
                      {NOME_DA_ORIGEM[origemDo(i)]}, {i.dias} {i.dias === 1 ? "dia" : "dias"}
                      <span className="block text-ink-muted">
                        {i.origem === "compra" ? `${formatarMoeda(i.valor)}, ` : ""}
                        {i.campanha_cliente_id ? "parte de " : "até "}
                        {formatarMoeda(i.verba)} no Google
                      </span>
                    </td>
                  )}
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                    {ehPacote(i) ? "—" : formatarMoeda(Number(i.gasto ?? 0))}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{ehPacote(i) ? "—" : formatarNumero(i.totais.cliques)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatarNumero(i.totais.curtidas)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-ink-muted">{tempoRelativo(i.criado_em, agora)}</td>
                  <td className="px-5 py-3 sm:pr-6">
                    {ehCorrendo(i.situacao) && !i.pausar && <PararImpulso id={i.id} noAr={i.situacao === "no_ar"} pacote={ehPacote(i)} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
