"use client";

import { MapPin, Printer } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { deslocamentoProvavel } from "@/lib/deslocamento";
import { montarRota } from "@/lib/acoes/rota-curriculo";
import { distanciaCurta, MAX_LUGARES_DA_ROTA } from "@/lib/rota-curriculo";
import { classesBotao } from "../ui/botao";
import { MapaDaRota } from "./mapa-da-rota";

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

/** A lista dos lugares para marcar (até 15, os mais perto já marcados) e o "Montar e imprimir". */
export function EscolherLugares({
  lugares,
  cbo,
  funcao,
  raio,
  casa,
}: {
  casa: { lat: number; lng: number };
  lugares: LugarDaRota[];
  cbo: string;
  funcao: string;
  raio: number;
}) {
  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(lugares.slice(0, Math.min(10, MAX_LUGARES_DA_ROTA)).map((l) => l.cnpj)),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const cheio = marcados.size >= MAX_LUGARES_DA_ROTA;
  const pontos = useMemo(
    () => lugares.map((l) => ({ cnpj: l.cnpj, lat: l.lat, lng: l.lng, marcado: marcados.has(l.cnpj) })),
    [lugares, marcados],
  );

  function trocar(cnpj: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(cnpj)) novo.delete(cnpj);
      else if (novo.size < MAX_LUGARES_DA_ROTA) novo.add(cnpj);
      return novo;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <MapaDaRota casa={casa} pontos={pontos} />
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
        {lugares.map((l) => {
          const marcado = marcados.has(l.cnpj);
          return (
            <li key={l.cnpj}>
              <label className="flex cursor-pointer items-start gap-3 p-4 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
                <input
                  type="checkbox"
                  checked={marcado}
                  disabled={!marcado && cheio}
                  onChange={() => trocar(l.cnpj)}
                  className="mt-1 size-5 shrink-0 accent-[var(--color-ink)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-label text-ink">{l.nome}</span>
                    <span className="inline-flex items-center gap-1 text-body-sm tabular-nums text-ink-muted">
                      <MapPin aria-hidden className="size-3.5" />
                      {distanciaCurta(l.distancia_m)}, {deslocamentoProvavel(l.distancia_m / 1000).texto}
                    </span>
                  </span>
                  {l.ramo && <span className="block text-body-sm text-ink-muted">{l.ramo}</span>}
                  <span className="block text-body-sm text-ink-muted">
                    {[l.endereco, l.bairro, l.cidade].filter(Boolean).join(", ")}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-20 z-10 flex flex-col gap-2 rounded-lg border border-line-strong bg-surface-100 p-4 shadow-raised sm:bottom-4">
        <p className="text-body-sm text-ink">
          {marcados.size} de até {MAX_LUGARES_DA_ROTA} lugares marcados. Sai uma cópia do currículo para cada um, com o
          nome do lugar e um QR code.
        </p>
        {erro && (
          <p role="alert" className="text-body-sm text-danger">
            {erro}
          </p>
        )}
        <button
          type="button"
          disabled={pendente || marcados.size === 0}
          onClick={() =>
            iniciar(async () => {
              setErro(null);
              const r = await montarRota({ cbo, funcao, raio, cnpjs: [...marcados] });
              if (r && !r.ok) setErro(r.erro);
            })
          }
          className={classesBotao("primario")}
        >
          <Printer aria-hidden />
          {pendente ? "Montando…" : `Montar a rota e imprimir ${marcados.size} ${marcados.size === 1 ? "cópia" : "cópias"}`}
        </button>
      </div>
    </div>
  );
}
