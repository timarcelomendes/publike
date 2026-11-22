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
    // abas de sublinhado (22/11/2026, Marcelo: "mudar o visual"), discretas sobre a linha de baixo; relative: o texto só
    // para leitores de tela fica dentro da faixa que rola, sem alargar a página no celular
    <nav
      aria-label={rotulo}
      className="sem-barra relative -mx-4 flex gap-6 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0"
    >
      {abas.map(({ id, nome, icone: Icone, alerta }, i) => {
        const atual = id === ativa;
        return (
          <Link
            key={id}
            href={i === 0 ? base : `${base}?aba=${id}`}
            scroll={false}
            aria-current={atual ? "page" : undefined}
            className={`relative inline-flex min-h-11 shrink-0 items-center gap-2 text-label transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-[3px] after:rounded-full ${
              atual ? "text-ink after:bg-terra" : "text-ink-muted after:bg-transparent hover:text-ink hover:after:bg-line-strong"
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
