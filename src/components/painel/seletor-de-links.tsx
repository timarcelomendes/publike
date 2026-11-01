"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Seletor } from "../ui/campo";

/**
 * Uma escolha numa lista que fecha (o cliente, a ordem): cada opção é um endereço da página. Fica no lugar de uma
 * fileira de pílulas, para os filtros pesarem menos (claude/plano-fluxo-contratar.md).
 */
export function SeletorDeLinks({
  rotulo,
  opcoes,
  atual,
}: {
  rotulo: string;
  opcoes: { nome: string; href: string }[];
  /** o endereço da opção escolhida */
  atual: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <Seletor
      aria-label={rotulo}
      value={atual}
      disabled={pendente}
      onChange={(e) => iniciar(() => router.push(e.target.value, { scroll: false }))}
      envoltorio="min-w-0 shrink-0"
      className="field-sizing-content min-h-10 max-w-full rounded-pill border border-line bg-transparent pl-4 text-label text-ink transition-colors hover:bg-surface-300 disabled:opacity-60"
    >
      {opcoes.map((o) => (
        <option key={o.href} value={o.href}>
          {o.nome}
        </option>
      ))}
    </Seletor>
  );
}
