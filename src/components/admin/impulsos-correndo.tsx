"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Selo } from "@/components/ui/basicos";
import { BotaoLink, classesBotao } from "@/components/ui/botao";
import { classesEntrada } from "@/components/ui/campo";
import type { CampanhaDoAdmin, ImpulsoDoAdmin } from "@/lib/acoes/admin-impulsos";
import { formatarData, formatarMoeda, formatarNumero, plural, tempoRelativo } from "@/lib/formato";
import { PararCampanha, PararImpulso } from "./impulsos";
import { Filtro, ORIGENS } from "./impulsos-historico";
import { NOME_DA_ORIGEM, NOME_DA_SITUACAO, VARIANTE_DA_SITUACAO, ehCorrendo, origemDo } from "./impulsos-nomes";

// Admin › Impulsos › Agora › Correndo agora: as vagas que correm, por cliente, com filtros por origem, situação e
// cliente ou vaga, sem ir ao servidor de novo (13/11/2026, Marcelo: "adicione filtros aqui"). Os mesmos filtros do
// Histórico; a campanha do cliente continua inteira no cabeçalho do cartão, e o filtro escolhe as vagas de baixo.

/** As vagas que correm agora, por cliente: a campanha do cliente (com as vagas dela) e os impulsos de uma vaga só. */
export type Cliente = {
  conta_id: string;
  nome: string;
  campanha: CampanhaDoAdmin | null;
  vagas: ImpulsoDoAdmin[];
  avulsos: ImpulsoDoAdmin[];
  problema: boolean;
  recente: string;
};

const SITUACOES = [
  { valor: "todas", nome: "Todas" },
  { valor: "no_ar", nome: "No ar" },
  { valor: "em_revisao", nome: "Em revisão" },
  { valor: "pago", nome: "Criando" },
] as const;

type Origem = (typeof ORIGENS)[number]["valor"];
type SituacaoDoFiltro = (typeof SITUACOES)[number]["valor"];

const semAcento = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase();

function daOrigem(i: ImpulsoDoAdmin, origem: Origem) {
  if (origem === "todas") return true;
  const de = origemDo(i);
  return origem === "manual" ? de === "cliente" || de === "admin" : de === origem;
}

const reais = (v: number) => formatarMoeda(Math.round(v * 100) / 100);

export function CorrendoAgora({ clientes, agora }: { clientes: Cliente[]; agora: number }) {
  const [origem, setOrigem] = useState<Origem>("todas");
  const [situacao, setSituacao] = useState<SituacaoDoFiltro>("todas");
  const [busca, setBusca] = useState("");
  const termo = semAcento(busca).trim();
  const filtrando = origem !== "todas" || situacao !== "todas" || termo !== "";

  // as opções que aparecem: só as que têm vaga correndo agora (o número ao lado conta com os outros filtros)
  const { existe, linhas } = useMemo(() => {
    const existe = new Set<string>(["todas"]);
    let linhas = 0;
    for (const c of clientes) {
      for (const i of [...c.vagas, ...c.avulsos]) {
        linhas++;
        existe.add(i.situacao);
        for (const o of ORIGENS) if (daOrigem(i, o.valor)) existe.add(`origem:${o.valor}`);
      }
    }
    return { existe, linhas };
  }, [clientes]);

  const { lista, porOrigem, porSituacao, vagas } = useMemo(() => {
    const porOrigem = new Map<string, number>();
    const porSituacao = new Map<string, number>();
    const mais = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
    const lista: { c: Cliente; linhas: ImpulsoDoAdmin[] }[] = [];
    let vagas = 0;
    for (const c of clientes) {
      const doCliente: ImpulsoDoAdmin[] = [];
      for (const i of [...c.vagas, ...c.avulsos]) {
        if (termo && !semAcento(`${i.titulo} ${c.nome}`).includes(termo)) continue;
        const o = daOrigem(i, origem);
        const s = situacao === "todas" || i.situacao === situacao;
        if (s) for (const op of ORIGENS) if (daOrigem(i, op.valor)) mais(porOrigem, op.valor);
        if (o) {
          mais(porSituacao, "todas");
          mais(porSituacao, i.situacao);
        }
        if (o && s) doCliente.push(i);
      }
      if (doCliente.length) {
        lista.push({ c, linhas: doCliente });
        vagas += doCliente.length;
      }
    }
    return { lista, porOrigem, porSituacao, vagas };
  }, [clientes, origem, situacao, termo]);

  const comFiltros = clientes.length > 1 || linhas > 3;
  const limpar = () => {
    setOrigem("todas");
    setSituacao("todas");
    setBusca("");
  };

  return (
    <div className="flex flex-col gap-4">
      {comFiltros && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Filtro
            rotulo="Origem"
            opcoes={ORIGENS.filter((o) => existe.has(`origem:${o.valor}`)).map((o) => ({
              ...o,
              numero: porOrigem.get(o.valor) ?? 0,
            }))}
            atual={origem}
            mudar={setOrigem}
          />
          <Filtro
            rotulo="Situação"
            opcoes={SITUACOES.filter((s) => existe.has(s.valor)).map((s) => ({
              ...s,
              numero: porSituacao.get(s.valor) ?? 0,
            }))}
            atual={situacao}
            mudar={setSituacao}
          />
          <label className="flex flex-col gap-1.5 lg:col-span-2">
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
      )}

      {filtrando && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-body-sm text-ink-muted" aria-live="polite">
            {vagas === 0
              ? "Nenhuma vaga com esses filtros."
              : `${plural(vagas, "vaga", "vagas")}, de ${plural(lista.length, "cliente", "clientes")}.`}
          </p>
          <button type="button" onClick={limpar} className={classesBotao("fantasma", "sm")}>
            Limpar filtros
          </button>
        </div>
      )}

      {lista.map(({ c, linhas: doCliente }) => (
        <CartaoDoCliente key={c.conta_id} c={c} linhas={doCliente} agora={agora} />
      ))}
    </div>
  );
}

function somaDos(vagas: ImpulsoDoAdmin[]) {
  return vagas.reduce(
    (t, i) => ({
      gasto: t.gasto + Number(i.gasto ?? 0),
      impressoes: t.impressoes + i.totais.impressoes,
      cliques: t.cliques + i.totais.cliques,
      curtidas: t.curtidas + i.totais.curtidas,
    }),
    { gasto: 0, impressoes: 0, cliques: 0, curtidas: 0 },
  );
}

function numerosDa(t: { impressoes: number; cliques: number; curtidas: number }) {
  return `${plural(t.impressoes, "vista", "vistas")}, ${plural(t.cliques, "clique", "cliques")}, ${plural(t.curtidas, "curtida", "curtidas")}`;
}

function situacaoDaCampanha(k: CampanhaDoAdmin) {
  if (k.situacao === "no_ar") return k.ate ? `no ar até ${formatarData(k.ate)}` : "no ar";
  if (k.situacao === "em_revisao") return "anúncios em revisão no Google";
  return "criando no Google";
}

/**
 * Os números do cliente (a campanha dele e as vagas sozinhas): o gasto no Google contra a verba, com a barra, e as
 * vistas, os cliques (com a taxa de clique), as curtidas e quanto custou cada clique e cada curtida.
 */
function NumerosDoCliente({ c }: { c: Cliente }) {
  const soma = somaDos([...c.vagas, ...c.avulsos]);
  const verba =
    Number(c.campanha?.verba ?? 0) + c.avulsos.reduce((t, i) => t + Number(i.verba ?? 0), 0);
  const parte = verba > 0 ? Math.min(100, (100 * soma.gasto) / verba) : 0;
  const taxa = soma.impressoes > 0 ? (100 * soma.cliques) / soma.impressoes : null;
  const numeros: { rotulo: string; valor: string; detalhe?: string }[] = [
    { rotulo: "Vistas", valor: formatarNumero(soma.impressoes) },
    {
      rotulo: "Cliques",
      valor: formatarNumero(soma.cliques),
      detalhe: taxa === null ? undefined : `${taxa.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% das vistas`,
    },
    { rotulo: "Por clique", valor: soma.cliques > 0 ? reais(soma.gasto / soma.cliques) : "—" },
    {
      rotulo: "Curtidas",
      valor: formatarNumero(soma.curtidas),
      detalhe: soma.curtidas > 0 ? `${reais(soma.gasto / soma.curtidas)} cada` : undefined,
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <p className="flex flex-wrap items-baseline justify-between gap-x-4 text-body-sm">
          <span>
            <span className="text-label tabular-nums">{reais(soma.gasto)}</span>
            <span className="text-ink-muted"> gastos de {reais(verba)} no Google</span>
          </span>
          <span className="text-ink-muted tabular-nums">{Math.round(parte)}% da verba</span>
        </p>
        <span className="block h-1.5 overflow-hidden rounded-pill bg-surface-300" aria-hidden>
          <span className="block h-full rounded-pill bg-ink" style={{ width: `${parte}%` }} />
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {numeros.map((n) => (
          <div key={n.rotulo} className="min-w-0">
            <dt className="text-caption text-ink-muted">{n.rotulo}</dt>
            <dd className="text-label tabular-nums">
              {n.valor}
              {n.detalhe && <span className="ml-1.5 text-caption font-normal text-ink-muted">{n.detalhe}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** O cartão do cliente: o cabeçalho e a campanha inteiros; embaixo, as vagas que passaram nos filtros (`linhas`). */
function CartaoDoCliente({ c, linhas, agora }: { c: Cliente; linhas: ImpulsoDoAdmin[]; agora: number }) {
  const k = c.campanha;
  const vagasCorrendo = c.vagas.filter((i) => ehCorrendo(i.situacao));
  const podeParar = vagasCorrendo.some((i) => !i.pausar);
  const escondidas = c.vagas.length + c.avulsos.length - linhas.length;
  return (
    <article className="overflow-hidden rounded-md border border-line">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-surface-100 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-h3">
            <Link href={`/perfil/${c.conta_id}/vagas`} className="hover:underline">
              {c.nome}
            </Link>
          </h3>
          <p className="text-body-sm text-ink-muted">
            {k
              ? `Campanha do cliente, ${plural(vagasCorrendo.length, "vaga", "vagas")}, ${situacaoDaCampanha(k)}`
              : c.avulsos.every((i) => i.automatico)
                ? plural(c.avulsos.length, "vaga no impulso automático", "vagas no impulso automático")
                : plural(c.avulsos.length, "vaga impulsionada sozinha", "vagas impulsionadas sozinhas")}
            {k && c.avulsos.length > 0 && `. Mais ${plural(c.avulsos.length, "vaga sozinha", "vagas sozinhas")}`}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <BotaoLink href={`/admin/impulsos?aba=novo&conta=${c.conta_id}`} tamanho="sm">
            <Plus aria-hidden />
            Mais vagas
          </BotaoLink>
          {k && podeParar && <PararCampanha id={k.id} vagas={vagasCorrendo.length} />}
        </div>
      </header>

      {(k || c.avulsos.length > 1) && (
        <div className="flex flex-col gap-2 border-b border-line px-4 py-3">
          <NumerosDoCliente c={c} />
          {k?.erro && (
            <p className="text-body-sm break-words text-danger">
              {k.erro}
              {k.erro_desde && ` (desde ${tempoRelativo(k.erro_desde, agora)})`}
            </p>
          )}
        </div>
      )}

      <ul className="divide-y divide-line">
        {linhas.map((i) => {
          const corre = ehCorrendo(i.situacao);
          return (
            <li
              key={i.id}
              className={`grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start ${corre ? "" : "opacity-70"}`}
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {i.anuncio_id ? (
                    <Link href={`/anuncio/${i.anuncio_id}`} className="text-label hover:underline">
                      {i.titulo}
                    </Link>
                  ) : (
                    <span className="text-label">{i.titulo}</span>
                  )}
                  <Selo variante={VARIANTE_DA_SITUACAO[i.situacao] ?? "neutro"}>{NOME_DA_SITUACAO[i.situacao] ?? i.situacao}</Selo>
                  {i.automatico && <Selo variante="novo">Automático</Selo>}
                  <Selo variante="contorno">{i.tipo ?? "Outros"}</Selo>
                  {i.pausar && <Selo variante="novo">Parando</Selo>}
                </p>
                <p className="mt-0.5 text-body-sm text-ink-muted">
                  {!i.campanha_cliente_id &&
                    `${i.automatico ? NOME_DA_ORIGEM.automatico : NOME_DA_ORIGEM[i.origem]}, ${plural(i.dias, "dia", "dias")}${
                      i.ate && i.situacao === "no_ar" ? ` até ${formatarData(i.ate)}` : ""
                    }. `}
                  <span className="tabular-nums">
                    {reais(Number(i.gasto ?? 0))} no Google, {numerosDa(i.totais)}
                  </span>
                </p>
                {i.erro && corre && (
                  <p className="mt-0.5 text-body-sm break-words text-danger">
                    {i.erro}
                    {i.erro_desde && ` (desde ${tempoRelativo(i.erro_desde, agora)})`}
                  </p>
                )}
                {!corre && i.motivo && <p className="mt-0.5 text-body-sm text-ink-muted">{i.motivo}</p>}
              </div>
              {corre && !i.pausar && (
                <div className="sm:justify-self-end">
                  <PararImpulso id={i.id} noAr={i.situacao === "no_ar"} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {escondidas > 0 && (
        <p className="border-t border-line px-4 py-2 text-body-sm text-ink-muted">
          Mais {plural(escondidas, "vaga", "vagas")} deste cliente, fora dos filtros.
        </p>
      )}
    </article>
  );
}
