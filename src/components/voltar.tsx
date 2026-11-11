"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

/**
 * "‹ Voltar para Candidatos": de qualquer página, volta à tela de onde a pessoa veio, com o nome dela.
 * Guarda o caminho desta aba (sessionStorage): cada página nova entra no fim; voltar à anterior tira a última.
 * Trocar só os filtros ou a aba da mesma página (?aba=) não conta como outra tela. Sem tela anterior (entrou
 * direto pelo link), nas páginas do painel fica o "‹ Painel" de antes, só no celular. Na home, nada.
 */

type Tela = { caminho: string; url: string; titulo: string };

const CHAVE = "publike_trilha";
const EVENTO = "publike-trilha";
const MAXIMO = 30;

function ler(): Tela[] {
  try {
    const t = JSON.parse(sessionStorage.getItem(CHAVE) ?? "[]");
    return Array.isArray(t) ? t : [];
  } catch {
    return [];
  }
}

function gravar(trilha: Tela[]) {
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify(trilha.slice(-MAXIMO)));
  } catch {
    // sem armazenamento (aba anônima, bloqueado): o botão só não aparece
  }
  window.dispatchEvent(new Event(EVENTO));
}

/** O nome da página pelo título da aba ("Candidatos · Publike" → "Candidatos"). */
function nomeDoTitulo(titulo: string, caminho: string) {
  if (caminho === "/") return "Início";
  // a primeira página do painel tem o título "Meu painel", mas no menu ela é o "Hoje"
  if (caminho === "/painel") return "Hoje";
  // "Pagamentos · Admin · Publike" → "Pagamentos": só o nome da página, sem o site nem o "Admin"
  const nome = titulo.replace(/\s*·\s*Publike\s*$/, "").replace(/\s*·\s*Admin\s*$/, "").trim();
  return !nome || nome.startsWith("Publike") ? "" : nome;
}

// a tela anterior, como texto (o useSyncExternalStore compara por valor)
function anterior(): string {
  const t = ler();
  return t.length >= 2 ? JSON.stringify(t[t.length - 2]) : "";
}

function assinar(avisar: () => void) {
  window.addEventListener(EVENTO, avisar);
  return () => window.removeEventListener(EVENTO, avisar);
}

export function Voltar() {
  const caminho = usePathname() ?? "/";
  const busca = useSearchParams()?.toString() ?? "";
  const router = useRouter();
  const url = busca ? `${caminho}?${busca}` : caminho;

  // registra a tela: a mesma página (outra aba ou filtro) só atualiza; a anterior é "voltar"; o resto entra no fim
  useEffect(() => {
    const trilha = ler();
    const ultima = trilha[trilha.length - 1];
    const penultima = trilha[trilha.length - 2];
    if (ultima?.caminho === caminho) trilha[trilha.length - 1] = { ...ultima, url };
    else if (penultima?.caminho === caminho) trilha.pop();
    else trilha.push({ caminho, url, titulo: "" });
    gravar(trilha);
    // o título da página nova chega depois do desenho: guarda quando ele mudar
    const guardarTitulo = () => {
      const t = ler();
      const atual = t[t.length - 1];
      if (atual?.caminho !== caminho) return;
      const titulo = nomeDoTitulo(document.title, caminho);
      if (titulo && titulo !== atual.titulo) {
        t[t.length - 1] = { ...atual, titulo };
        gravar(t);
      }
    };
    const espera = window.setTimeout(guardarTitulo, 400);
    const espera2 = window.setTimeout(guardarTitulo, 1500);
    return () => {
      window.clearTimeout(espera);
      window.clearTimeout(espera2);
    };
  }, [caminho, url]);

  const texto = useSyncExternalStore(assinar, anterior, () => "");
  if (caminho === "/") return null;
  const tela: Tela | null = texto ? JSON.parse(texto) : null;

  if (!tela) {
    // entrou direto numa página do painel: o "‹ Painel" de antes, no celular (no computador, o menu faz isso)
    if (!caminho.startsWith("/painel/")) return null;
    return (
      <div className="mx-auto w-full max-w-6xl px-4 pt-3 sm:px-6 lg:hidden">
        <Link href="/painel" className="inline-flex min-h-10 items-center gap-1 text-label text-ink-muted hover:text-ink">
          <ChevronLeft aria-hidden className="size-5" />
          Painel
        </Link>
      </div>
    );
  }

  return (
    // no painel, a largura dele (LARGO_NO_PAINEL, em ui/basicos)
    <div className="mx-auto w-full max-w-6xl px-4 pt-3 sm:px-6 lg:[html[data-largura=painel]_&]:max-w-[96rem]">
      <a
        href={tela.url}
        onClick={(e) => {
          // a mesma tela do histórico: volta com a rolagem e o que estava aberto
          if (window.history.length > 1) {
            e.preventDefault();
            router.back();
          }
        }}
        className="inline-flex min-h-10 max-w-full items-center gap-1 text-label text-ink-muted hover:text-ink"
      >
        <ChevronLeft aria-hidden className="size-5 shrink-0" />
        <span className="truncate">{tela.titulo ? `Voltar para ${tela.titulo}` : "Voltar"}</span>
      </a>
    </div>
  );
}
