"use client";

import { ChevronDown, House, LocateFixed, Navigation } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useId, useState, useTransition } from "react";
import { esquecerPerto, guardarPerto } from "@/lib/perto-guardado";
import { noPublike, ONDE_FUNCIONA } from "@/lib/pracas";
import type { Local } from "@/lib/regioes";
import { botaoLugar, PainelOndeMora } from "../explorar/onde-mora";

/** O evento que abre o "Onde você mora?" de outro lugar da página (o "Imprimir" sem ponto de partida). */
export const ABRIR_ONDE_MORA_DA_ROTA = "rota:onde-mora";

/**
 * "Saindo de" na rota do currículo: de onde o mapa conta a distância (a casa, a localização do aparelho, o bairro ou,
 * enquanto a pessoa não diz, o centro da cidade). "Usar minha localização" guarda a posição no aparelho por 24 horas,
 * arredondada (~100 m), como o "Perto de mim" da busca; salvar o CEP ou o bairro esquece a localização.
 */
export function OndeMoraDaRota({
  local,
  origem,
  nomeAqui,
}: {
  local: Local | null;
  origem: { tipo: "casa" | "aqui" | "bairro" | "cidade"; nome: string; cidade: string };
  /** com a localização do aparelho: o bairro de onde a pessoa está (vem do servidor, depois do resto da página) */
  nomeAqui?: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [atualizando, atualizar] = useTransition();
  const id = useId();
  const router = useRouter();

  useEffect(() => {
    const abrir = () => setAberto(true);
    window.addEventListener(ABRIR_ONDE_MORA_DA_ROTA, abrir);
    return () => window.removeEventListener(ABRIR_ONDE_MORA_DA_ROTA, abrir);
  }, []);

  function usarLocalizacao() {
    setAviso(null);
    if (!("geolocation" in navigator)) return setAviso("Seu navegador não informa a localização. Diga o CEP ou o bairro.");
    setBuscando(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setBuscando(false);
        const p = { lat: Math.round(coords.latitude * 1000) / 1000, lng: Math.round(coords.longitude * 1000) / 1000 };
        if (!noPublike(p)) return setAviso(`Você parece estar fora de ${ONDE_FUNCIONA}. Diga o CEP ou o bairro de casa.`);
        guardarPerto(p);
        atualizar(() => router.refresh());
      },
      () => {
        setBuscando(false);
        setAviso("Não conseguimos a sua localização. Confira a permissão do navegador ou diga o CEP.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  const rotulo =
    origem.tipo === "cidade" ? "Onde você mora?" : origem.tipo === "aqui" ? (nomeAqui ?? "Onde você está") : origem.nome;

  return (
    <div id="saindo-de" className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          aria-controls={id}
          className={`${botaoLugar(origem.tipo !== "cidade")} max-w-60`}
        >
          {origem.tipo === "aqui" ? (
            <Navigation aria-hidden className="size-4 shrink-0 text-terra-text" />
          ) : (
            <House aria-hidden className={`size-4 shrink-0 ${origem.tipo === "cidade" ? "" : "text-terra-text"}`} />
          )}
          <span className="truncate">
            <span className="sr-only">Saindo de </span>
            {rotulo}
          </span>
          <ChevronDown
            aria-hidden
            className={`-mr-0.5 size-4 shrink-0 text-ink-muted transition-transform ${aberto ? "rotate-180" : ""}`}
          />
        </button>
        {origem.tipo !== "casa" && origem.tipo !== "aqui" && (
          <button
            type="button"
            onClick={usarLocalizacao}
            disabled={buscando || atualizando}
            className={botaoLugar(false)}
          >
            <LocateFixed aria-hidden className="size-4 shrink-0" />
            {buscando ? "Procurando…" : atualizando ? "Atualizando…" : "Usar minha localização"}
          </button>
        )}
      </div>
      {aviso && (
        <p role="status" className="text-body-sm text-danger">
          {aviso}
        </p>
      )}
      {aberto && (
        <PainelOndeMora
          id={id}
          local={local}
          cidadePadrao={origem.cidade}
          fechar={() => setAberto(false)}
          aoSalvar={() => {
            // a casa (ou o bairro) passa a valer no lugar da localização do aparelho
            esquecerPerto();
            setAberto(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
