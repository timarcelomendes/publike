"use client";

import { ArrowRight, Briefcase, Compass, HandHelping, UserPlus, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { salvarIntencao } from "@/lib/acoes/intencao";
import { INTENCOES, VOCE, type Intencao } from "@/lib/intencao";
import { classesBotao } from "../ui/botao";

// "O que você quer fazer no Publike?"
//   1ª visita: CartaoIntencao, acima da busca (passo 1 de 2; o 2 é o "Onde você mora?").
//   Depois: FaixaIntencao, uma linha acima das abas ("Você procura trabalho · Mudar"),
//   com o próximo passo que faz sentido para a resposta (currículo, vitrine, publicar).
// A resposta escolhe a aba da busca, mas não é um filtro: por isso não fica junto do bairro.

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

/** As quatro respostas, em botões grandes (2 × 2 no computador). */
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
    <div role="radiogroup" aria-labelledby={rotuladoPor} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
            className={`flex min-h-14 items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-70 ${
              ativa ? "border-ink bg-surface-300" : "border-line-strong bg-surface-200 hover:bg-surface-300"
            }`}
          >
            <Icone aria-hidden className={`size-5 shrink-0 ${ativa ? "text-terra-text" : "text-ink-muted"}`} />
            <span className="flex flex-col">
              <span className="text-label">{op.nome}</span>
              <span className="text-body-sm text-ink-muted">{op.ajuda}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Rótulo "Passo 1 de 2" das perguntas da primeira visita. */
export function Passo({ n, de }: { n: number; de: number }) {
  if (de < 2) return null;
  return (
    <p className="text-caption text-ink-muted uppercase">
      Passo {n} de {de}
    </p>
  );
}

/** Primeira visita: a pergunta, acima da busca. */
export function CartaoIntencao({
  passos,
  aoEscolher,
  aoAdiar,
}: {
  /** quantas perguntas há nesta visita (2 quando o "Onde você mora?" vem depois) */
  passos: number;
  aoEscolher: (i: Intencao) => void;
  aoAdiar: () => void;
}) {
  const titulo = useId();
  const { tocada: escolhida, escolher, pendente } = useEscolher(aoEscolher);
  return (
    <section
      aria-labelledby={titulo}
      className="flex flex-col gap-3 rounded-lg border border-line-strong bg-surface-200 p-4 shadow-card sm:p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <Passo n={1} de={passos} />
          <h2 id={titulo} className="text-h3">
            O que você quer fazer no Publike?
          </h2>
          <p className="mt-0.5 text-body-sm text-ink-muted">Assim a busca já abre no que interessa a você.</p>
        </div>
        {/* no computador fica no canto; no celular, depois das opções */}
        <button
          type="button"
          onClick={aoAdiar}
          className="hidden min-h-10 shrink-0 text-body-sm text-ink-muted underline underline-offset-2 hover:text-ink sm:block"
        >
          Agora não
        </button>
      </div>
      <OpcoesIntencao rotuladoPor={titulo} escolhida={escolhida} pendente={pendente} escolher={escolher} />
      <button
        type="button"
        onClick={aoAdiar}
        className="min-h-10 self-start text-body-sm text-ink-muted underline underline-offset-2 hover:text-ink sm:hidden"
      >
        Agora não
      </button>
    </section>
  );
}

/**
 * A resposta, numa linha acima das abas, com "Mudar" ao lado e o próximo passo.
 * Sem resposta (a pessoa tocou em "Agora não"), a linha só convida a responder.
 */
export function FaixaIntencao({
  intencao,
  proximoPasso,
  aoEscolher,
}: {
  intencao: Intencao | null;
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
  const Icone = escolhida ? ICONES_INTENCAO[escolhida] : Compass;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p id={titulo} className="inline-flex min-w-0 items-center gap-2 text-label">
          <Icone aria-hidden className="size-5 shrink-0 text-terra-text" />
          {escolhida ? VOCE[escolhida] : "O que você quer fazer no Publike?"}
        </p>
        <button
          type="button"
          aria-expanded={aberta}
          aria-controls={opcoes}
          aria-label={escolhida ? `Mudar: ${VOCE[escolhida]}` : "Responder: o que você quer fazer no Publike"}
          onClick={() => setAberta((a) => !a)}
          className={`${classesBotao("secundario", "sm")} min-h-9 px-3`}
        >
          {escolhida ? "Mudar" : "Responder"}
        </button>
        {escolhida && passo && !aberta && (
          <Link
            href={passo.href}
            className="inline-flex min-h-9 items-center gap-1 text-body-sm font-semibold text-terra-text underline-offset-2 hover:underline"
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
          <button
            type="button"
            onClick={() => setAberta(false)}
            className="self-start text-body-sm text-ink-muted underline underline-offset-2 hover:text-ink"
          >
            {escolhida ? "Manter como está" : "Agora não"}
          </button>
        </div>
      )}
    </div>
  );
}
