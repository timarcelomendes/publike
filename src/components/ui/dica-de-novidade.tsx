"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { avisoDeCookiesFechado } from "@/components/aviso-cookies";
import { esperandoBoasVindas } from "@/components/boas-vindas-parceiro";
import { dicasJaVistas, marcarDica } from "@/lib/acoes/dicas";
import { DICAS, dicaLigada, ordemDaDica, type ChaveDica } from "@/lib/dicas";

// A dica de novidade (src/lib/dicas.ts): um balão escuro com o selo "Novo", uma frase e "Entendi", logo acima do
// botão ou do campo novo, com a seta apontando para ele (no celular e no computador). Uma dica por página: a
// primeira da lista que estiver na tela e ainda não foi vista. Não aparece com outra janela aberta (boas-vindas,
// aviso de cookies, banner, completar perfil): espera ela fechar. Some no "Entendi" ou quando a pessoa usa a
// novidade (usarDica). Com conta, fica guardado na conta (e no aparelho, para não piscar); sem conta, no aparelho.

const LOCAL = "publike_dicas_vistas";

const montadas = new Map<string, number>();
const fechadas = new Set<string>();
let vistas: Set<string> | null = null;
let carregando: Promise<void> | null = null;
let liberada = false;
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

/** Outra janela ou aviso está na tela: a dica espera. */
function outroAvisoNaTela() {
  if (typeof document === "undefined") return true;
  if (!avisoDeCookiesFechado() || esperandoBoasVindas(location.pathname)) return true;
  return Boolean(document.querySelector("dialog[open], [role='dialog'][aria-modal='true']"));
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
  const ativa = useSyncExternalStore(
    assinar,
    () => escolhida() === chave,
    () => false,
  );

  // está na tela: entra na disputa da página e lê o que já foi visto
  useEffect(() => {
    montadas.set(chave, (montadas.get(chave) ?? 0) + 1);
    carregar(logado);
    avisar();
    return () => {
      const n = (montadas.get(chave) ?? 1) - 1;
      if (n > 0) montadas.set(chave, n);
      else montadas.delete(chave);
      avisar();
    };
  }, [chave, logado]);

  // espera a página assentar e as outras janelas fecharem
  useEffect(() => {
    liberada = false;
    let parar = false;
    let espera = 0;
    const tentar = () => {
      if (parar) return;
      if (outroAvisoNaTela()) {
        espera = window.setTimeout(tentar, 1500);
        return;
      }
      liberada = true;
      avisar();
    };
    espera = window.setTimeout(tentar, 1200);
    return () => {
      parar = true;
      window.clearTimeout(espera);
    };
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
