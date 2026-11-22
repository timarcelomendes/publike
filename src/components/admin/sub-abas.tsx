import type { LucideIcon } from "lucide-react";
import Link from "next/link";

// As sub-abas das telas longas do admin (22/11/2026, Marcelo: "pode pensar essas telas com sub-abas, ficam muito
// extensas"): uma parte da tela por vez, na URL (`?aba=`), a primeira sem nada. O mesmo jeito das de E-mails e IA.

export type SubAba<T extends string> = {
  id: T;
  nome: string;
  icone?: LucideIcon;
  /** o que pede atenção nesta parte (retidas, contas sem aviso...): o número em destaque */
  alerta?: { n: number; leitor: string };
};

export function SubAbasAdmin<T extends string>({
  rotulo,
  base,
  abas,
  ativa,
}: {
  rotulo: string;
  /** o endereço da tela, sem `?aba=` */
  base: string;
  abas: SubAba<T>[];
  ativa: T;
}) {
  return (
    // relative: o texto só para leitores de tela fica dentro da faixa que rola, sem alargar a página no celular
    <nav aria-label={rotulo} className="sem-barra relative -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {abas.map(({ id, nome, icone: Icone, alerta }, i) => {
        const atual = id === ativa;
        return (
          <Link
            key={id}
            href={i === 0 ? base : `${base}?aba=${id}`}
            scroll={false}
            aria-current={atual ? "page" : undefined}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-pill border px-3.5 text-label transition-colors ${
              atual ? "border-ink bg-ink text-surface-100" : "border-line bg-surface-300 text-ink hover:border-line-strong"
            }`}
          >
            {Icone && <Icone aria-hidden className="size-4" />}
            {nome}
            {alerta && alerta.n > 0 && (
              <span className="rounded-pill bg-danger px-1.5 text-caption text-on-terra tabular-nums">
                {alerta.n}
                <span className="sr-only"> {alerta.leitor}</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** A aba pedida na URL, se for uma das da tela; senão, a primeira. */
export function abaPedida<T extends string>(abas: readonly { id: T }[], pedida: string | undefined): T {
  return abas.find((a) => a.id === pedida)?.id ?? abas[0].id;
}
