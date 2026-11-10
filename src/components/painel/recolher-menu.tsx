"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

const CHAVE = "publike_menu_recolhido";
const nuncaMuda = () => () => {};

/**
 * Recolher o menu do painel no computador, ficando só os ícones (pedido do Marcelo, 10/11/2026). A escolha fica neste
 * aparelho (localStorage) e marca o html (data-menu-recolhido); o CSS do globals.css faz o resto. No celular, o menu
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
