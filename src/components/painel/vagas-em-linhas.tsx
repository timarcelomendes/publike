import { ChartGantt, LayoutGrid, List, ListTodo, Lock, Search } from "lucide-react";
import type { ReactNode } from "react";
import { NOME_DA_VISAO, VISOES, VISOES_PAGAS, type VisaoDasVagas } from "@/lib/visoes-das-vagas";
import { classesEntrada } from "../ui/campo";
import { LembrarVisaoDasVagas } from "./lembrar-visao-vagas";
import { SeletorDeLinks } from "./seletor-de-links";

// Os filtros de Vagas para quem tem muitas (claude/plano-fluxo-contratar.md, parte 2): a busca pelo nome, a ordem
// "pede você primeiro" e a troca de visão (11/11/2026, claude/plano-visoes-das-vagas.md: Lista, Pelo que pede você,
// Mosaico e Linha do tempo; as duas últimas nos planos, com o cadeado para quem ainda não tem).

export type OrdemDasVagas = "recentes" | "esperando";
export const COOKIE_VISAO_VAGAS = "publike_visao_vagas";

const ICONE: Record<VisaoDasVagas, typeof List> = { lista: List, prioridade: ListTodo, mosaico: LayoutGrid, tempo: ChartGantt };

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** A vaga entra na busca pelo título (sem ligar para acento nem maiúscula). */
export function achaNaBusca(titulo: string, q: string) {
  return !q || semAcento(titulo).includes(semAcento(q.trim()));
}

/**
 * Os filtros de Vagas numa linha leve: à esquerda a situação (`antes`), à direita o cliente (`extra`) e a ordem;
 * embaixo a troca de visão e, com muitas vagas, a busca.
 */
export function ControlesDasVagas({
  q,
  ordem,
  visao,
  href,
  manter,
  comBusca,
  comOrdem = true,
  comVisao = comOrdem,
  pagas = null,
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
  /** a ordem (com mais de uma vaga; em "Pelo que pede você", a ordem já é a dela) */
  comOrdem?: boolean;
  /** a troca de visão (só vagas) */
  comVisao?: boolean;
  /** o Mosaico e a Linha do tempo: "livres" (plano ou dias grátis), "trancadas" (cadeado) ou fora (sem a migração) */
  pagas?: "livres" | "trancadas" | null;
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
            <SeletorDeLinks
              rotulo="Ordem das vagas"
              atual={href({ ordem })}
              opcoes={[
                { nome: "Ordem: mais recentes", href: href({ ordem: "recentes" }) },
                { nome: "Ordem: pede você primeiro", href: href({ ordem: "esperando" }) },
              ]}
            />
          )}
        </div>
      </div>
      {comVisao && (
        <nav
          aria-label="Ver as vagas em"
          className="sem-barra -mx-4 flex gap-0.5 overflow-x-auto px-4 sm:mx-0 sm:self-start sm:rounded-pill sm:bg-surface-300 sm:p-0.5"
        >
          {VISOES.filter((v) => pagas || !VISOES_PAGAS.includes(v)).map((v) => {
            const Icone = ICONE[v];
            const trancada = pagas === "trancadas" && VISOES_PAGAS.includes(v);
            return (
              <LembrarVisaoDasVagas key={v} visao={v} href={href({ visao: v })} ativa={visao === v}>
                <Icone aria-hidden />
                {NOME_DA_VISAO[v]}
                {trancada && (
                  <>
                    <Lock aria-hidden className="opacity-60" />
                    <span className="sr-only"> (nos planos)</span>
                  </>
                )}
              </LembrarVisaoDasVagas>
            );
          })}
        </nav>
      )}
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
