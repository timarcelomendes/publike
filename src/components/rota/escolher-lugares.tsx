"use client";

import { Check, MapPin, Printer } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState, useTransition } from "react";
import { deslocamentoProvavel } from "@/lib/deslocamento";
import { montarRota } from "@/lib/acoes/rota-curriculo";
import { bairroDaReceita } from "@/lib/cnpj";
import { distanciaCurta, MAX_LUGARES_DA_ROTA } from "@/lib/rota-curriculo";
import { classesBotao } from "../ui/botao";
import { MapaDaRota } from "./mapa-da-rota";
import { QueroTrabalharAqui } from "./quero-trabalhar-aqui";

export type LugarDaRota = {
  cnpj: string;
  nome: string;
  ramo: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string;
  lat: number;
  lng: number;
  distancia_m: number;
};

/**
 * Os lugares no mapa e na lista. Nenhum começa escolhido: a pessoa toca no ponto do mapa ou em "Vou entregar aqui"
 * (até 15) e imprime uma cópia do currículo para cada um.
 */
export function EscolherLugares({
  lugares,
  cbo,
  funcao,
  raio,
  casa,
  falta = null,
}: {
  casa: { lat: number; lng: number };
  /** sem conta ou sem currículo: o botão leva para entrar (ou preencher) e voltar aqui */
  falta?: { href: string; texto: string } | null;
  lugares: LugarDaRota[];
  cbo: string;
  funcao: string;
  raio: number;
}) {
  const [escolhidos, setEscolhidos] = useState<Set<string>>(() => new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const n = escolhidos.size;
  const cheio = n >= MAX_LUGARES_DA_ROTA;
  const pontos = useMemo(
    () => lugares.map((l) => ({ cnpj: l.cnpj, nome: l.nome, lat: l.lat, lng: l.lng, escolhido: escolhidos.has(l.cnpj) })),
    [lugares, escolhidos],
  );

  const trocar = useCallback(
    (cnpj: string) => {
      setErro(null);
      if (!escolhidos.has(cnpj) && escolhidos.size >= MAX_LUGARES_DA_ROTA) {
        setAviso(`Dá para escolher até ${MAX_LUGARES_DA_ROTA} lugares por rota. Tire um para pôr outro.`);
        return;
      }
      setAviso(null);
      const novo = new Set(escolhidos);
      if (novo.has(cnpj)) novo.delete(cnpj);
      else novo.add(cnpj);
      setEscolhidos(novo);
    },
    [escolhidos],
  );

  return (
    <div className="flex flex-col gap-4">
      <MapaDaRota casa={casa} pontos={pontos} aoTocar={trocar} />

      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-200">
        {lugares.map((l) => {
          const escolhido = escolhidos.has(l.cnpj);
          return (
            <li
              key={l.cnpj}
              className={`flex flex-col gap-3 p-4 transition-colors ${escolhido ? "bg-terra/5 shadow-[inset_3px_0_0_var(--color-terra)]" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-label text-ink">{l.nome}</p>
                  {l.ramo && <p className="text-body-sm text-ink-muted">{l.ramo}</p>}
                  <p className="text-body-sm text-ink-muted">
                    {[l.endereco, l.bairro && bairroDaReceita(l.bairro), l.cidade].filter(Boolean).join(", ")}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1 text-body-sm tabular-nums text-ink">
                    <MapPin aria-hidden className="size-3.5 text-ink-muted" />
                    {distanciaCurta(l.distancia_m)} de casa, {deslocamentoProvavel(l.distancia_m / 1000).texto}
                  </p>
                </div>
                <button
                  type="button"
                  aria-pressed={escolhido}
                  disabled={!escolhido && cheio}
                  onClick={() => trocar(l.cnpj)}
                  className={
                    escolhido
                      ? "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-pill border border-terra bg-terra px-3.5 text-label text-white"
                      : "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-pill border border-line-strong bg-surface-100 px-3.5 text-label text-ink hover:bg-surface-300 disabled:opacity-50"
                  }
                >
                  {escolhido && <Check aria-hidden className="size-4" />}
                  {escolhido ? "Vou entregar" : "Vou entregar aqui"}
                </button>
              </div>
              <QueroTrabalharAqui cnpj={l.cnpj} nome={l.nome} funcao={funcao} />
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-20 z-10 flex flex-col gap-3 rounded-lg border border-line-strong bg-surface-100 p-4 shadow-raised sm:bottom-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <p className="text-label text-ink" aria-live="polite">
            {n === 0
              ? "Nenhum lugar escolhido"
              : `${n} ${n === 1 ? "lugar escolhido" : "lugares escolhidos"} de até ${MAX_LUGARES_DA_ROTA}`}
          </p>
          <p className="text-body-sm text-ink-muted">
            {n === 0
              ? "Toque nos pontos do mapa ou em “Vou entregar aqui”."
              : "Sai uma cópia do currículo para cada lugar, com o nome dele e um QR code."}
            {n > 0 && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => {
                    setEscolhidos(new Set());
                    setAviso(null);
                  }}
                  className="text-ink underline underline-offset-2"
                >
                  Limpar
                </button>
              </>
            )}
          </p>
          {(aviso || erro) && (
            <p role="alert" className="text-body-sm text-danger">
              {erro ?? aviso}
            </p>
          )}
        </div>
        {falta ? (
          <Link href={falta.href} className={`${classesBotao("primario")} shrink-0`}>
            <Printer aria-hidden />
            {falta.texto}
          </Link>
        ) : (
          <button
            type="button"
            disabled={pendente || n === 0}
            onClick={() =>
              iniciar(async () => {
                setErro(null);
                const r = await montarRota({ cbo, funcao, raio, cnpjs: [...escolhidos] });
                if (r && !r.ok) setErro(r.erro);
              })
            }
            className={`${classesBotao("primario")} shrink-0`}
          >
            <Printer aria-hidden />
            {pendente ? "Preparando…" : n === 0 ? "Imprimir as cópias" : `Imprimir ${n} ${n === 1 ? "cópia" : "cópias"}`}
          </button>
        )}
      </div>
    </div>
  );
}
