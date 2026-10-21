"use client";

import type { ReactNode } from "react";
import { useVisao, type Visao } from "../explorar/visao-explorar";
import { Container } from "../ui/basicos";

/**
 * As colunas da home de quem entrou (direção A): a conta e o menu à esquerda (do computador
 * médio para cima), o conteúdo no meio e, no computador grande, a coluna da direita. Com o
 * mapa à mostra (Mapa ou Blocos + mapa), a coluna da direita desce para baixo do conteúdo e
 * o meio fica largo. No celular, uma coluna só: o meio e depois a direita.
 */
export function MolduraDaHome({
  esquerda,
  direita = null,
  padrao = "blocos",
  children,
}: {
  esquerda: ReactNode;
  direita?: ReactNode;
  /** o jeito de ver de quem nunca escolheu (o mesmo da lista) */
  padrao?: Visao;
  children: ReactNode;
}) {
  const visao = useVisao(padrao);
  const largo = visao === "mapa" || visao === "blocos-mapa";
  const tres = Boolean(direita) && !largo;
  return (
    <Container className="pt-4 pb-4 sm:pt-6">
      <div
        className={`flex flex-col gap-6 lg:grid lg:items-start lg:gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] ${
          tres ? "xl:grid-cols-[15rem_minmax(0,1fr)_18rem]" : ""
        }`}
      >
        <div className="hidden flex-col gap-4 lg:flex">{esquerda}</div>
        <div className="min-w-0">{children}</div>
        {direita && (
          <div className={`flex min-w-0 flex-col gap-4 lg:col-start-2 ${tres ? "xl:col-start-3 xl:row-start-1" : ""}`}>
            {direita}
          </div>
        )}
      </div>
    </Container>
  );
}
