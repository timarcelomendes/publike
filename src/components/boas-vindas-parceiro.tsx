"use client";

import { ArrowRight, Briefcase, Store, Wrench, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Simbolo } from "./ui/basicos";
import { Botao } from "./ui/botao";

// Boas-vindas na primeira visita: o Publike é parceiro de quem trabalha e de
// quem contrata, e é sempre grátis. Aparece uma vez por navegador; o aviso de
// cookies espera ele fechar (e o convite de instalar o app espera o de cookies).
// Na página inicial, quem dá as boas-vindas é a pergunta "O que você quer fazer no
// Publike?" (FolhaIntencao): uma janela só. Fechada a pergunta, as boas-vindas contam como vistas.

const CHAVE = "publike_boas_vindas";
const VERSAO = "1";
export const EVENTO_BOAS_VINDAS = "publike:boas-vindas";

// Páginas onde a pessoa já sabe o que veio fazer (ou que são da equipe): sem aviso. As listas de vagas
// (/vagas/goiania/alimentacao) são a entrada dos anúncios do Google: a lista aparece sem nada por cima.
const SEM_AVISO = /^\/(admin|auth|avisos|entrar|perfil|painel|publicar|anuncio\/|email|versao|vagas\/)/;

function jaViu() {
  try {
    return window.localStorage.getItem(CHAVE) === VERSAO;
  } catch {
    // sem armazenamento, o aviso voltaria a cada página: melhor não mostrar
    return true;
  }
}

/** A pergunta da primeira visita está aberta (na página inicial, ela faz as vezes das boas-vindas). */
let perguntaAberta = false;

/** A pergunta "O que você quer fazer?" abriu ou fechou: fechada, as boas-vindas contam como vistas. */
export function avisarPerguntaAberta(aberta: boolean) {
  perguntaAberta = aberta;
  if (!aberta) {
    try {
      window.localStorage.setItem(CHAVE, VERSAO);
    } catch {
      // sem armazenamento: nada a guardar
    }
  }
  window.dispatchEvent(new Event(EVENTO_BOAS_VINDAS));
}

/** Para o aviso de cookies esperar as boas-vindas (ou a pergunta da página inicial) fecharem. */
export function esperandoBoasVindas(caminho: string) {
  return perguntaAberta || (!SEM_AVISO.test(caminho) && !jaViu());
}

function comPerguntaAberta() {
  return perguntaAberta;
}

/** Na página inicial, a pergunta chega com os anúncios: as boas-vindas esperam um pouco por ela. */
const ESPERA_NA_INICIAL = 2500;

export function assinarBoasVindas(avisar: () => void) {
  return assinar(avisar);
}

function assinar(avisar: () => void) {
  window.addEventListener(EVENTO_BOAS_VINDAS, avisar);
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(EVENTO_BOAS_VINDAS, avisar);
    window.removeEventListener("storage", avisar);
  };
}

const PARA_QUEM = [
  {
    icone: Briefcase,
    titulo: "Para quem procura trabalho",
    texto: "Vagas com carteira, diárias e freelances perto de casa, com a distância e o tempo de ônibus.",
    acao: "Ver vagas",
    href: "/?tipo=vaga",
  },
  {
    icone: Wrench,
    titulo: "Para quem presta serviço",
    texto: "Vitrine para diarista, pedreiro, manicure, eletricista. Quem mora perto chama você no WhatsApp.",
    acao: "Montar minha vitrine",
    href: "/profissionais",
  },
  {
    icone: Store,
    titulo: "Para quem contrata",
    texto: "Comércio, empresa, agência ou família: publique a vaga e receba candidatos do bairro.",
    acao: "Publicar uma vaga",
    href: "/publicar",
  },
];

export function BoasVindasParceiro() {
  const caminho = usePathname() ?? "/";
  // no servidor (e antes de ler o navegador) não aparece: nada pisca para quem já viu
  const visto = useSyncExternalStore(assinar, jaViu, () => true);
  const pergunta = useSyncExternalStore(assinar, comPerguntaAberta, () => false);
  const dialogo = useRef<HTMLDialogElement>(null);
  // na inicial, só se a pergunta não aparecer (sem anúncios, por exemplo)
  const naInicial = caminho === "/";
  const [esperouEm, setEsperouEm] = useState<string | null>(null);
  useEffect(() => {
    if (!naInicial) return;
    const t = window.setTimeout(() => setEsperouEm(caminho), ESPERA_NA_INICIAL);
    return () => window.clearTimeout(t);
  }, [naInicial, caminho]);
  const mostrar = !visto && !pergunta && !SEM_AVISO.test(caminho) && (!naInicial || esperouEm === caminho);

  useEffect(() => {
    const d = dialogo.current;
    if (mostrar && d && !d.open) d.showModal();
  }, [mostrar]);

  function fechar() {
    try {
      window.localStorage.setItem(CHAVE, VERSAO);
    } catch {
      // sem armazenamento: nada a guardar
    }
    dialogo.current?.close();
    window.dispatchEvent(new Event(EVENTO_BOAS_VINDAS));
  }

  if (!mostrar) return null;

  return (
    <dialog
      ref={dialogo}
      aria-labelledby="boas-vindas-titulo"
      aria-describedby="boas-vindas-texto"
      onCancel={fechar}
      onClick={(e) => {
        // toque fora do quadro fecha
        if (e.target === e.currentTarget) fechar();
      }}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-lg border border-line-strong bg-surface-200 p-0 text-ink shadow-raised backdrop:bg-veu sm:m-auto sm:max-w-xl sm:rounded-lg"
    >
      <div className="flex flex-col gap-5 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Simbolo altura={36} />
            <span className="rounded-pill bg-ipe px-2.5 py-1 text-caption text-on-ipe uppercase">Grátis, sempre</span>
          </div>
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar"
            className="-mt-1 -mr-1 inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>

        <div>
          <h2 id="boas-vindas-titulo" className="text-h2 text-balance">
            O Publike é seu parceiro de trabalho
          </h2>
          <p id="boas-vindas-texto" className="mt-2 text-body text-ink-muted">
            Um mural de trabalho que liga quem precisa de alguém a quem quer trabalhar, perto de casa. Sem plano, sem
            taxa por candidato e sem comissão.
          </p>
        </div>

        <ul className="flex flex-col gap-2">
          {PARA_QUEM.map(({ icone: Icone, titulo, texto, acao, href }) => (
            <li key={href}>
              <Link
                href={href}
                onClick={fechar}
                className="group flex items-start gap-3 rounded-md border border-line bg-surface-100 p-3.5 transition-colors hover:border-line-strong"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-terra-soft text-terra-text">
                  <Icone aria-hidden className="size-5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-label">{titulo}</span>
                  <span className="text-body-sm text-ink-muted">{texto}</span>
                  <span className="mt-1 inline-flex items-center gap-1 text-label text-terra-text">
                    {acao}
                    <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/gratis"
            onClick={fechar}
            className="text-center text-label text-ink-muted underline underline-offset-2 hover:text-ink"
          >
            Por que é grátis?
          </Link>
          <Botao variante="primario" onClick={fechar}>
            Começar
          </Botao>
        </div>
      </div>
    </dialog>
  );
}
