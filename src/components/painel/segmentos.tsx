import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/basicos";

// As partes de uma tela do painel (11/11/2026, claude/plano-padrao-das-telas.md): Processo, Candidatura... nas
// Configurações; Conversas, Matches e Conexões nas Mensagens; o período dos Resultados. O mesmo jeito da troca de
// visão de Vagas e Candidatos: as opções numa pílula, a escolhida em ink. No celular, sem o fundo, rola de lado.

export type Segmento = {
  nome: string;
  href: string;
  ativo: boolean;
  numero?: number;
  /** o que pede você (mensagens novas, pedidos para responder): o número em destaque */
  alerta?: { n: number; leitor: string };
  icone?: ReactNode;
  /** no celular a linha rola de lado e o fim fica escondido: esta vem primeiro (a que tem o que responder) */
  primeiroNoCelular?: boolean;
  /** o logo ou as iniciais (clientes da agência) */
  avatar?: { nome: string; foto?: string | null };
};

export function Segmentos({ rotulo, opcoes }: { rotulo: string; opcoes: Segmento[] }) {
  return (
    // relative: o texto do leitor de tela fica dentro da rolagem (sem alargar a página)
    <nav aria-label={rotulo} className="sem-barra relative -mx-4 overflow-x-auto px-4 sm:mx-0 sm:self-start sm:px-0">
      <ul className="inline-flex min-w-max items-center gap-0.5 align-top sm:rounded-pill sm:bg-surface-300 sm:p-0.5">
        {opcoes.map((o) => (
          <li key={o.href} className={o.primeiroNoCelular ? "max-sm:order-first" : undefined}>
            <Link
              href={o.href}
              scroll={false}
              aria-current={o.ativo ? "page" : undefined}
              className={`relative inline-flex min-h-10 items-center gap-1.5 rounded-pill px-3 text-label whitespace-nowrap transition-colors sm:min-h-9 [&_svg]:size-4 [&_svg]:shrink-0 ${
                o.ativo ? "bg-ink text-surface-100 shadow-card" : "text-ink-muted hover:bg-surface-100/60 hover:text-ink"
              }`}
            >
              {o.avatar && (
                <Avatar nome={o.avatar.nome} foto={o.avatar.foto} tamanho={20} forma="quadrada" colorida />
              )}
              {o.icone}
              {o.nome}
              {o.numero !== undefined && (
                <span className={`tabular-nums ${o.ativo ? "text-surface-100/75" : "text-ink-muted"}`}>{o.numero}</span>
              )}
              {o.alerta && o.alerta.n > 0 && (
                <span className="min-w-5 rounded-pill bg-like px-1.5 text-center text-caption leading-5 text-on-like tabular-nums">
                  <span aria-hidden>{o.alerta.n > 99 ? "99+" : o.alerta.n}</span>
                  <span className="sr-only">, {o.alerta.leitor}</span>
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * A mesma escolha, mais leve: só o texto e o número, com a escolhida num fundo claro. As opções vazias (0) somem,
 * menos a escolhida. Para os filtros do alto de Vagas, que não podem pesar mais que a lista.
 */
export function AbasLeves({ rotulo, opcoes }: { rotulo: string; opcoes: Segmento[] }) {
  return (
    <nav aria-label={rotulo} className="sem-barra relative -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max items-center gap-0.5">
        {opcoes
          .filter((o) => o.numero !== 0 || o.ativo)
          .map((o) => (
            <li key={o.href} className={o.primeiroNoCelular ? "max-sm:order-first" : undefined}>
              <Link
                href={o.href}
                scroll={false}
                aria-current={o.ativo ? "page" : undefined}
                className={`relative inline-flex min-h-10 items-center gap-1.5 rounded-pill px-3 text-label whitespace-nowrap transition-colors ${
                  o.ativo ? "bg-surface-300 text-ink" : "text-ink-muted hover:text-ink"
                }`}
              >
                {o.nome}
                {o.numero !== undefined && <span className="text-ink-muted tabular-nums">{o.numero}</span>}
                {o.alerta && o.alerta.n > 0 && (
                  <span className="min-w-5 rounded-pill bg-like px-1.5 text-center text-caption leading-5 text-on-like tabular-nums">
                    <span aria-hidden>{o.alerta.n > 99 ? "99+" : o.alerta.n}</span>
                    <span className="sr-only">, {o.alerta.leitor}</span>
                  </span>
                )}
              </Link>
            </li>
          ))}
      </ul>
    </nav>
  );
}
