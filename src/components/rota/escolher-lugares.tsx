"use client";

import { Check, House, MapPin, Printer, Sparkles, Store } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState, useTransition, type ReactNode } from "react";
import { deslocamentoProvavel } from "@/lib/deslocamento";
import { montarRota } from "@/lib/acoes/rota-curriculo";
import { bairroDaReceita } from "@/lib/cnpj";
import { distanciaCurta, MAX_LUGARES_DA_ROTA } from "@/lib/rota-curriculo";
import { classesBotao } from "../ui/botao";
import { MapaDaRota, type VagaNoMapa } from "./mapa-da-rota";
import { ABRIR_ONDE_MORA_DA_ROTA } from "./onde-mora-da-rota";
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
  /** aberto há até 12 meses na Receita: "Abriu em mar. de 2026" (o selo "Lugar novo") */
  novo?: string | null;
  /** a empresa tem conta no Publike: o "Quero trabalhar aqui" avisa direto */
  no_publike?: boolean;
};

const SELO = "inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[12px] font-semibold";

/**
 * O mapa (no alto da página), as vagas do Publike da mesma função e os lugares. Nenhum lugar começa escolhido: a pessoa
 * toca no ponto do mapa ou em "Vou entregar aqui" (até 15) e imprime uma cópia do currículo para cada um.
 */
export function EscolherLugares({
  lugares,
  cbo,
  funcao,
  raio,
  casa,
  rotuloCasa,
  semOrigem = false,
  vagas = [],
  cartoesDasVagas = null,
  vazio = null,
  falta = null,
}: {
  casa: { lat: number; lng: number };
  /** o nome do ponto de partida no mapa ("Sua casa", "Você", "Centro de Goiânia") */
  rotuloCasa: string;
  /** o mapa conta do centro da cidade: para imprimir, a pessoa diz antes de onde sai */
  semOrigem?: boolean;
  /** sem conta ou sem currículo: o botão leva para entrar (ou preencher) e voltar aqui */
  falta?: { href: string; texto: string } | null;
  lugares: LugarDaRota[];
  /** as vagas no ar no Publike da mesma função, no raio (no mapa, em verde) */
  vagas?: VagaNoMapa[];
  /** os cartões dessas vagas (feitos no servidor), entre o mapa e a lista */
  cartoesDasVagas?: ReactNode;
  /** nenhum lugar no raio: o que dizer no lugar da lista */
  vazio?: ReactNode;
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

  // tocar numa vaga no mapa leva ao cartão dela, com um destaque rápido
  const irParaVaga = useCallback((id: string) => {
    const el = document.getElementById(`vaga-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-cerrado");
    window.setTimeout(() => el.classList.remove("ring-2", "ring-cerrado"), 1600);
  }, []);

  function dizerOrigem() {
    document.getElementById("saindo-de")?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.dispatchEvent(new Event(ABRIR_ONDE_MORA_DA_ROTA));
  }

  return (
    // no celular, o mapa no alto e a lista embaixo; em tela grande, a lista à esquerda e o mapa parado à direita
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start lg:gap-6">
      <div className="lg:sticky lg:top-20 lg:order-2">
        <MapaDaRota
          casa={casa}
          rotuloCasa={rotuloCasa}
          pontos={pontos}
          vagas={vagas}
          aoTocar={trocar}
          aoTocarVaga={irParaVaga}
          className="lg:h-[calc(100vh-7rem)] lg:max-h-[46rem]"
        />
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:order-1">
        {cartoesDasVagas}

        {lugares.length === 0 ? (
          vazio
        ) : (
          <>
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
                        {(l.novo || l.no_publike) && (
                          <p className="mt-1 flex flex-wrap gap-1.5">
                            {l.novo && (
                              <span className={`${SELO} bg-ipe text-on-ipe`} title={l.novo}>
                                <Sparkles aria-hidden className="size-3" />
                                Lugar novo
                              </span>
                            )}
                            {l.no_publike && (
                              <span className={`${SELO} bg-terra/10 text-terra-text`} title="A empresa tem conta no Publike">
                                <Store aria-hidden className="size-3" />
                                No Publike
                              </span>
                            )}
                          </p>
                        )}
                        {l.ramo && <p className="mt-1 text-body-sm text-ink-muted">{l.ramo}</p>}
                        <p className="text-body-sm text-ink-muted">
                          {[l.endereco, l.bairro && bairroDaReceita(l.bairro), l.cidade].filter(Boolean).join(", ")}
                        </p>
                        {l.novo && <p className="text-body-sm text-ink-muted">{l.novo}: lugar novo costuma contratar.</p>}
                        <p className="mt-1 inline-flex items-center gap-1 text-body-sm tabular-nums text-ink">
                          <MapPin aria-hidden className="size-3.5 text-ink-muted" />
                          {distanciaCurta(l.distancia_m)} {semOrigem ? "do centro" : "de você"},{" "}
                          {deslocamentoProvavel(l.distancia_m / 1000).texto}
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
              ) : semOrigem ? (
                <button type="button" onClick={dizerOrigem} className={`${classesBotao("primario")} shrink-0`}>
                  <House aria-hidden />
                  Dizer de onde você sai
                </button>
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
          </>
        )}
      </div>
    </div>
  );
}
