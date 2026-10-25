"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";

// Quantas páginas abertas pedem o painel sem a linha do menu no celular. O Next guarda a página
// anterior escondida: cada uma conta ao aparecer e desconta ao sumir.
let abertas = 0;

const nuncaMuda = () => () => {};

/**
 * Nas Mensagens, o celular tem a aba delas na barra de baixo e as abas Conversas, Matches e Conexões
 * no alto: a linha do menu do painel some (html[data-sem-linha-painel]). Na primeira carga, um script
 * marca antes de a tela aparecer; depois, o efeito marca ao abrir a página e desmarca ao sair dela.
 */
export function SemLinhaDoPainel() {
  // o script só vai no HTML do servidor: numa troca de página no navegador, o efeito basta
  const doServidor = useSyncExternalStore(
    nuncaMuda,
    () => false,
    () => true,
  );
  useLayoutEffect(() => {
    abertas++;
    document.documentElement.dataset.semLinhaPainel = "1";
    return () => {
      abertas--;
      if (abertas === 0) delete document.documentElement.dataset.semLinhaPainel;
    };
  }, []);
  return doServidor ? (
    <script dangerouslySetInnerHTML={{ __html: "document.documentElement.dataset.semLinhaPainel='1'" }} />
  ) : null;
}
