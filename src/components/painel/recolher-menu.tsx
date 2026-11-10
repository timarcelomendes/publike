"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

const CHAVE = "publike_menu_recolhido";
const nuncaMuda = () => () => {};

// O CSS do menu recolhido, aqui junto (não no globals.css): vai com o menu, em qualquer página que o mostre. Só no
// computador; os nomes continuam para o leitor de tela; o que pede ação vira um ponto no canto do ícone.
const CSS = "@media (min-width:64rem){html[data-menu-recolhido] [data-painel-grade]{grid-template-columns:3.5rem minmax(0,1fr);column-gap:1.5rem}html[data-menu-recolhido] [data-menu-some]{display:none !important}html[data-menu-recolhido] [data-menu-texto]{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}html[data-menu-recolhido] [data-menu-link]{justify-content:center;padding-inline:0}html[data-menu-recolhido] [data-menu-caminho]::before{display:none}html[data-menu-recolhido] [data-menu-pilula]{position:absolute;top:0.25rem;right:0.25rem;min-width:0;width:0.625rem;height:0.625rem;padding:0;font-size:0;line-height:0;background:var(--pk-terra)}}";

/**
 * Recolher o menu do painel no computador, ficando só os ícones (pedido do Marcelo, 10/11/2026). A escolha fica neste
 * aparelho (localStorage) e marca o html (data-menu-recolhido); o CSS daqui faz o resto. No celular, o menu
 * é a linha de cima e não muda.
 */
export function RecolherMenu() {
  // o script só vai no HTML do servidor (sem o pisca do menu aberto); numa troca de página, o estado basta
  const doServidor = useSyncExternalStore(
    nuncaMuda,
    () => false,
    () => true,
  );
  const [recolhido, setRecolhido] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setRecolhido(document.documentElement.dataset.menuRecolhido === "1"), 0);
    return () => window.clearTimeout(t);
  }, []);
  const trocar = () => {
    const novo = !recolhido;
    setRecolhido(novo);
    if (novo) document.documentElement.dataset.menuRecolhido = "1";
    else delete document.documentElement.dataset.menuRecolhido;
    try {
      localStorage.setItem(CHAVE, novo ? "1" : "0");
    } catch {
      // sem o armazenamento do navegador, vale só até recarregar
    }
  };
  const Icone = recolhido ? PanelLeftOpen : PanelLeftClose;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {doServidor && (
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("${CHAVE}")==="1")document.documentElement.dataset.menuRecolhido="1"}catch(e){}`,
          }}
        />
      )}
      <button
        type="button"
        onClick={trocar}
        aria-pressed={recolhido}
        title={recolhido ? "Abrir o menu" : "Recolher o menu"}
        data-menu-link
        className="hidden min-h-10 items-center gap-2.5 rounded-md px-3 text-body-sm font-semibold text-ink-muted hover:bg-surface-300 hover:text-ink lg:flex"
      >
        <Icone aria-hidden className="size-5 shrink-0" />
        <span data-menu-texto>{recolhido ? "Abrir o menu" : "Recolher o menu"}</span>
      </button>
    </>
  );
}
