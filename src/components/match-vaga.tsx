import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { Aderencia, Criterio } from "@/lib/aderencia";
import { CriteriosDaAderencia } from "./painel/nota-aderencia";
import { Selo } from "./ui/basicos";

/** O que o selo precisa: a nota e a conta (atende 4 de 5 itens); com os critérios, sabe se é outra área. */
export type MatchResumo = Pick<Aderencia, "nota" | "atendidos" | "conferidos"> & {
  criterios?: Criterio[];
  outraArea?: boolean;
};

/**
 * A experiência do currículo é em outra área (o item "Experiência na função" não bate). Esse item
 * vale 60% da nota, então o número fica baixo e não diz nada: o selo mostra "Outra área".
 */
export function ehOutraArea(m: MatchResumo) {
  return m.outraArea ?? Boolean(m.criterios?.some((c) => c.funcao && c.ok === false));
}

const itens = (n: number) => `${n} ${n === 1 ? "item" : "itens"}`;

/**
 * "80% de match": o quanto o currículo de quem procura bate com o que a vaga pede.
 * Verde cheio de 80% para cima, contorno verde de 50% a 79%, cinza abaixo disso.
 */
export function SeloMatch({ match, className = "" }: { match: MatchResumo; className?: string }) {
  if (match.nota === null) return null;
  if (ehOutraArea(match)) {
    return (
      <Selo
        variante="contorno"
        title="Sua experiência no currículo é de outra área. O que a vaga pede está na página dela."
        className={className}
      >
        Outra área
      </Selo>
    );
  }
  return (
    <Selo
      variante={match.nota >= 80 ? "match" : match.nota >= 50 ? "matchContorno" : "contorno"}
      title={`Seu currículo atende ${match.atendidos} de ${itens(match.conferidos)} que a vaga pede`}
      className={className}
    >
      {match.nota}% de match
    </Selo>
  );
}

/**
 * Na página da vaga, para quem procura: o % de match e, ao abrir, o porquê item por
 * item, com o atalho para atualizar o currículo.
 */
export function MatchDaVaga({ a, className = "" }: { a: Aderencia; className?: string }) {
  const semConta = a.criterios.length - a.conferidos;
  return (
    <details className={`group/match rounded-lg border border-line bg-surface-200 ${className}`}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
        <SeloMatch match={a} />
        <span className="min-w-0 flex-1 text-body-sm">
          Você atende <strong>{a.atendidos}</strong> de <strong>{itens(a.conferidos)}</strong> desta vaga
        </span>
        <span className="flex shrink-0 items-center gap-1 text-body-sm text-ink-muted">
          <span className="hidden sm:inline sm:group-open/match:hidden">Ver o porquê</span>
          <ChevronDown aria-hidden className="size-4 transition-transform group-open/match:rotate-180" />
        </span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-line px-4 py-3 sm:px-5">
        <CriteriosDaAderencia a={a} />
        <p className="text-body-sm text-ink-muted">
          A conta compara o que a vaga pede com o seu currículo e a cidade do seu perfil
          {semConta > 0 && ` (${itens(semConta)} sem informação no currículo ficam de fora)`}. Os itens com “+” só
          somam.{" "}
          <Link href="/perfil/curriculo" className="font-semibold text-terra-text underline underline-offset-2">
            Atualizar meu currículo
          </Link>
        </p>
      </div>
    </details>
  );
}
