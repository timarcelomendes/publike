"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";

// Quantas páginas abertas pedem o site sem a barra de baixo do celular. O Next guarda a página anterior
// escondida: cada uma conta ao aparecer e desconta ao sumir.
let abertas = 0;

const nuncaMuda = () => () => {};

/**
 * O Publicar em passos no celular é um passo a passo com o X para sair e o Continuar preso embaixo: a barra do
 * site (Início, Candidatos, Publicar…) some enquanto ele está aberto (html[data-sem-barra]), para não ficarem duas
 * barras empilhadas. Na primeira carga, um script marca antes de a tela aparecer; depois, o efeito marca ao abrir a
 * página e desmarca ao sair dela (como SemLinhaDoPainel).
 */
export function SemBarraDeBaixo() {
  const doServidor = useSyncExternalStore(
    nuncaMuda,
    () => false,
    () => true,
  );
  useLayoutEffect(() => {
    abertas++;
    document.documentElement.dataset.semBarra = "1";
    return () => {
      abertas--;
      if (abertas === 0) delete document.documentElement.dataset.semBarra;
    };
  }, []);
  return doServidor ? (
    <script dangerouslySetInnerHTML={{ __html: "document.documentElement.dataset.semBarra='1'" }} />
  ) : null;
}
