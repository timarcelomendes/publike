"use client";

import { ArrowRight, Check, Share2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Simbolo } from "@/components/ui/basicos";
import { classesBotao } from "@/components/ui/botao";
import { LINK_COMPARTILHAR, type BannerNoAr } from "@/lib/banners";
import { contar, jaViu, marcarVisto } from "./banner-da-home";

// O cartão "Do Publike" (um banner do admin no formato cartão): uma faixa no meio da lista da página
// inicial (quem não tem conta) e da linha do tempo (quem tem), como um anúncio patrocinado. Conta como
// visto quando fica com metade na tela por 1 segundo; dali em diante não volta (só uma vez) ou volta
// depois dos dias do banner, até tocar no botão. O X fecha na hora. Em /novidades (`jeito="pagina"`),
// fica sempre, sem X e sem contar.

// os cartões na tela agora: o que marcou "visto" enquanto está na tela continua nela; montado de novo
// (o voltar do navegador traz a lista antiga), o que já foi visto não aparece (e a lista não pula)
const naTela = new Set<string>();
const nada = () => () => {};

/** A grade da linha do tempo (a mesma de linha-do-tempo.tsx): a hora, o nó e o objeto. */
const GRADE = "sm:grid sm:grid-cols-[48px_32px_minmax(0,1fr)] sm:gap-x-2";

export function CartaoDoPublike({
  banner,
  jeito,
  data = null,
  novidades = false,
}: {
  banner: BannerNoAr;
  jeito: "lista" | "linha" | "pagina";
  /** em /novidades: o dia ("2 de novembro") */
  data?: string | null;
  /** o banner também está em /novidades: "Do Publike" leva para lá */
  novidades?: boolean;
}) {
  const pagina = jeito === "pagina";
  // no servidor (e na primeira pintura) aparece: o servidor só manda o que a pessoa ainda pode ver
  const jaVisto = useSyncExternalStore(
    nada,
    () => !pagina && !naTela.has(banner.id) && jaViu(banner),
    () => false,
  );
  const [fechado, setFechado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const caixa = useRef<HTMLElement>(null);
  const contado = useRef(false);

  // visto: metade na tela por 1 segundo (rolar rápido por cima não conta)
  useEffect(() => {
    const el = caixa.current;
    if (pagina || jaVisto || !el || typeof IntersectionObserver === "undefined") return;
    let espera: number | undefined;
    const olho = new IntersectionObserver(
      ([e]) => {
        window.clearTimeout(espera);
        if (!e?.isIntersecting || contado.current) return;
        espera = window.setTimeout(() => {
          contado.current = true;
          // primeiro aqui, depois no cookie: este continua na tela
          naTela.add(banner.id);
          marcarVisto(banner.id);
          contar(banner.id, "visto");
          olho.disconnect();
        }, 1000);
      },
      { threshold: 0.5 },
    );
    olho.observe(el);
    return () => {
      window.clearTimeout(espera);
      olho.disconnect();
      naTela.delete(banner.id);
    };
  }, [banner.id, jaVisto, pagina]);

  if (jaVisto || fechado) return null;

  function clicou() {
    if (pagina) return;
    naTela.add(banner.id);
    contar(banner.id, "clique");
    marcarVisto(banner.id, true);
  }

  function fechar() {
    contar(banner.id, "fechou");
    marcarVisto(banner.id);
    setFechado(true);
  }

  const url = () => new URL(LINK_COMPARTILHAR, window.location.origin).toString();
  const mensagem = () => `${banner.texto ?? banner.titulo} ${url()}`;
  async function compartilhar() {
    clicou();
    if (navigator.share) {
      try {
        await navigator.share({ title: "Publike", text: banner.texto ?? banner.titulo, url: url() });
      } catch {
        // desistiu do compartilhar
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(mensagem());
      setCopiado(true);
    } catch {
      window.open(`https://wa.me/?text=${encodeURIComponent(mensagem())}`, "_blank", "noopener");
    }
  }

  const selo = (
    <span className="inline-flex items-center gap-1.5 text-label text-ink">
      <Simbolo altura={18} className="shrink-0" />
      Do Publike
    </span>
  );

  const cartao = (
    <article
      ref={caixa}
      aria-label={`Do Publike: ${banner.titulo}`}
      data-cartao-publike={banner.id}
      className={`relative flex min-w-0 flex-col overflow-hidden border border-line bg-surface-200 shadow-card ${
        jeito === "linha" ? "rounded-[18px]" : "rounded-lg"
      } ${jeito === "lista" ? "col-span-full" : ""} ${banner.imagem ? "sm:flex-row" : ""}`}
    >
      {banner.imagem && (
        // eslint-disable-next-line @next/next/no-img-element -- a imagem vem do Storage, já ajustada no admin
        <img
          src={banner.imagem}
          alt=""
          className="block max-h-48 w-full shrink-0 bg-surface-300 object-cover sm:max-h-none sm:w-56 sm:self-stretch"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5">
        <p className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 ${pagina ? "" : "pr-9"}`}>
          {novidades && !pagina ? (
            <Link href="/novidades" className="relative z-[1] hover:underline">
              {selo}
            </Link>
          ) : (
            selo
          )}
          {data && <span className="text-body-sm text-ink-muted">· {data}</span>}
        </p>
        <div>
          <h3 className="font-display text-[17px] leading-[22px] font-bold tracking-[-0.01em] text-balance sm:text-[19px] sm:leading-6">
            {banner.titulo}
          </h3>
          {banner.texto && <p className="mt-1 text-body-sm whitespace-pre-line text-ink-muted">{banner.texto}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {banner.acao === "compartilhar" ? (
            <>
              <button type="button" onClick={compartilhar} className={classesBotao("primario", "sm")}>
                {copiado ? <Check aria-hidden /> : <Share2 aria-hidden />}
                {copiado ? "Link copiado" : banner.botao}
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`${banner.texto ?? banner.titulo} ${LINK_COMPARTILHAR}`)}`}
                onClick={(e) => {
                  e.currentTarget.href = `https://wa.me/?text=${encodeURIComponent(mensagem())}`;
                  clicou();
                }}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center text-label text-ink-muted underline underline-offset-2 hover:text-ink"
              >
                Mandar no WhatsApp
              </a>
              {copiado && (
                <p role="status" className="w-full text-body-sm text-ink-muted">
                  Cole no WhatsApp, num grupo ou onde quiser.
                </p>
              )}
            </>
          ) : (
            // sem botão: uma novidade de Admin › Novidades sem link
            banner.botao && (
              <Link href={banner.link ?? "/"} onClick={clicou} className={classesBotao("primario", "sm")}>
                {banner.botao}
                <ArrowRight aria-hidden />
              </Link>
            )
          )}
        </div>
      </div>
      {!pagina && (
        <button
          type="button"
          onClick={fechar}
          aria-label="Fechar"
          className="absolute top-2 right-2 z-[2] inline-flex size-10 items-center justify-center rounded-pill bg-surface-200/90 text-ink-muted hover:bg-surface-300 hover:text-ink"
        >
          <X aria-hidden className="size-5" />
        </button>
      )}
    </article>
  );

  if (jeito !== "linha") return cartao;
  return (
    <div className={`${GRADE} items-start`}>
      <span aria-hidden className="hidden sm:block" />
      <span
        aria-hidden
        className="relative z-[1] mt-2.5 hidden size-8 place-items-center justify-self-center rounded-pill bg-surface-200 shadow-[0_0_0_4px_var(--pk-surface-100)] ring-1 ring-line sm:grid"
      >
        <Simbolo altura={18} />
      </span>
      {cartao}
    </div>
  );
}
