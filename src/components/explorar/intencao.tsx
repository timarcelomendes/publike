"use client";

import { ArrowRight, Briefcase, FileUser, HandHelping, UserSearch, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { salvarIntencao } from "@/lib/acoes/intencao";
import { avisarPerguntaAberta } from "../boas-vindas-parceiro";
import { Selo, Simbolo } from "../ui/basicos";
import { INTENCAO_EM_DESTAQUE, INTENCOES, PAGINA_DA_INTENCAO, VOCE, type Intencao } from "@/lib/intencao";
import { PRACA_PADRAO } from "@/lib/pracas";

// "O que você quer fazer no Publike?"
//   1ª visita: FolhaIntencao, numa janela (depois vem o "Onde você mora?"); "Agora não" deixa
//   para a próxima visita.
//   Depois: FaixaIntencao ("Você procura trabalho  Mudar"), com o próximo passo que faz
//   sentido para a resposta (currículo, vitrine, publicar).
// Os dois ficam em cima da lista de anúncios (PerguntasNaLista), sem partir a lista no meio.
// A resposta escolhe a aba da busca (Procuro funcionário abre a aba Talentos), mas não é um
// filtro: quem filtra são as abas, e por isso a pergunta não fica na barra da busca.

export const ICONES_INTENCAO: Record<Intencao, LucideIcon> = {
  trabalho: Briefcase,
  contratar_servico: Wrench,
  oferecer_servico: HandHelping,
  contratar_pessoa: UserSearch,
  talento: FileUser,
};

/** O próximo passo de quem respondeu (vem do servidor: depende da conta). */
export type ProximoPasso = { texto: string; href: string } | null;

/**
 * Guarda a resposta (na conta ou nesta visita) e avisa quem chamou (a busca troca de aba).
 * A resposta que abre outra página (Procuro funcionário → aba Talentos) vai para lá depois de
 * guardada, para a página já saber dela. `tocada` é a resposta que a pessoa acabou de tocar,
 * antes de o servidor confirmar.
 */
function useEscolher(aoEscolher?: (i: Intencao) => void) {
  const router = useRouter();
  const [tocada, setTocada] = useState<Intencao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  function escolher(i: Intencao) {
    setTocada(i);
    setErro(null);
    const pagina = PAGINA_DA_INTENCAO[i];
    iniciar(async () => {
      const r = await chamarAcao(() => salvarIntencao(i));
      // não guardou: a resposta desmarca e o quadro diz por quê (e continua aberto)
      if (!r.ok) {
        setTocada(null);
        setErro(r.erro);
        return;
      }
      if (pagina) router.push(pagina);
      else aoEscolher?.(i);
    });
  }
  return { tocada, escolher, pendente, erro };
}

/**
 * As respostas. Medem o próprio quadro (container query), porque ele fica no meio dos
 * anúncios e muda de largura com o jeito de ver: estreito (celular), 2 × 2 só com o nome
 * curto; médio, 2 × 2 com o nome inteiro e a ajuda; largo, uma linha de 4. O cadastro na aba
 * Talentos vem por último, na linha inteira, com o selo "Novo" e sempre com a ajuda.
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
          const destaque = op.valor === INTENCAO_EM_DESTAQUE;
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
              } ${destaque ? "col-span-2 gap-3 px-3 py-2 @3xl:col-span-4" : ""}`}
            >
              <Icone
                aria-hidden
                className={`shrink-0 ${destaque ? "size-5" : "size-4 @md:size-5"} ${ativa ? "text-terra-text" : "text-ink-muted"}`}
              />
              {destaque ? (
                <span className="flex min-w-0 flex-col">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-label">
                    {op.nome}
                    <Selo variante="novo" className="px-2 py-0.5">
                      Novo
                    </Selo>
                  </span>
                  <span className="text-body-sm text-ink-muted">{op.ajuda}</span>
                </span>
              ) : (
                <span className="flex min-w-0 flex-col">
                  <span className="text-label leading-tight @md:leading-[inherit]">
                    <span className="@md:hidden">{op.curto}</span>
                    <span className="hidden @md:inline">{op.nome}</span>
                  </span>
                  <span className="hidden text-body-sm text-ink-muted @md:block">{op.ajuda}</span>
                </span>
              )}
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

const noCliente = () => () => {};

/**
 * Primeira visita: a pergunta numa janela por cima da página (folha de baixo no celular,
 * caixa no meio no computador), para ninguém deixar de ver. O topo da página continua leve.
 * "Agora não" (ou Esc, ou tocar fora) fecha; a pergunta volta na próxima visita.
 */
export function FolhaIntencao({
  aoEscolher,
  aoAdiar,
  atual = null,
  primeiraVisita = false,
  cidade = PRACA_PADRAO.cidade,
}: {
  aoEscolher: (i: Intencao) => void;
  aoAdiar: () => void;
  /** a cidade de quem vê, para a apresentação da primeira visita */
  cidade?: string;
  /** a resposta de agora, quando a janela abre para mudar */
  atual?: Intencao | null;
  /** na chegada: a janela faz as vezes das boas-vindas (grátis, o que é o Publike) */
  primeiraVisita?: boolean;
}) {
  const titulo = useId();
  const { tocada, escolher, pendente, erro } = useEscolher(aoEscolher);
  const escolhida = tocada ?? atual;
  const caixa = useRef<HTMLDivElement>(null);
  const fechar = useRef(aoAdiar);
  useEffect(() => {
    fechar.current = aoAdiar;
  });
  // só no navegador: no servidor não se sabe se a pessoa já fechou nesta visita
  const montado = useSyncExternalStore(
    noCliente,
    () => true,
    () => false,
  );

  // na chegada, é a única janela: as boas-vindas não abrem por cima (e contam como vistas ao fechar)
  useEffect(() => {
    if (!montado || !primeiraVisita) return;
    avisarPerguntaAberta(true);
    return () => avisarPerguntaAberta(false);
  }, [montado, primeiraVisita]);

  useEffect(() => {
    if (!montado) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // o foco vai para a janela (não para uma opção, que pareceria já escolhida)
    caixa.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fechar.current();
    document.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = antes;
      document.removeEventListener("keydown", esc);
    };
  }, [montado]);

  if (!montado) return null;
  // no corpo da página: dentro de uma faixa que rola, a janela ficaria cortada
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-veu sm:items-center sm:p-6"
      onClick={(e) => e.target === e.currentTarget && aoAdiar()}
    >
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titulo}
        tabIndex={-1}
        className="flex w-full flex-col gap-3 rounded-t-lg border border-line-strong outline-none bg-surface-200 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-raised sm:max-w-2xl sm:rounded-lg sm:p-6"
      >
        {primeiraVisita && (
          <div className="flex items-center gap-3">
            <Simbolo altura={28} />
            <span className="rounded-pill bg-ipe px-2.5 py-1 text-caption text-on-ipe uppercase">Grátis, sempre</span>
          </div>
        )}
        <div>
          <h2 id={titulo} className="text-h3">
            O que você quer fazer no Publike?
          </h2>
          <p className="mt-0.5 text-body-sm text-ink-muted">
            {primeiraVisita
              ? `Um mural de trabalho de ${cidade} e região, perto de casa: sem plano, sem taxa e sem comissão. Escolha e a busca já abre no que interessa a você.`
              : "Assim a busca já abre no que interessa a você."}
          </p>
        </div>
        <OpcoesIntencao rotuladoPor={titulo} escolhida={escolhida} pendente={pendente} escolher={escolher} />
        {erro && (
          <p role="alert" className="text-center text-body-sm text-danger">
            {erro}
          </p>
        )}
        <div className="flex items-center justify-center gap-5">
          <button type="button" onClick={aoAdiar} className={classesAgoraNao}>
            {atual ? "Manter como está" : "Agora não"}
          </button>
          {primeiraVisita && (
            <Link href="/gratis" className={classesAgoraNao}>
              Por que é grátis?
            </Link>
          )}
        </div>
      </div>
    </div>,
    document.body,
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
  const { tocada, escolher, pendente, erro } = useEscolher((i) => {
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
          {erro && (
            <p role="alert" className="text-body-sm text-danger">
              {erro}
            </p>
          )}
          <button type="button" onClick={() => setAberta(false)} className={`${classesAgoraNao} self-start`}>
            Manter como está
          </button>
        </div>
      )}
    </div>
  );
}
