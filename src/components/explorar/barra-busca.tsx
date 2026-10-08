"use client";

import { LocateFixed, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { REGIAO } from "@/lib/config";
import { CATEGORIAS, REGIMES } from "@/lib/constantes";
import { hrefFiltros, RAIOS, type Filtros } from "@/lib/filtros";
import type { Regime, TipoAnuncio } from "@/lib/tipos";
import { Botao } from "../ui/botao";
import { classesEntrada, Seletor } from "../ui/campo";

const TIPOS: { valor: TipoAnuncio | null; nome: string }[] = [
  { valor: null, nome: "Tudo" },
  { valor: "vaga", nome: "Vagas" },
  { valor: "servico", nome: "Serviços" },
];

const chip = (ativo: boolean) =>
  `inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors ${
    ativo ? "border-ink bg-ink text-surface-100" : "border-line bg-surface-300 text-ink hover:border-line-strong"
  }`;

// Os filtros de lista têm a mesma cara do botão "Perto de mim" (secundário, pequeno).
const seletor =
  "min-h-10 rounded-md border border-line-strong bg-surface-200 pl-3.5 text-label text-ink transition-colors hover:bg-surface-300";

export function BarraBusca({ filtros }: { filtros: Filtros }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [avisoGps, setAvisoGps] = useState<string | null>(null);
  const [texto, setTexto] = useState(filtros.q);

  function ir(mudancas: Partial<Filtros>) {
    iniciar(() => router.push(hrefFiltros(filtros, mudancas), { scroll: false }));
  }

  function buscar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    ir({ q: texto.trim() });
  }

  function pertoDeMim() {
    setAvisoGps(null);
    if (!("geolocation" in navigator)) {
      setAvisoGps("Seu navegador não informa a localização.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const { latitude: lat, longitude: lng } = coords;
        if (lat < REGIAO.latMin || lat > REGIAO.latMax || lng < REGIAO.lngMin || lng > REGIAO.lngMax) {
          setAvisoGps("Você parece estar fora de Goiânia e região. Mostrando a partir do centro de Goiânia.");
          return;
        }
        // arredonda (~1 km): a busca não precisa da posição exata
        ir({ lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100, origem: "gps", ordem: "perto" });
      },
      () => setAvisoGps("Não conseguimos sua localização. Confira a permissão do navegador."),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  return (
    <div className="relative flex flex-col gap-4">
      {pendente && (
        <div aria-hidden className="absolute -top-3 left-0 h-0.5 w-full overflow-hidden rounded-pill bg-surface-300">
          <div className="h-full w-1/3 animate-pulse rounded-pill bg-terra" />
        </div>
      )}

      <form role="search" onSubmit={buscar} className="flex gap-2">
        <label htmlFor="busca" className="sr-only">
          O que você procura?
        </label>
        <div className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink-muted" />
          <input
            id="busca"
            type="search"
            enterKeyHint="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex.: diarista, garçom"
            maxLength={80}
            className={`${classesEntrada} min-h-12 pl-10 pr-10 [&::-webkit-search-cancel-button]:appearance-none`}
          />
          {texto && (
            <button
              type="button"
              onClick={() => {
                setTexto("");
                ir({ q: "" });
              }}
              className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300"
            >
              <X aria-hidden className="size-4" />
              <span className="sr-only">Limpar busca</span>
            </button>
          )}
        </div>
        <Botao type="submit" className="min-h-12" disabled={pendente}>
          Buscar
        </Botao>
      </form>

      <div role="group" aria-label="Tipo de anúncio" className="flex gap-2">
        {TIPOS.map((t) => (
          <button
            key={t.nome}
            type="button"
            aria-pressed={filtros.tipo === t.valor}
            onClick={() => ir({ tipo: t.valor, regime: t.valor === "servico" ? null : filtros.regime })}
            className={chip(filtros.tipo === t.valor)}
          >
            {t.nome}
          </button>
        ))}
      </div>

      <div role="group" aria-label="Categoria" className="sem-barra -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
        <button
          type="button"
          aria-pressed={filtros.categoria === null}
          onClick={() => ir({ categoria: null })}
          className={chip(filtros.categoria === null)}
        >
          Todas
        </button>
        {CATEGORIAS.map(({ slug, nome, icone: Icone }) => (
          <button
            key={slug}
            type="button"
            aria-pressed={filtros.categoria === slug}
            onClick={() => ir({ categoria: filtros.categoria === slug ? null : slug })}
            className={chip(filtros.categoria === slug)}
          >
            <Icone aria-hidden className="size-4" />
            {nome}
          </button>
        ))}
      </div>

      <div className="sem-barra -mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        <Botao tamanho="sm" onClick={pertoDeMim} aria-pressed={filtros.origem === "gps"} className="shrink-0">
          <LocateFixed aria-hidden />
          Perto de mim
        </Botao>
        {filtros.tipo !== "servico" && (
          <Seletor
            aria-label="Tipo de contratação"
            value={filtros.regime ?? ""}
            onChange={(e) => ir({ regime: (e.target.value || null) as Regime | null })}
            className={seletor}
            envoltorio="shrink-0"
          >
            <option value="">Contratação: todas</option>
            {Object.entries(REGIMES).map(([valor, r]) => (
              <option key={valor} value={valor}>
                {r.nome}
              </option>
            ))}
          </Seletor>
        )}
        <Seletor
          aria-label="Distância"
          value={filtros.raio}
          onChange={(e) => ir({ raio: Number(e.target.value) })}
          className={seletor}
          envoltorio="shrink-0"
        >
          {RAIOS.map((r) => (
            <option key={r} value={r}>
              Até {r} km
            </option>
          ))}
        </Seletor>
        <Seletor
          aria-label="Ordem"
          value={filtros.ordem}
          onChange={(e) => ir({ ordem: e.target.value === "recentes" ? "recentes" : "perto" })}
          className={seletor}
          envoltorio="shrink-0"
        >
          <option value="perto">Mais perto</option>
          <option value="recentes">Mais recentes</option>
        </Seletor>
      </div>
      {avisoGps && (
        <p role="status" className="-mt-2 text-body-sm text-terra-text">
          {avisoGps}
        </p>
      )}
    </div>
  );
}
