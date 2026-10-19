"use client";

import { createContext, useContext } from "react";

/** O retângulo que o mapa mostra agora: [oeste, sul, leste, norte]. */
export type Limites = [number, number, number, number];

/**
 * A parte do mapa que está na tela, para a lista mostrar só o que está nela. null: sem mapa na
 * tela (Lista, Grade ou Blocos) ou o mapa ainda não abriu; aí a lista mostra a busca inteira.
 */
export const AreaDoMapa = createContext<Limites | null>(null);

export const useAreaDoMapa = () => useContext(AreaDoMapa);

export function dentro(l: Limites, lat: number, lng: number) {
  return lng >= l[0] && lng <= l[2] && lat >= l[1] && lat <= l[3];
}
