import { ChevronRight } from "lucide-react";
import Link from "next/link";

export type EtapaDoCaminho = {
  valor: string;
  nome: string;
  /** quantos estão na etapa */
  numero: number;
  /** quantos ali esperam a sua resposta */
  espera: number;
  /** a linha embaixo do número, quando ninguém espera você ("Você está olhando") */
  ajuda: string;
  href: string;
  ativa: boolean;
};

/**
 * O caminho do candidato em Candidatos (e na vaga): 1 Novos → 2 Em análise → 3 Entrevista → 4 Contratados, como
 * o passo a passo do Publicar. Cada etapa é um cartão com o número do passo, o nome, quantos estão nela (grande)
 * e quantos esperam você; tocar abre a etapa. No celular, os cartões rolam de lado.
 */
export function CaminhoDasEtapas({ etapas, rotulo = "Etapas" }: { etapas: EtapaDoCaminho[]; rotulo?: string }) {
  return (
    <nav aria-label={rotulo} className="sem-barra -mx-4 overflow-x-auto px-4 py-1 sm:mx-0 sm:px-0">
      <ol className="flex min-w-max items-stretch gap-1.5 sm:min-w-0">
        {etapas.map((e, i) => {
          const vazia = e.numero === 0;
          const leitor = `${e.nome}: ${e.numero}${e.espera ? `, ${e.espera === 1 ? "1 espera" : `${e.espera} esperam`} você` : ""}`;
          return (
            <li key={e.valor} className="flex items-center gap-1.5 sm:flex-1">
              <Link
                href={e.href}
                scroll={false}
                aria-current={e.ativa ? "page" : undefined}
                aria-label={leitor}
                className={`flex h-full w-40 flex-col gap-1 rounded-lg border p-3 transition-colors sm:w-auto sm:flex-1 ${
                  e.ativa
                    ? "border-ink bg-surface-200 shadow-card"
                    : e.espera
                      ? "border-terra/50 bg-terra-soft hover:border-terra"
                      : "border-line bg-surface-200/60 hover:border-line-strong"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`flex size-6 shrink-0 items-center justify-center rounded-pill text-caption font-semibold tabular-nums ${
                      e.ativa
                        ? "bg-ink text-surface-100"
                        : e.espera
                          ? "bg-terra text-surface-100"
                          : "border border-line-strong text-ink-muted"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span aria-hidden className={`text-label ${vazia && !e.ativa ? "text-ink-muted" : "text-ink"}`}>
                    {e.nome}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={`font-display text-h2 leading-none tabular-nums ${
                    vazia ? "text-ink-muted" : e.espera ? "text-terra-text" : "text-ink"
                  }`}
                >
                  {e.numero}
                </span>
                <span
                  aria-hidden
                  className={`text-body-sm leading-snug ${e.espera ? "font-semibold text-terra-text" : "text-ink-muted"}`}
                >
                  {e.espera ? `${e.espera === 1 ? "1 espera" : `${e.espera} esperam`} você` : e.ajuda}
                </span>
              </Link>
              {i < etapas.length - 1 && <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
