"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

const CHAVE = "publike_lista_recolhida";
const nuncaMuda = () => () => {};

// O CSS da lista recolhida, aqui junto (como o do menu, em recolher-menu.tsx): só no computador e só dentro da mesa
// ([data-mesa-grade]), para não mexer na lista do Hoje. A lista vira uma coluna de fotos; o nome e a situação de cada
// um continuam para o leitor de tela e no balão (title); quem pede você ganha o ponto no canto da foto.
const SR = "position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap";
const CSS = `@media (min-width:64rem){html[data-lista-recolhida] [data-mesa-grade]{grid-template-columns:4.5rem minmax(0,1fr);column-gap:1rem}html[data-lista-recolhida] [data-mesa-grade] [data-mesa-texto]{${SR}}html[data-lista-recolhida] [data-mesa-grade] [data-mesa-item]{justify-content:center;padding-inline:0}html[data-lista-recolhida] [data-mesa-grade] [data-mesa-ponto]{display:block}html[data-lista-recolhida] [data-mesa-grade] [data-mesa-some]{display:none}}`;

/**
 * Recolher a lista de Candidatos no computador, para a ficha usar a largura toda (pedido do Marcelo, 11/11/2026), como o
 * "Recolher o menu". A escolha fica neste aparelho (localStorage) e marca o html (data-lista-recolhida). No celular, a
 * lista e a ficha já são duas telas.
 */
export function RecolherLista() {
  // o script só vai no HTML do servidor (sem o pisca da lista aberta); numa troca de página, o estado basta
  const doServidor = useSyncExternalStore(
    nuncaMuda,
    () => false,
    () => true,
  );
  const [recolhida, setRecolhida] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setRecolhida(document.documentElement.dataset.listaRecolhida === "1"), 0);
    return () => window.clearTimeout(t);
  }, []);
  const trocar = () => {
    const nova = !recolhida;
    setRecolhida(nova);
    if (nova) document.documentElement.dataset.listaRecolhida = "1";
    else delete document.documentElement.dataset.listaRecolhida;
    try {
      localStorage.setItem(CHAVE, nova ? "1" : "0");
    } catch {
      // sem o armazenamento do navegador, vale só até recarregar
    }
  };
  const Icone = recolhida ? PanelLeftOpen : PanelLeftClose;
  const nome = recolhida ? "Mostrar a lista" : "Recolher a lista";
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {doServidor && (
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("${CHAVE}")==="1")document.documentElement.dataset.listaRecolhida="1"}catch(e){}`,
          }}
        />
      )}
      <button
        type="button"
        onClick={trocar}
        title={recolhida ? "Mostrar a lista ao lado da ficha" : "Recolher a lista: a ficha fica mais larga"}
        data-mesa-item
        className="relative hidden min-h-11 w-full items-center gap-2.5 px-4 text-body-sm font-semibold text-ink-muted hover:bg-surface-300 hover:text-ink lg:flex"
      >
        <Icone aria-hidden className="size-5 shrink-0" />
        <span data-mesa-texto>{nome}</span>
      </button>
    </>
  );
}
