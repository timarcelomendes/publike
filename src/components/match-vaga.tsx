import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { maisEmParte, motivoDoTeto, outraArea, type Aderencia, type Criterio } from "@/lib/aderencia";
import { CriteriosDaAderencia } from "./painel/nota-aderencia";
import { Selo } from "./ui/basicos";

/** O que o selo precisa: a nota e a conta (atende 4 de 5 itens); com os critérios, sabe se é outra área. */
export type MatchResumo = Pick<Aderencia, "nota" | "atendidos" | "conferidos"> &
  Partial<Pick<Aderencia, "perfil" | "funcao" | "primeiroEmprego" | "faltam">> & {
    emParte?: number;
    teto?: number | null;
    criterios?: Criterio[];
    outraArea?: boolean;
  };

/**
 * A experiência do currículo é em outra área (o item "Experiência na função" não bate nem em parte:
 * nem área parecida, nem estudo, nem curso, nem habilidade; na vaga de entrada, também quem já trabalhou
 * em outra coisa). O número não diz nada sobre a função: o selo mostra "Outra área".
 */
export function ehOutraArea(m: MatchResumo) {
  if (m.outraArea !== undefined) return m.outraArea;
  if (!m.criterios) return false;
  return outraArea({
    criterios: m.criterios,
    perfil: m.perfil ?? "experiencia",
    funcao: m.funcao ?? null,
    primeiroEmprego: m.primeiroEmprego ?? false,
  });
}

const itens = (n: number) => `${n} ${n === 1 ? "item" : "itens"}`;

/** "Seu currículo atende 4 de 5 itens que a vaga pede.": o porquê do número, ao parar o mouse em cima. */
function explicarMatch(match: MatchResumo) {
  const teto = motivoDoTeto(match);
  return `Seu currículo atende ${match.atendidos} de ${itens(match.conferidos)} que a vaga pede${maisEmParte(match.emParte)}.${teto ? ` ${teto}` : ""}`;
}

/**
 * O % de match num anel, no rodapé do cartão da vaga, ao lado dos botões e do tamanho deles (11/11/2026: o selo
 * largo empurrava os botões para outra linha). O arco diz o quanto combina (verde de 80% para cima, amarelo de 50% a
 * 79%, cinza abaixo), com o miolo no mesmo tom, claro.
 */
export function AnelDeMatch({ match }: { match: MatchResumo }) {
  const nota = Math.max(0, Math.min(100, match.nota ?? 0));
  const raio = 19;
  const volta = 2 * Math.PI * raio;
  const [arco, miolo] =
    nota >= 80
      ? ["var(--pk-cerrado)", "fill-cerrado/10"]
      : nota >= 50
        ? ["var(--pk-ipe)", "fill-ipe/15"]
        : ["var(--pk-ink-muted)", "fill-surface-300/70"];
  return (
    <span className="relative inline-flex size-11 shrink-0" title={explicarMatch(match)}>
      <svg viewBox="0 0 44 44" className="size-11" aria-hidden>
        <circle cx="22" cy="22" r="15.5" className={miolo} />
        <circle cx="22" cy="22" r={raio} fill="none" stroke="var(--pk-surface-300)" strokeWidth="3" />
        <circle
          cx="22"
          cy="22"
          r={raio}
          fill="none"
          stroke={arco}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={volta}
          strokeDashoffset={volta * (1 - nota / 100)}
          transform="rotate(-90 22 22)"
        />
      </svg>
      <span aria-hidden className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-display text-[13px] font-bold tracking-tight text-ink tabular-nums">
          {nota}
          <span className="text-[9px]">%</span>
        </span>
        <span className="text-[8px] font-semibold text-ink-muted">match</span>
      </span>
      <span className="sr-only">{nota}% de match com o seu currículo</span>
    </span>
  );
}

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
      title={explicarMatch(match)}
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
          {a.emParte > 0 && (
            <>
              , e <strong>{a.emParte}</strong> em parte
            </>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-body-sm text-ink-muted">
          <span className="hidden sm:inline sm:group-open/match:hidden">Ver o porquê</span>
          <ChevronDown aria-hidden className="size-4 transition-transform group-open/match:rotate-180" />
        </span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-line px-4 py-3 sm:px-5">
        <CriteriosDaAderencia a={a} />
        <p className="text-body-sm text-ink-muted">
          {motivoDoTeto(a) && `${motivoDoTeto(a)} `}A conta compara o que a vaga pede com o seu currículo e o bairro
          do seu perfil
          {semConta > 0 && ` (${itens(semConta)} sem informação no currículo ficam de fora)`}. A função vale mais
          {a.perfil === "entrada" && " (nesta vaga, que aceita quem está começando, quem não tem experiência na função fica em até 79%)"}
          , o que bate em parte conta em parte e os itens com “+” só somam.{" "}
          <Link href="/perfil/curriculo" className="font-semibold text-terra-text underline underline-offset-2">
            Atualizar meu currículo
          </Link>
        </p>
      </div>
    </details>
  );
}
