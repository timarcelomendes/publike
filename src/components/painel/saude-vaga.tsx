import { Check, ChevronDown, X } from "lucide-react";
import Link from "next/link";
import type { Saude } from "@/lib/saude-vaga";

const NIVEIS = {
  boa: { nome: "Saúde boa", barra: "bg-cerrado", texto: "text-cerrado-text" },
  atencao: { nome: "Pede atenção", barra: "bg-ipe", texto: "text-ink" },
  fraca: { nome: "Precisa de ajustes", barra: "bg-terra", texto: "text-terra-text" },
} as const;

/** "Saúde boa", "Pede atenção"… com a cor do nível (cartão da vaga no Hoje). */
export function NivelDaSaude({ s }: { s: Saude }) {
  const n = NIVEIS[s.nivel];
  return (
    <span className={`inline-flex items-center gap-1.5 text-body-sm font-semibold ${n.texto}`}>
      <span aria-hidden className={`size-2 rounded-pill ${n.barra}`} />
      {n.nome}
    </span>
  );
}

/** A saúde da vaga no quadro, fechada numa linha: a nota e a primeira dica; aberta, o que falta, com o link para resolver. */
export function SaudeDaVaga({ s }: { s: Saude }) {
  const n = NIVEIS[s.nivel];
  return (
    // fechada: os candidatos vêm primeiro; o que falta abre num toque
    <details className="group rounded-lg border border-line bg-surface-200">
      <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="text-h3">Saúde da vaga</span>
        <span className="flex items-center gap-2">
          <span aria-hidden className="flex h-2 w-24 overflow-hidden rounded-pill bg-surface-300">
            <span className={n.barra} style={{ width: `${s.nota}%` }} />
          </span>
          <span className={`text-label tabular-nums ${n.texto}`}>
            {s.nota}% · {n.nome}
          </span>
        </span>
        {s.faltando[0] && (
          <span className="basis-full text-body-sm text-ink-muted sm:basis-auto sm:flex-1">{s.faltando[0].dica}</span>
        )}
        <ChevronDown aria-hidden className="ml-auto size-5 text-ink-muted transition-transform group-open:rotate-180" />
      </summary>
      <ul className="flex flex-col divide-y divide-line border-t border-line">
        {[...s.faltando, ...s.itens.filter((i) => i.ok)].map((i) => (
          <li key={i.chave} className="flex items-start gap-3 px-4 py-2.5 sm:px-5">
            {i.ok ? (
              <Check aria-label="Em dia" className="mt-0.5 size-5 shrink-0 text-cerrado-text" />
            ) : (
              <X aria-label="Falta" className="mt-0.5 size-5 shrink-0 text-terra-text" />
            )}
            <span className="min-w-0 flex-1 text-body-sm">
              <span className="font-semibold">{i.titulo}</span>
              {!i.ok && <span className="block text-ink-muted">{i.dica}</span>}
            </span>
            {!i.ok && (
              <Link href={i.href} className="shrink-0 text-label underline underline-offset-2 hover:text-terra-text">
                Resolver
              </Link>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * A saúde no alto da vaga, ao lado do estado (claude/plano-painel-simples.md, parte 3): uma etiqueta com o
 * nível e a nota; tocar abre o que falta, com o link para resolver. Os candidatos vêm logo depois.
 */
export function EtiquetaDaSaude({ s }: { s: Saude }) {
  const n = NIVEIS[s.nivel];
  const itens = [...s.faltando, ...s.itens.filter((i) => i.ok)];
  return (
    // no celular, a janela abre a partir do começo da linha (a linha de cima é a referência): presa à etiqueta,
    // ela passava da borda direita da tela
    <details className="group max-sm:static sm:relative">
      <summary
        className={`inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-pill border border-line-strong bg-surface-200 px-2.5 text-body-sm font-semibold hover:bg-surface-300 [&::-webkit-details-marker]:hidden ${n.texto}`}
      >
        <span aria-hidden className={`size-2 rounded-pill ${n.barra}`} />
        <span>
          {n.nome} <span className="tabular-nums">· {s.nota}%</span>
          <span className="sr-only">: a saúde da vaga. Abrir o que falta</span>
        </span>
        <ChevronDown aria-hidden className="size-4 text-ink-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute left-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-md border border-line bg-surface-200 shadow-card">
        <p className="border-b border-line px-4 py-2.5 text-label">Saúde da vaga</p>
        <ul className="flex max-h-80 flex-col divide-y divide-line overflow-y-auto">
          {itens.map((i) => (
            <li key={i.chave} className="flex items-start gap-3 px-4 py-2.5">
              {i.ok ? (
                <Check aria-label="Em dia" className="mt-0.5 size-5 shrink-0 text-cerrado-text" />
              ) : (
                <X aria-label="Falta" className="mt-0.5 size-5 shrink-0 text-terra-text" />
              )}
              <span className="min-w-0 flex-1 text-body-sm">
                <span className="font-semibold text-ink">{i.titulo}</span>
                {!i.ok && <span className="block font-normal text-ink-muted">{i.dica}</span>}
              </span>
              {!i.ok && (
                <Link
                  href={i.href}
                  className="shrink-0 text-label text-ink underline underline-offset-2 hover:text-terra-text"
                >
                  Resolver
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
