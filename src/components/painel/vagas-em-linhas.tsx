import { LayoutGrid, List, Search } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import { abaDaEtapa, esperaResposta, STATUS_ANUNCIO } from "@/lib/constantes";
import type { StatusAnuncio } from "@/lib/tipos";
import { classesEntrada } from "../ui/campo";
import { LembrarVisaoDasVagas } from "./lembrar-visao-vagas";
import { SeletorDeLinks } from "./seletor-de-links";

// As Vagas para quem tem muitas (claude/plano-fluxo-contratar.md, parte 2): a busca pelo nome, a ordem "com gente
// esperando primeiro" e a visão em linhas (uma vaga por linha, com os números que abrem a vaga já na etapa).

export type VisaoDasVagas = "cartoes" | "linhas";
export type OrdemDasVagas = "recentes" | "esperando";
export const COOKIE_VISAO_VAGAS = "publike_visao_vagas";

type Candidato = { anuncio_id: string; status: string; etapa?: string | null; aceita_em?: string | null };

/** Os números de uma vaga: quem espera a resposta, em entrevista e contratados (as contas de `abaDaEtapa`). */
export function numerosDaVaga(id: string, candidatos: Candidato[]) {
  const daVaga = candidatos.filter((c) => c.anuncio_id === id);
  return {
    esperam: daVaga.filter((c) => esperaResposta({ status: c.status, aceita_em: c.aceita_em ?? null })).length,
    entrevista: daVaga.filter((c) => abaDaEtapa(c) === "entrevista").length,
    contratados: daVaga.filter((c) => abaDaEtapa(c) === "contratados").length,
  };
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** A vaga entra na busca pelo título (sem ligar para acento nem maiúscula). */
export function achaNaBusca(titulo: string, q: string) {
  return !q || semAcento(titulo).includes(semAcento(q.trim()));
}

/**
 * Os filtros de Vagas numa linha leve: à esquerda a situação (`antes`), à direita o cliente (`extra`), a ordem e a
 * troca Cartões | Linhas em ícones; a busca, com muitas vagas, embaixo.
 */
export function ControlesDasVagas({
  q,
  ordem,
  visao,
  href,
  manter,
  comBusca,
  comOrdem = true,
  antes,
  extra,
}: {
  q: string;
  ordem: OrdemDasVagas;
  visao: VisaoDasVagas;
  /** o endereço com uma mudança (os outros filtros ficam) */
  href: (mudar: { ordem?: OrdemDasVagas; visao?: VisaoDasVagas; q?: string | null }) => string;
  /** os filtros que vão junto na busca */
  manter: Record<string, string | null>;
  comBusca: boolean;
  /** a ordem e a troca de visão (com mais de uma vaga) */
  comOrdem?: boolean;
  antes?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {antes}
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {extra}
          {comOrdem && (
            <>
              <SeletorDeLinks
                rotulo="Ordem das vagas"
                atual={href({ ordem })}
                opcoes={[
                  { nome: "Ordem: mais recentes", href: href({ ordem: "recentes" }) },
                  { nome: "Ordem: gente esperando primeiro", href: href({ ordem: "esperando" }) },
                ]}
              />
              <nav aria-label="Ver as vagas em" className="inline-flex rounded-pill bg-surface-300 p-0.5">
                {(["cartoes", "linhas"] as const).map((v) => (
                  <LembrarVisaoDasVagas
                    key={v}
                    visao={v}
                    href={href({ visao: v })}
                    ativa={visao === v}
                    nome={v === "cartoes" ? "Cartões" : "Linhas"}
                  >
                    {v === "cartoes" ? (
                      <LayoutGrid aria-hidden className="size-4" />
                    ) : (
                      <List aria-hidden className="size-4" />
                    )}
                  </LembrarVisaoDasVagas>
                ))}
              </nav>
            </>
          )}
        </div>
      </div>
      {comBusca && (
        <form action="/painel/anuncios" role="search" className="relative max-w-md">
          {Object.entries(manter).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
          />
          <input
            type="search"
            name="q"
            defaultValue={q}
            aria-label="Buscar vaga pelo nome"
            placeholder="Buscar vaga pelo nome"
            className={`${classesEntrada} pl-9`}
          />
        </form>
      )}
    </div>
  );
}

/** Uma vaga por linha: o nome (abre a vaga), o cliente (agência), a situação e os números. */
export function VagasEmLinhas({
  vagas,
  candidatos,
  clienteDe,
}: {
  vagas: { id: string; titulo: string; status: string; quantas: number }[];
  candidatos: Candidato[];
  /** agência: o nome do cliente de cada vaga */
  clienteDe?: (id: string) => string | null;
}) {
  const comCliente = Boolean(clienteDe);
  const numero = (n: number, href: string, destaque = false) =>
    n > 0 ? (
      <Link
        href={href}
        className={`underline-offset-2 hover:underline ${destaque ? "font-semibold text-terra-text" : "text-label"}`}
      >
        {n}
      </Link>
    ) : (
      <span className="text-ink-muted">0</span>
    );
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface-200">
      <table className="w-full min-w-[40rem] text-left text-body-sm">
        <thead className="text-caption text-ink-muted">
          <tr className="border-b border-line">
            <th className="px-4 py-2.5 font-normal">Vaga</th>
            {comCliente && <th className="px-4 py-2.5 font-normal">Cliente</th>}
            <th className="px-4 py-2.5 text-right font-normal">Esperam a resposta</th>
            <th className="px-4 py-2.5 text-right font-normal">Em entrevista</th>
            <th className="px-4 py-2.5 text-right font-normal">Contratados</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line tabular-nums">
          {vagas.map((v) => {
            const n = numerosDaVaga(v.id, candidatos);
            const base = `/painel/anuncio/${v.id}`;
            return (
              <tr key={v.id}>
                <th scope="row" className="px-4 py-2.5 font-normal">
                  <Link href={`${base}/quadro`} className="text-label underline-offset-2 hover:underline">
                    {v.titulo}
                  </Link>
                  {v.status !== "ativo" && (
                    <span className="text-caption text-ink-muted">
                      {" "}
                      · {STATUS_ANUNCIO[v.status as StatusAnuncio]?.nome.toLowerCase() ?? v.status}
                    </span>
                  )}
                </th>
                {comCliente && <td className="px-4 py-2.5">{clienteDe?.(v.id) ?? "—"}</td>}
                <td className="px-4 py-2.5 text-right">
                  {numero(n.esperam, `/painel/caixa?aba=novos&vaga=${v.id}`, true)}
                </td>
                <td className="px-4 py-2.5 text-right">{numero(n.entrevista, `${base}?etapa=entrevista`)}</td>
                <td className="px-4 py-2.5 text-right">
                  {numero(n.contratados, `${base}?etapa=contratados`)}
                  <span className="text-ink-muted"> de {v.quantas}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
