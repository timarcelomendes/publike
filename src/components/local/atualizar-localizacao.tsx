"use client";

import { useEffect } from "react";
import { guardarPerto, pertoGuardadoNoNavegador } from "@/lib/perto-guardado";
import { noPublike } from "@/lib/pracas";

/** De quanto em quanto tempo, no máximo, o site pergunta a posição ao aparelho (por aba). */
const INTERVALO_MS = 10 * 60 * 1000;
const CHAVE = "publike_posicao_lida_em";

/**
 * A localização liberada vale em todo o site (16/11/2026): quem já deu a permissão ao Publike tem a posição renovada a
 * cada visita, sem pergunta nenhuma (o navegador não mostra nada quando a permissão já foi dada). Fica no aparelho, no
 * mesmo cookie de 24 horas do "Perto de mim" (lib/perto-guardado.ts), arredondada (~100 m), e não vai para o banco.
 * Sem a permissão (ou negada), não faz nada: quem pede é o convite (convite-da-localizacao.tsx).
 */
export function AtualizarLocalizacao() {
  useEffect(() => {
    if (!("geolocation" in navigator) || !navigator.permissions?.query) return;
    try {
      const ultima = Number(sessionStorage.getItem(CHAVE) ?? 0);
      if (Date.now() - ultima < INTERVALO_MS && pertoGuardadoNoNavegador()) return;
    } catch {
      // sem sessionStorage (aba privada): segue, a leitura é barata
    }
    let ativo = true;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((permissao) => {
        if (!ativo || permissao.state !== "granted") return;
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => {
            const ponto = {
              lat: Math.round(coords.latitude * 1000) / 1000,
              lng: Math.round(coords.longitude * 1000) / 1000,
            };
            if (!noPublike(ponto)) return;
            guardarPerto(ponto);
            try {
              sessionStorage.setItem(CHAVE, String(Date.now()));
            } catch {
              // sem sessionStorage: lê de novo na próxima página
            }
          },
          () => {},
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
        );
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);
  return null;
}
