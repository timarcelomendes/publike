import Link from "next/link";
import type { ReactNode } from "react";

/** Texto com **negrito** e [links](/caminho). Links para fora abrem em outra aba. */
export function TextoRico({ texto }: { texto: string }) {
  const partes: ReactNode[] = [];
  const padrao = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  while ((m = padrao.exec(texto))) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index));
    if (m[1]) {
      partes.push(
        <strong key={m.index} className="font-semibold text-ink">
          {m[1]}
        </strong>,
      );
    } else {
      const href = m[3];
      const classe = "text-terra-text underline underline-offset-2 hover:text-ink";
      partes.push(
        href.startsWith("/") ? (
          <Link key={m.index} href={href} className={classe}>
            {m[2]}
          </Link>
        ) : (
          <a key={m.index} href={href} target="_blank" rel="noopener noreferrer" className={classe}>
            {m[2]}
          </a>
        ),
      );
    }
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return <>{partes}</>;
}
