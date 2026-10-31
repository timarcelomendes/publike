import { Sparkles } from "lucide-react";
import Link from "next/link";
import { Selo } from "../ui/basicos";

/**
 * Para quem se candidata (claude/plano-triagem-automatica.md, item 5): a empresa usa a Triagem com IA. A IA compara o
 * currículo com o que a vaga pede, sem nome, foto nem contato, e quem decide é uma pessoa (LGPD, art. 20).
 */
export function AvisoTriagem() {
  return (
    <div className="mt-4 flex gap-2.5 rounded-lg border border-line bg-surface-200 p-4 text-body-sm">
      <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-terra-text" />
      <div className="flex flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 text-label">
          Esta empresa usa a Triagem com IA
          <Selo variante="novo">Novo</Selo>
        </p>
        <p className="text-ink-muted">
          A IA compara o seu currículo com o que a vaga pede, sem nome, foto nem contato. Quem decide é uma pessoa. Quer
          que uma pessoa reveja?{" "}
          <Link href="/sugerir" className="font-semibold text-ink underline underline-offset-2">
            Escreva para o Publike
          </Link>
          .{" "}
          <Link href="/privacidade#ia" className="underline underline-offset-2">
            Como funciona
          </Link>
        </p>
      </div>
    </div>
  );
}
