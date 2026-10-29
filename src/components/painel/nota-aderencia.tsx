import { Check, CircleHelp, Plus, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { atendeEmParte, maisEmParte, type Aderencia } from "@/lib/aderencia";

const itens = (n: number) => `${n} ${n === 1 ? "item" : "itens"}`;

/**
 * A nota de aderência num selo: verde a partir de 80%, amarela a partir de 50%, cinza
 * abaixo disso; "Eliminado" quando a pessoa errou uma pergunta eliminatória. Sem nada
 * para comparar, não aparece. `longo`: "92% de aderência" (na lista); senão, "92%".
 */
export function NotaAderencia({ a, longo = false }: { a: Aderencia; longo?: boolean }) {
  if (a.eliminado) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-pill border border-danger px-2 py-0.5 text-caption text-danger uppercase">
        Eliminado
      </span>
    );
  }
  if (a.nota === null) return null;
  const cor =
    a.nota >= 80 ? "bg-cerrado text-on-cerrado" : a.nota >= 50 ? "bg-ipe text-on-ipe" : "bg-surface-300 text-ink";
  return (
    <span
      title={`Nota de aderência: atende ${a.atendidos} de ${itens(a.conferidos)} da vaga que deu para conferir${maisEmParte(a.emParte)}${a.teto ? ` (com poucos itens, a nota vai até ${a.teto}%)` : ""}`}
      className={`inline-flex shrink-0 items-center rounded-pill px-2 py-0.5 text-caption font-semibold tabular-nums ${cor}`}
    >
      {a.nota}%{longo && <span className="ml-1 font-normal">de aderência</span>}
    </span>
  );
}

/**
 * O item que bate em parte: o círculo preenchido no tanto que a pessoa atende (0,6: pouco mais da
 * metade). Do tamanho e do traço dos ícones ao lado.
 */
export function IconeEmParte({ parte, className = "" }: { parte: number; className?: string }) {
  const angulo = 2 * Math.PI * Math.min(Math.max(parte, 0.05), 0.95);
  const x = (8 + 6 * Math.sin(angulo)).toFixed(2);
  const y = (8 - 6 * Math.cos(angulo)).toFixed(2);
  return (
    <svg
      viewBox="0 0 16 16"
      role="img"
      aria-label={`Atende em parte (${Math.round(parte * 100)}%)`}
      className={className}
    >
      <circle cx="8" cy="8" r="6.75" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d={`M8 8V2A6 6 0 ${angulo > Math.PI ? 1 : 0} 1 ${x} ${y}Z`} fill="currentColor" />
    </svg>
  );
}

/** O porquê da nota: cada coisa que a vaga pede, com o que a pessoa tem (o que bate em parte, com o quanto). */
export function CriteriosDaAderencia({ a }: { a: Aderencia }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {a.criterios.map((k) => (
        <li key={k.nome} className="flex items-start gap-2 text-body-sm">
          {k.extra ? (
            <Plus aria-label="Ponto a mais" className="mt-0.5 size-4 shrink-0 text-cerrado-text" />
          ) : atendeEmParte(k) ? (
            <IconeEmParte parte={k.parte ?? 0} className="mt-0.5 size-4 shrink-0 text-cerrado-text" />
          ) : k.ok === true ? (
            <Check aria-label="Atende" className="mt-0.5 size-4 shrink-0 text-cerrado-text" />
          ) : k.ok === false ? (
            k.eliminatorio ? (
              <TriangleAlert aria-label="Não atende (eliminatória)" className="mt-0.5 size-4 shrink-0 text-danger" />
            ) : (
              <X aria-label="Não atende" className="mt-0.5 size-4 shrink-0 text-danger" />
            )
          ) : (
            <CircleHelp aria-label="Sem informação" className="mt-0.5 size-4 shrink-0 text-ink-muted" />
          )}
          <span>
            <span className="font-semibold">{k.nome}</span>
            <span className="text-ink-muted"> · {k.detalhe}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A conta numa linha, para a seção fechada da ficha: "atende 5 de 5 itens, e 1 em parte". */
export function linhaDaAderencia(a: Aderencia) {
  if (a.eliminado) return "respondeu diferente numa pergunta eliminatória";
  if (!a.criterios.length) return "a vaga ainda não diz o que pede";
  if (!a.conferidos) return "nada para conferir ainda";
  return `atende ${a.atendidos} de ${itens(a.conferidos)}${a.emParte > 0 ? `, e ${a.emParte} em parte` : ""}`;
}

/**
 * Os itens e a conta da nota ("atende 3 de 4 itens, e 1 em parte"), com o que entra nela. Com
 * poucos itens para comparar, o teto da nota e a dica de dizer mais na vaga (`editarVaga`: o link
 * do editar).
 */
export function DetalheDaAderencia({ a, editarVaga = null }: { a: Aderencia; editarVaga?: string | null }) {
  const semConta = a.criterios.length - a.conferidos;
  // o que a própria vaga pede (os "+" vêm do candidato)
  const pedidos = a.criterios.filter((k) => !k.extra).length;
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-body-sm">
        {a.eliminado ? (
          "Respondeu diferente numa pergunta eliminatória: a nota fica 0."
        ) : !a.criterios.length ? (
          "A vaga ainda não diz o que pede, então não há o que comparar."
        ) : a.conferidos ? (
          <>
            Atende <strong>{a.atendidos}</strong> de <strong>{itens(a.conferidos)}</strong> que deu para conferir
            {a.emParte > 0 && (
              <>
                , e <strong>{a.emParte}</strong> em parte
              </>
            )}
            {semConta > 0 && ` (${itens(semConta)} sem informação ficam fora da conta)`}.
            {a.teto && ` Com poucos itens para conferir, a nota vai até ${a.teto}%.`}
          </>
        ) : (
          "Nada que dê para conferir ainda: falta currículo ou resposta."
        )}
      </p>
      {a.criterios.length > 0 && <CriteriosDaAderencia a={a} />}
      {/* a explicação da conta é a mesma para todos: fica fechada, para não esticar a ficha */}
      <details className="text-body-sm text-ink-muted">
        <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 underline-offset-2 hover:text-ink hover:underline [&::-webkit-details-marker]:hidden">
          <CircleHelp aria-hidden className="size-4" />
          Como a nota é feita
        </summary>
        <p>
          Entra o que a vaga pede comparado com o currículo, o perfil e as respostas: escolaridade, experiência (o tempo
          e a função, que vale mais), CNH, horário, onde mora e as perguntas com a resposta que você procura. O que bate
          em parte conta em parte: uma área parecida, parte do tempo ou do horário, morar um pouco mais longe. Os itens
          com “+” só somam: as habilidades e os cursos que a vaga cita.
        </p>
      </details>
      {pedidos <= 2 && editarVaga && (
        <p className="rounded-md bg-terra-soft px-3 py-2 text-body-sm text-terra-text">
          Poucos itens para comparar.{" "}
          <Link href={editarVaga} className="font-semibold underline underline-offset-2">
            No editar da vaga
          </Link>
          , diga a experiência, a CNH, o horário e a resposta que você procura nas perguntas: a nota fica mais certeira.
        </p>
      )}
    </div>
  );
}
