"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// Fechar um grupo do menu em pé (Atrair, Selecionar, Números, Conta), no computador (11/11/2026): o menu do painel
// ficou com tudo à vista e, quem não usa um grupo, fecha. Fica neste aparelho (localStorage) e marca o html
// (data-menu-fechados), como o "Recolher o menu": o CSS daqui esconde os itens antes de o React chegar, sem piscar.
// No grupo fechado, a página aberta continua à vista; com o menu recolhido (só os ícones), tudo aparece.

const CHAVE = "publike_menu_fechados";
const nuncaMuda = () => () => {};

/** "Números" → "numeros": o nome do grupo vira a chave (no html e no armazenamento). */
export function chaveDoGrupo(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

function lerFechados() {
  return (document.documentElement.dataset.menuFechados ?? "").split(" ").filter(Boolean);
}

/** Os grupos fechados (pela chave) e o toque que abre ou fecha um. */
export function useGruposFechados() {
  const [fechados, setFechados] = useState<string[]>([]);
  useEffect(() => {
    const t = window.setTimeout(() => setFechados(lerFechados()), 0);
    return () => window.clearTimeout(t);
  }, []);
  const alternar = (chave: string) => {
    const atual = lerFechados();
    const novo = atual.includes(chave) ? atual.filter((x) => x !== chave) : [...atual, chave];
    if (novo.length) document.documentElement.dataset.menuFechados = novo.join(" ");
    else delete document.documentElement.dataset.menuFechados;
    setFechados(novo);
    try {
      localStorage.setItem(CHAVE, novo.join(" "));
    } catch {
      // sem o armazenamento do navegador, vale só até recarregar
    }
  };
  return { fechados, alternar };
}

/** O CSS dos grupos fechados e, só no HTML do servidor, o script que lê o que ficou guardado. */
export function EstiloDosGrupos({ chaves }: { chaves: string[] }) {
  const doServidor = useSyncExternalStore(
    nuncaMuda,
    () => false,
    () => true,
  );
  const css = chaves
    .map((k) => {
      const g = `html[data-menu-fechados~="${k}"] [data-grupo="${k}"]`;
      return `${g} [data-grupo-itens]>li:not(:has([aria-current="page"])){display:none}${g} [data-seta]{rotate:-90deg}${g} [data-so-fechado]{display:block}`;
    })
    .join("");
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `@media (min-width:64rem){${css}}` }} />
      {doServidor && (
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var f=localStorage.getItem("${CHAVE}");if(f)document.documentElement.dataset.menuFechados=f}catch(e){}`,
          }}
        />
      )}
    </>
  );
}
