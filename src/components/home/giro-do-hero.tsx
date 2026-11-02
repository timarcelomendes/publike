"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { SEGUNDOS_DO_DESTAQUE, type BannerNoAr } from "@/lib/banners";
import { contar } from "./banner-da-home";
import { CartaoDoPublike } from "./cartao-do-publike";

// O giro da coluna da direita da faixa do alto da inicial (quem não tem conta, no computador): as 3 vagas novas
// e até 4 destaques do admin (Admin › Banners, formato "Destaque no alto da inicial"). Começa pelas vagas e troca a
// cada 8 segundos. Para com o mouse em cima, com o foco na faixa (a busca, os pontos) e com a aba escondida; não
// gira para quem pediu menos movimento no aparelho. Os pontos escolhem; "Pausar" para de vez (e "Continuar" volta).
// O destaque conta como visto quando fica 1 segundo na tela, na vez dele (uma vez por página aberta).

function assinarMenosMovimento(avisar: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", avisar);
  return () => mq.removeEventListener("change", avisar);
}

function assinarVisibilidade(avisar: () => void) {
  document.addEventListener("visibilitychange", avisar);
  return () => document.removeEventListener("visibilitychange", avisar);
}

type Vez = { tipo: "vagas" } | { tipo: "destaque"; banner: BannerNoAr };

export function GiroDoHero({ vagas, destaques }: { vagas: ReactNode | null; destaques: BannerNoAr[] }) {
  const vezes: Vez[] = [
    ...(vagas ? [{ tipo: "vagas" } as const] : []),
    ...destaques.map((banner) => ({ tipo: "destaque", banner }) as const),
  ];
  const total = vezes.length;
  const [atual, setAtual] = useState(0);
  // "Pausar" (ou escolher um ponto): para até tocar em "Continuar"
  const [pausado, setPausado] = useState(false);
  const [emCima, setEmCima] = useState(false);
  const [comFoco, setComFoco] = useState(false);
  const [naTela, setNaTela] = useState(false);
  const menosMovimento = useSyncExternalStore(
    assinarMenosMovimento,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
  const abaVisivel = useSyncExternalStore(
    assinarVisibilidade,
    () => document.visibilityState === "visible",
    () => true,
  );
  const caixa = useRef<HTMLDivElement>(null);
  const controles = useRef<HTMLDivElement>(null);
  const contados = useRef(new Set<string>());
  const giraSozinho = !pausado && !menosMovimento;
  const girando = giraSozinho && !emCima && !comFoco && naTela && abaVisivel && total > 1;

  // na tela: metade à vista (no celular a coluna nem aparece, e aí não gira nem conta)
  useEffect(() => {
    const el = caixa.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const olho = new IntersectionObserver(([e]) => setNaTela(Boolean(e?.isIntersecting)), { threshold: 0.5 });
    olho.observe(el);
    return () => olho.disconnect();
  }, []);

  // o foco em qualquer lugar da faixa (a busca da esquerda, o botão de um destaque) segura o giro; nos pontos e no
  // Pausar, não: quem toca em "Continuar" quer que volte a girar
  useEffect(() => {
    const faixa = caixa.current?.closest("section");
    if (!faixa) return;
    const entrou = (e: FocusEvent) => setComFoco(!controles.current?.contains(e.target as Node | null));
    const saiu = (e: FocusEvent) => {
      if (!faixa.contains(e.relatedTarget as Node | null)) setComFoco(false);
    };
    faixa.addEventListener("focusin", entrou);
    faixa.addEventListener("focusout", saiu);
    return () => {
      faixa.removeEventListener("focusin", entrou);
      faixa.removeEventListener("focusout", saiu);
    };
  }, []);

  // a próxima vez, depois dos segundos (recomeça a contar a cada troca)
  useEffect(() => {
    if (!girando) return;
    const espera = window.setTimeout(() => setAtual((a) => (a + 1) % total), SEGUNDOS_DO_DESTAQUE * 1000);
    return () => window.clearTimeout(espera);
  }, [girando, atual, total]);

  // o destaque da vez, à vista por 1 segundo: conta como visto (uma vez por página aberta)
  const vez = vezes[atual];
  const idDaVez = vez?.tipo === "destaque" ? vez.banner.id : null;
  useEffect(() => {
    if (!idDaVez || !naTela || !abaVisivel || contados.current.has(idDaVez)) return;
    const espera = window.setTimeout(() => {
      contados.current.add(idDaVez);
      contar(idDaVez, "visto");
    }, 1000);
    return () => window.clearTimeout(espera);
  }, [idDaVez, naTela, abaVisivel]);

  if (total === 0) return null;
  const nomeDa = (v: Vez) => (v.tipo === "vagas" ? "Vagas novas" : v.banner.titulo);

  return (
    <div
      ref={caixa}
      role="region"
      aria-roledescription="carrossel"
      aria-label="Destaques do Publike"
      onPointerEnter={() => setEmCima(true)}
      onPointerLeave={() => setEmCima(false)}
      className="hidden lg:block"
    >
      {/* todas na mesma casa da grade: a coluna fica com a altura da maior e não pula na troca. A coluna é
          minmax(0, 1fr): sem isso, o título comprido de uma vaga (que não quebra, corta com reticências) alarga a
          grade para fora da faixa */}
      <div className="grid grid-cols-[minmax(0,1fr)]" aria-live={giraSozinho ? "off" : "polite"}>
        {vezes.map((v, i) => {
          const daVez = i === atual;
          return (
            <div
              key={v.tipo === "vagas" ? "vagas" : v.banner.id}
              role="group"
              aria-roledescription="destaque"
              aria-label={`${i + 1} de ${total}: ${nomeDa(v)}`}
              aria-hidden={!daVez}
              inert={!daVez}
              className={`flex min-w-0 flex-col justify-center transition-[opacity,visibility] duration-500 [grid-area:1/1] motion-reduce:transition-none ${
                daVez ? "visible opacity-100" : "invisible opacity-0"
              }`}
            >
              {v.tipo === "vagas" ? (
                vagas
              ) : (
                <CartaoDoPublike banner={v.banner} jeito="destaque" novidades={v.banner.novidades} />
              )}
            </div>
          );
        })}
      </div>
      {total > 1 && (
        <div ref={controles} className="mt-4 flex items-center justify-center gap-1">
          {vezes.map((v, i) => (
            <button
              key={v.tipo === "vagas" ? "vagas" : v.banner.id}
              type="button"
              aria-label={`Mostrar ${i + 1} de ${total}: ${nomeDa(v)}`}
              aria-current={i === atual ? "true" : undefined}
              onClick={() => {
                setAtual(i);
                setPausado(true);
              }}
              className="grid size-7 place-items-center rounded-pill"
            >
              <span
                aria-hidden
                className={`block h-2 rounded-pill transition-[width,background-color] duration-300 motion-reduce:transition-none ${
                  i === atual ? "w-6 bg-ink" : "w-2 bg-line-strong hover:bg-ink-muted"
                }`}
              />
            </button>
          ))}
          {!menosMovimento && (
            <button
              type="button"
              onClick={() => setPausado((p) => !p)}
              aria-label={pausado ? "Continuar a troca dos destaques" : "Pausar a troca dos destaques"}
              title={pausado ? "Continuar" : "Pausar"}
              className="ml-1 grid size-8 place-items-center rounded-pill text-ink-muted hover:bg-surface-200 hover:text-ink"
            >
              {pausado ? <Play aria-hidden className="size-4" /> : <Pause aria-hidden className="size-4" />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
