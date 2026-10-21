"use client";

import type { ReactNode } from "react";
import { ColunaDoMapa, useVisao, type Visao } from "../explorar/visao-explorar";
import { Container } from "../ui/basicos";

/**
 * As colunas da home de quem entrou (direção A): a conta e o menu à esquerda (do computador
 * médio para cima), o conteúdo no meio e, no computador grande, a coluna da direita. Com o
 * mapa à mostra (Mapa ou Blocos + mapa), a coluna da direita desce para baixo do conteúdo e
 * o meio fica largo. Com a lista (`mapaAoLado`) em Blocos + mapa, o mapa ganha uma coluna
 * própria, de cima a baixo (ColunaDoMapa), com quem contrata perto em cima dele; a caixa de
 * publicar, a barra e a lista ficam na largura da lista e embaixo fica o resto
 * (`direitaComMapa`). Embaixo do conteúdo, os blocos vão dois a dois, cada um estreito como na
 * coluna. No celular, uma coluna só.
 */
export function MolduraDaHome({
  esquerda,
  direita = null,
  direitaComMapa,
  mapaAoLado = false,
  padrao = "blocos",
  children,
}: {
  esquerda: ReactNode;
  direita?: ReactNode;
  /** o que fica da direita com Blocos + mapa (o resto foi para cima do mapa) */
  direitaComMapa?: ReactNode;
  /** o meio tem a lista com mapa (o feed): com Blocos + mapa, o mapa vai para a coluna dele */
  mapaAoLado?: boolean;
  /** o jeito de ver de quem nunca escolheu (o mesmo da lista) */
  padrao?: Visao;
  children: ReactNode;
}) {
  const visao = useVisao(padrao);
  const largo = visao === "mapa" || visao === "blocos-mapa";
  const tres = Boolean(direita) && !largo;
  // Blocos + mapa na lista: o mapa ganha uma coluna própria, de cima a baixo; a caixa de publicar,
  // a barra, os filtros e a lista ficam todos na largura da coluna da lista. Sem lista no meio
  // (o Hoje da empresa), a moldura fica como sempre, qualquer que seja o jeito de ver guardado.
  const comMapa = mapaAoLado && visao === "blocos-mapa";
  const lado = comMapa && direitaComMapa !== undefined ? direitaComMapa : direita;
  return (
    <Container className="pt-4 pb-4 sm:pt-6">
      <div
        className={`flex flex-col gap-6 lg:grid lg:items-start ${
          comMapa
            ? "lg:grid-cols-[15rem_minmax(0,7fr)_minmax(0,5fr)] lg:gap-6"
            : `lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8 ${tres ? "xl:grid-cols-[15rem_minmax(0,1fr)_18rem]" : ""}`
        }`}
      >
        <div className="hidden flex-col gap-4 lg:flex">{esquerda}</div>
        <div className="min-w-0">{children}</div>
        {comMapa && (
          <ColunaDoMapa className="hidden min-w-0 flex-col gap-4 self-stretch lg:col-start-3 lg:row-start-1 lg:flex" />
        )}
        {lado && (
          <div
            className={`flex min-w-0 flex-col gap-4 lg:col-start-2 ${comMapa ? "" : "sm:grid sm:grid-cols-2 sm:items-start"} ${
              tres ? "xl:col-start-3 xl:row-start-1 xl:flex xl:items-stretch" : ""
            }`}
          >
            {lado}
          </div>
        )}
      </div>
    </Container>
  );
}
