"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";
import { pedirEntrar } from "./folha-de-entrar";

// Para quem está sem conta, no cartão da vaga, no lugar do % de match (11/11/2026: chamar para entrar, "quer ver se
// combina com você?"): "?%"; o toque abre a folha de entrar e, de volta à mesma lista, cada vaga mostra o % de verdade
// (com o currículo preenchido). Sem cadeado: é grátis, e o cadeado dava a ideia de que era pago.

const DICA = "Entre grátis e veja o quanto esta vaga combina com você";

function useEntrarParaVer() {
  const router = useRouter();
  return () => {
    const proximo = `${window.location.pathname}${window.location.search}`;
    const pediu = pedirEntrar({
      proximo,
      titulo: "Veja o quanto cada vaga combina com você",
      texto: "É grátis. Depois de entrar, cada vaga mostra o % de match com o seu currículo.",
    });
    if (!pediu) router.push(`/entrar?next=${encodeURIComponent(proximo)}`);
  };
}

/** Na grade e na lista: o selo "Ver % de match", com o contorno do selo de match. */
export function SeloMatchFechado({ className = "" }: { className?: string }) {
  const entrar = useEntrarParaVer();
  return (
    <button
      type="button"
      data-funil="match"
      title={DICA}
      onClick={entrar}
      className={`relative z-10 inline-flex min-h-9 shrink-0 items-center rounded-pill border border-cerrado-text px-2.5 text-caption whitespace-nowrap text-cerrado-text uppercase transition-colors hover:bg-cerrado hover:text-on-cerrado ${className}`}
    >
      <span aria-hidden>Ver % de match</span>
      <span className="sr-only">{DICA}</span>
    </button>
  );
}

/**
 * Em Blocos, no anel do rodapé, ao lado dos botões e do tamanho deles: o arco do amarelo ao verde (as cores do match)
 * e o "%" no miolo. Ao passar o mouse no cartão (ou com o foco nele), o arco corre de 30% a 75% e a interrogação
 * aparece antes do "%" ("?%"): a pergunta de quanto a vaga combina. No celular, sem o mouse, o "?%" fica à vista. O
 * toque abre a folha de entrar.
 */
export function AnelMatchFechado() {
  const entrar = useEntrarParaVer();
  // o id do degradê, só com letras e números (o do React pode trazer sinais que o url(#...) não aceita)
  const degrade = `anel-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  // r = 20: a volta tem 125,66; o arco parado mostra 30% (o resto, 87,96, escondido) e, com o mouse, 75% (31,42)
  const raio = 20;
  const volta = 2 * Math.PI * raio;
  // o cartão é o grupo (group/cartao, em CardAnuncio); sem mouse (celular), já mostra tudo
  const comMouse =
    "group-hover/cartao:[stroke-dashoffset:31.42] group-focus-within/cartao:[stroke-dashoffset:31.42] [@media(hover:none)]:[stroke-dashoffset:31.42]";
  return (
    <button
      type="button"
      data-funil="match"
      title={DICA}
      onClick={entrar}
      className="group/anel relative z-10 flex size-11 shrink-0 rounded-pill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <svg viewBox="0 0 44 44" className="size-11" aria-hidden>
        <defs>
          <linearGradient id={degrade} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" style={{ stopColor: "var(--pk-ipe)" }} />
            <stop offset="1" style={{ stopColor: "var(--pk-cerrado)" }} />
          </linearGradient>
        </defs>
        <circle
          cx="22"
          cy="22"
          r="16.5"
          className="fill-cerrado/10 transition-colors group-hover/anel:fill-cerrado/20 motion-reduce:transition-none"
        />
        <circle cx="22" cy="22" r={raio} fill="none" stroke="var(--pk-surface-300)" strokeWidth="3" />
        <circle
          cx="22"
          cy="22"
          r={raio}
          fill="none"
          stroke={`url(#${degrade})`}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={volta}
          transform="rotate(-90 22 22)"
          className={`[stroke-dashoffset:87.96] transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none ${comMouse}`}
        />
      </svg>
      <span aria-hidden className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="flex items-baseline font-display font-bold text-cerrado-text">
          {/* a interrogação entra abrindo espaço (a coluna vai de 0 à largura dela), girando de leve */}
          <span className="inline-grid grid-cols-[0fr] transition-[grid-template-columns] duration-300 ease-out group-hover/cartao:grid-cols-[1fr] group-focus-within/cartao:grid-cols-[1fr] motion-reduce:transition-none [@media(hover:none)]:grid-cols-[1fr]">
            <span className="overflow-hidden">
              <span className="inline-block origin-bottom -rotate-30 text-[15px] opacity-0 transition duration-300 ease-out group-hover/cartao:rotate-0 group-hover/cartao:opacity-100 group-focus-within/cartao:rotate-0 group-focus-within/cartao:opacity-100 motion-reduce:transition-none [@media(hover:none)]:rotate-0 [@media(hover:none)]:opacity-100">
                ?
              </span>
            </span>
          </span>
          <span className="text-[13px] transition-[font-size] duration-300 ease-out group-hover/cartao:text-[9px] group-focus-within/cartao:text-[9px] motion-reduce:transition-none [@media(hover:none)]:text-[9px]">
            %
          </span>
        </span>
        <span className="text-[8px] font-semibold text-ink-muted">match</span>
      </span>
      <span className="sr-only">{DICA}</span>
    </button>
  );
}
