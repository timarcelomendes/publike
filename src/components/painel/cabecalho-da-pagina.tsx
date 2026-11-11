import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { TemVoltarProprio } from "@/components/voltar";

// O alto de cada tela do painel, o mesmo em todas (11/11/2026, claude/plano-padrao-das-telas.md): o "voltar" (a tela de
// cima, quando há), o título com o selo ao lado, as ações à direita na linha do título, o texto embaixo (até 42rem,
// para ler bem) e, por último, as abas ou a troca de visão da tela. Sem ícone no título. No celular, as ações vêm
// depois do texto (na linha do título, o título ficava espremido).

export function CabecalhoDaPagina({
  titulo,
  selo,
  descricao,
  acoes,
  voltar,
  children,
  esconderTextoNoCelular = false,
  soNoComputador = false,
}: {
  titulo: ReactNode;
  /** "Novo", os dias grátis: ao lado do título */
  selo?: ReactNode;
  /** o que a tela faz, numa ou duas frases */
  descricao?: ReactNode;
  /** os botões da tela (tamanho sm), à direita do título */
  acoes?: ReactNode;
  /** a tela de cima: "‹ Vagas", "‹ Quadro de candidatos" */
  voltar?: { href: string; nome: string };
  /** as abas, a troca de visão ou os filtros da tela, logo embaixo */
  children?: ReactNode;
  /** no celular, com uma ficha aberta, o texto sai para a ficha subir */
  esconderTextoNoCelular?: boolean;
  /** o título e o texto só no computador (as Mensagens no celular são uma tela de app: ficam só as abas) */
  soNoComputador?: boolean;
}) {
  return (
    <header className="relative flex flex-col gap-3">
      {voltar && <LinkVoltar href={voltar.href}>{voltar.nome}</LinkVoltar>}
      {/* o título e as ações numa linha; o texto embaixo do título (no celular, as ações depois dele) */}
      <div
        className={`grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1fr)_auto] ${soNoComputador ? "max-lg:sr-only" : ""}`}
      >
        <div className="col-start-1 row-start-1 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 self-center">
          <h2 className="min-w-0 text-h2 break-words">{titulo}</h2>
          {selo}
        </div>
        {acoes && (
          <div
            className="flex shrink-0 flex-wrap items-center gap-2 max-sm:order-last max-sm:mt-2 sm:col-start-2 sm:row-start-1 sm:self-center print:hidden"
          >
            {acoes}
          </div>
        )}
        {descricao && (
          <div
            className={`col-start-1 max-w-2xl text-body text-ink-muted ${esconderTextoNoCelular ? "max-lg:hidden" : ""}`}
          >
            {descricao}
          </div>
        )}
      </div>
      {children}
    </header>
  );
}

/** "‹ Vagas": a volta para a tela de cima, a mesma em todas as telas (no cabeçalho ou sozinha, numa ficha). */
export function LinkVoltar({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="-mb-1 inline-flex min-h-10 items-center gap-1 self-start text-label text-ink-muted hover:text-ink print:hidden"
    >
      <ChevronLeft aria-hidden className="size-4" />
      <TemVoltarProprio />
      {children}
    </Link>
  );
}

/**
 * O começo de uma aba de dentro de uma tela que já tem o título (a vaga e as abas dela: Avaliar, Automações,
 * Resultados): o que a aba faz, sem repetir o nome da aba num título, e as ações à direita.
 */
export function IntroDaAba({ children, acoes }: { children: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div className="flex max-w-2xl flex-col gap-1 text-body text-ink-muted">{children}</div>
      {acoes && <div className="flex shrink-0 flex-wrap items-center gap-2 print:hidden">{acoes}</div>}
    </div>
  );
}
