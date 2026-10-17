import { Check, CircleHelp, Plus, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import type { Aderencia } from "@/lib/aderencia";

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
      title={`Nota de aderência: atende ${a.atendidos} de ${itens(a.conferidos)} da vaga que deu para conferir`}
      className={`inline-flex shrink-0 items-center rounded-pill px-2 py-0.5 text-caption font-semibold tabular-nums ${cor}`}
    >
      {a.nota}%{longo && <span className="ml-1 font-normal">de aderência</span>}
    </span>
  );
}

/** O porquê da nota: cada coisa que a vaga pede, com o que a pessoa tem. */
export function CriteriosDaAderencia({ a }: { a: Aderencia }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {a.criterios.map((k) => (
        <li key={k.nome} className="flex items-start gap-2 text-body-sm">
          {k.extra ? (
            <Plus aria-label="Ponto a mais" className="mt-0.5 size-4 shrink-0 text-cerrado-text" />
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

/**
 * Os itens e a conta da nota ("atende 3 de 4 itens"), com o que entra nela. Com poucos
 * itens para comparar, a dica de dizer mais na vaga (`editarVaga`: o link do editar).
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
            {semConta > 0 && ` (${itens(semConta)} sem informação ficam fora da conta)`}.
          </>
        ) : (
          "Nada que dê para conferir ainda: falta currículo ou resposta."
        )}
      </p>
      {a.criterios.length > 0 && <CriteriosDaAderencia a={a} />}
      <p className="text-body-sm text-ink-muted">
        Entra o que a vaga pede comparado com o currículo, o perfil e as respostas: escolaridade, experiência (tempo e
        função), CNH, horário, onde mora e as perguntas com a resposta que você procura. Os itens com “+” só somam. A
        descrição da vaga não é lida, só os cursos que ela cita.
      </p>
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
