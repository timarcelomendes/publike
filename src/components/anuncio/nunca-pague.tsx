import { ShieldCheck } from "lucide-react";
import Link from "next/link";

/** Perto do Curtir da vaga e no balão de depois de curtir: vaga de verdade não cobra nada. */
export function NuncaPague({ className = "" }: { className?: string }) {
  return (
    <p className={`flex items-start gap-1.5 text-body-sm text-ink-muted ${className}`}>
      <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>
        Vaga de verdade não cobra nada. Nunca pague para trabalhar.{" "}
        <Link href="/conteudos/golpe-de-emprego-como-evitar" className="underline underline-offset-2 hover:text-ink">
          Como evitar golpe
        </Link>
      </span>
    </p>
  );
}
