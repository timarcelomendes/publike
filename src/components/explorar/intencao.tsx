"use client";

import { ArrowRight, Briefcase, HandHelping, UserPlus, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { salvarIntencao } from "@/lib/acoes/intencao";
import { INTENCOES, VOCE, type Intencao } from "@/lib/intencao";

// "O que você quer fazer no Publike?"
//   1ª visita: CartaoIntencao (depois vem o "Onde você mora?").
//   Depois: FaixaIntencao ("Você procura trabalho  Mudar"), com o próximo passo que faz
//   sentido para a resposta (currículo, vitrine, publicar).
// Os dois ficam no meio dos anúncios, depois dos dois primeiros (PerguntasNaLista): em cima
// da lista, só a busca. A resposta escolhe a aba da busca, mas não é um filtro.

export const ICONES_INTENCAO: Record<Intencao, LucideIcon> = {
  trabalho: Briefcase,
  contratar_servico: Wrench,
  oferecer_servico: HandHelping,
  contratar_pessoa: UserPlus,
};

/** O próximo passo de quem respondeu (vem do servidor: depende da conta). */
export type ProximoPasso = { texto: string; href: string } | null;

/**
 * Guarda a resposta (na conta ou nesta visita) e avisa quem chamou (a busca troca de aba).
 * `tocada` é a resposta que a pessoa acabou de tocar, antes de o servidor confirmar.
 */
function useEscolher(aoEscolher?: (i: Intencao) => void) {
  const [tocada, setTocada] = useState<Intencao | null>(null);
  const [pendente, iniciar] = useTransition();
  function escolher(i: Intencao) {
    setTocada(i);
    aoEscolher?.(i);
    iniciar(async () => {
      await salvarIntencao(i);
    });
  }
  return { tocada, escolher, pendente };
}

/**
 * As quatro respostas. Medem o próprio quadro (container query), porque ele fica no meio
 * dos anúncios e muda de largura com o jeito de ver: estreito (celular), 2 × 2 só com o
 * nome curto; médio, 2 × 2 com o nome inteiro e a ajuda; largo, uma linha de 4.
 */
function OpcoesIntencao({
  rotuladoPor,
  escolhida,
  pendente,
  escolher,
}: {
  rotuladoPor: string;
  escolhida: Intencao | null;
  pendente: boolean;
  escolher: (i: Intencao) => void;
}) {
  return (
    <div className="@container">
      <div role="radiogroup" aria-labelledby={rotuladoPor} className="grid grid-cols-2 gap-2 @3xl:grid-cols-4">
        {INTENCOES.map((op) => {
          const Icone = ICONES_INTENCAO[op.valor];
          const ativa = escolhida === op.valor;
          return (
            <button
              key={op.valor}
              type="button"
              role="radio"
              aria-checked={ativa}
              disabled={pendente}
              onClick={() => escolher(op.valor)}
              className={`flex min-h-12 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors disabled:opacity-70 @md:gap-3 @md:px-3 @md:py-2 ${
                ativa ? "border-ink bg-surface-300" : "border-line-strong bg-surface-200 hover:bg-surface-300"
              }`}
            >
              <Icone
                aria-hidden
                className={`size-4 shrink-0 @md:size-5 ${ativa ? "text-terra-text" : "text-ink-muted"}`}
              />
              <span className="flex min-w-0 flex-col">
                <span className="text-label leading-tight @md:leading-[inherit]">
                  <span className="@md:hidden">{op.curto}</span>
                  <span className="hidden @md:inline">{op.nome}</span>
                </span>
                <span className="hidden text-body-sm text-ink-muted @md:block">{op.ajuda}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** "Agora não" das perguntas da primeira visita: um link no canto, sem disputar com as respostas. */
export const classesAgoraNao =
  "inline-flex min-h-10 shrink-0 items-center text-body-sm text-ink-muted underline underline-offset-2 hover:text-ink disabled:opacity-60";

/** Primeira visita: a pergunta, num quadro no meio dos anúncios. */
export function CartaoIntencao({ aoEscolher, aoAdiar }: { aoEscolher: (i: Intencao) => void; aoAdiar: () => void }) {
  const titulo = useId();
  const { tocada: escolhida, escolher, pendente } = useEscolher(aoEscolher);
  return (
    <section
      aria-labelledby={titulo}
      className="flex flex-col gap-2 rounded-lg border border-line-strong bg-surface-200 p-3 shadow-card sm:gap-3 sm:p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={titulo} className="text-label sm:text-h3">
            O que você quer fazer no Publike?
          </h2>
          <p className="text-body-sm text-ink-muted">Assim a busca já abre no que interessa a você.</p>
        </div>
        <button type="button" onClick={aoAdiar} className={classesAgoraNao}>
          Agora não
        </button>
      </div>
      <OpcoesIntencao rotuladoPor={titulo} escolhida={escolhida} pendente={pendente} escolher={escolher} />
    </section>
  );
}

/**
 * A resposta, numa linha curta, com "Mudar" ao lado e o próximo passo. Aparece no meio dos
 * anúncios quando há um próximo passo para a resposta.
 */
export function FaixaIntencao({
  intencao,
  proximoPasso,
  aoEscolher,
}: {
  intencao: Intencao;
  proximoPasso: ProximoPasso;
  aoEscolher: (i: Intencao) => void;
}) {
  const [aberta, setAberta] = useState(false);
  const titulo = useId();
  const pergunta = useId();
  const opcoes = useId();
  const { tocada, escolher, pendente } = useEscolher((i) => {
    setAberta(false);
    aoEscolher(i);
  });
  // a resposta que vale: a que acabou de ser tocada, ou a que veio do servidor
  const escolhida = tocada ?? intencao;
  // o próximo passo vem do servidor para a resposta dele: some até ele confirmar a nova
  const passo = escolhida === intencao && !pendente ? proximoPasso : null;
  const Icone = ICONES_INTENCAO[escolhida];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 text-body-sm">
        <p id={titulo} className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-ink">
          <Icone aria-hidden className="size-4 shrink-0 text-terra-text" />
          {VOCE[escolhida]}
        </p>
        <button
          type="button"
          aria-expanded={aberta}
          aria-controls={opcoes}
          aria-label={`Mudar: ${VOCE[escolhida]}`}
          onClick={() => setAberta((a) => !a)}
          className="inline-flex min-h-9 items-center text-ink-muted underline underline-offset-2 hover:text-ink"
        >
          Mudar
        </button>
        {passo && !aberta && (
          <Link
            href={passo.href}
            className="inline-flex min-h-9 items-center gap-1 font-semibold text-terra-text underline-offset-2 hover:underline"
          >
            {passo.texto}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        )}
      </div>
      {aberta && (
        <div
          id={opcoes}
          className="flex flex-col gap-2 rounded-lg border border-line-strong bg-surface-200 p-3 shadow-card sm:p-4"
        >
          <p id={pergunta} className="text-label">
            O que você quer fazer no Publike?
          </p>
          <OpcoesIntencao rotuladoPor={pergunta} escolhida={escolhida} pendente={pendente} escolher={escolher} />
          <button type="button" onClick={() => setAberta(false)} className={`${classesAgoraNao} self-start`}>
            Manter como está
          </button>
        </div>
      )}
    </div>
  );
}
