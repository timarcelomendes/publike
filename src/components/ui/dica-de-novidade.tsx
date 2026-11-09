"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useSyncExternalStore, type ReactNode } from "react";
import { avisoDeCookiesFechado } from "@/components/aviso-cookies";
import { esperandoBoasVindas } from "@/components/boas-vindas-parceiro";
import { dicasJaVistas, marcarDica } from "@/lib/acoes/dicas";
import { DICAS, dicaLigada, ordemDaDica, type ChaveDica } from "@/lib/dicas";

// A dica de novidade (src/lib/dicas.ts): um balão escuro com o selo "Novo", uma frase e "Entendi", logo acima do
// botão ou do campo novo, com a seta apontando para ele (no celular e no computador). Uma dica por página: a
// primeira da lista que estiver na tela e ainda não foi vista. Não aparece com outra janela aberta (boas-vindas,
// aviso de cookies, banner, completar perfil) nem com outro balão na tela (o "Curtir é se candidatar", marcado com
// data-balao-dica): espera ele fechar. Some no "Entendi" ou quando a pessoa usa a
// novidade (usarDica). Com conta, fica guardado na conta (e no aparelho, para não piscar); sem conta, no aparelho.

const LOCAL = "publike_dicas_vistas";

// as cópias na tela de cada dica, na ordem em que apareceram (no feed, a mesma dica está em vários cartões: só a
// primeira mostra o balão)
const montadas = new Map<string, string[]>();
const fechadas = new Set<string>();
let vistas: Set<string> | null = null;
let carregando: Promise<void> | null = null;
let liberada = false;
/** O vigia: de tempos em tempos, confere se a tela está livre (um só para a página toda). */
let vigia = 0;
let caminhoVigiado = "";
const ouvintes = new Set<() => void>();

function avisar() {
  for (const f of ouvintes) f();
}

function lerLocal(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function guardarLocal(chave: string) {
  try {
    const lista = new Set(lerLocal());
    lista.add(chave);
    localStorage.setItem(LOCAL, JSON.stringify([...lista].slice(-100)));
  } catch {
    // sem armazenamento: vale até recarregar
  }
}

/** Lê as dicas vistas uma vez por visita: as do aparelho e, com conta, as da conta. */
function carregar(logado: boolean) {
  if (vistas || carregando) return;
  const locais = lerLocal();
  if (!logado) {
    vistas = new Set(locais);
    avisar();
    return;
  }
  carregando = dicasJaVistas()
    .then((daConta) => {
      vistas = new Set([...locais, ...(daConta ?? [])]);
    })
    .catch(() => {
      vistas = new Set(locais);
    })
    .finally(() => {
      carregando = null;
      avisar();
    });
}

/** Outra janela, aviso ou balão está na tela: a dica espera. */
function outroAvisoNaTela() {
  if (typeof document === "undefined") return true;
  if (!avisoDeCookiesFechado() || esperandoBoasVindas(location.pathname)) return true;
  return Boolean(document.querySelector("dialog[open], [role='dialog'][aria-modal='true'], [data-balao-dica]"));
}

/** Ainda há dica para mostrar nesta página (sem nenhuma, o vigia para). */
function temCandidata() {
  return [...montadas.keys()].some((c) => dicaLigada(c) && !fechadas.has(c) && !vistas?.has(c));
}

/**
 * Confere se a tela está livre: espera a página assentar (1,2 s) e depois olha a cada segundo, enquanto houver dica
 * para mostrar. Com outro balão ou janela na tela, a dica some e volta quando ele fechar.
 */
function vigiar(caminho: string) {
  if (caminho !== caminhoVigiado) {
    caminhoVigiado = caminho;
    liberada = false;
    window.clearTimeout(vigia);
    vigia = 0;
  }
  if (vigia) return;
  const conferir = (primeira: boolean) => {
    vigia = 0;
    if (!temCandidata() && !primeira) return;
    const livre = !outroAvisoNaTela();
    if (livre !== liberada) {
      liberada = livre;
      avisar();
    }
    vigia = window.setTimeout(() => conferir(false), 1000);
  };
  vigia = window.setTimeout(() => conferir(true), 1200);
}

/** A dica desta página: a primeira da lista que está na tela e ainda não foi vista. */
function escolhida(): string | null {
  if (!vistas || !liberada) return null;
  const candidatas = [...montadas.keys()].filter((c) => dicaLigada(c) && !vistas!.has(c) && !fechadas.has(c));
  candidatas.sort((a, b) => ordemDaDica(a) - ordemDaDica(b));
  return candidatas[0] ?? null;
}

function assinar(f: () => void) {
  ouvintes.add(f);
  return () => {
    ouvintes.delete(f);
  };
}

/** A pessoa usou a novidade (comentou, mandou a indicação): a dica some e não volta. */
export function usarDica(chave: ChaveDica) {
  fechadas.add(chave);
  vistas?.add(chave);
  guardarLocal(chave);
  void marcarDica(chave, true);
  avisar();
}

const mostradas = new Set<string>();

/** Esta cópia é a que mostra a dica (a primeira da chave na tela). */
function primeiraCopia(chave: string, id: string) {
  return montadas.get(chave)?.[0] === id;
}

export function DicaDeNovidade({
  chave,
  logado,
  seta = "esquerda",
  className = "",
  children,
}: {
  chave: ChaveDica;
  logado: boolean;
  /** onde a seta aponta: o começo do botão (padrão) ou o meio */
  seta?: "esquerda" | "meio";
  className?: string;
  children: ReactNode;
}) {
  const caminho = usePathname();
  const copia = useId();
  const ativa = useSyncExternalStore(
    assinar,
    () => escolhida() === chave && primeiraCopia(chave, copia),
    () => false,
  );

  // está na tela: entra na disputa da página e lê o que já foi visto
  useEffect(() => {
    montadas.set(chave, [...(montadas.get(chave) ?? []), copia]);
    carregar(logado);
    avisar();
    return () => {
      const resto = (montadas.get(chave) ?? []).filter((x) => x !== copia);
      if (resto.length) montadas.set(chave, resto);
      else montadas.delete(chave);
      avisar();
    };
  }, [chave, logado, copia]);

  // espera a página assentar e as outras janelas e balões fecharem
  useEffect(() => {
    vigiar(caminho);
  }, [caminho]);

  // apareceu: conta como vista (uma vez por pessoa)
  useEffect(() => {
    if (!ativa || mostradas.has(chave)) return;
    mostradas.add(chave);
    guardarLocal(chave);
    if (logado) void marcarDica(chave);
  }, [ativa, chave, logado]);

  const texto = DICAS.find((d) => d.chave === chave)?.texto ?? "";

  return (
    <div className={`flex min-w-0 flex-col ${className}`}>
      {ativa && (
        <div
          role="note"
          aria-label="Novidade"
          className="relative mb-3 flex flex-col gap-2.5 rounded-md bg-ink px-4 py-3 text-surface-100 shadow-raised sm:flex-row sm:items-center sm:gap-4"
        >
          <p className="flex-1 text-body-sm">
            <span className="mr-2 inline-flex rounded-pill bg-ipe px-2 py-0.5 align-[1px] text-[12px] leading-4 font-bold text-on-ipe">
              Novo
            </span>
            {texto}
          </p>
          <button
            type="button"
            onClick={() => {
              fechadas.add(chave);
              avisar();
            }}
            className="inline-flex min-h-10 shrink-0 items-center self-start rounded-md border border-surface-100/40 px-3.5 text-label hover:bg-surface-100/10 sm:self-auto"
          >
            Entendi
          </button>
          <span
            aria-hidden
            className={`absolute -bottom-1.5 size-3 rotate-45 bg-ink ${seta === "meio" ? "left-1/2 -ml-1.5" : "left-6"}`}
          />
        </div>
      )}
      {children}
    </div>
  );
}
