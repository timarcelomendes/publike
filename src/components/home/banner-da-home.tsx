"use client";

import { ArrowRight, Check, Search, Share2, Sparkles, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { avisoDeCookiesFechado, EVENTO_AVISO_COOKIES } from "@/components/aviso-cookies";
import { EVENTO_BOAS_VINDAS, esperandoBoasVindas } from "@/components/boas-vindas-parceiro";
import { Botao, classesBotao } from "@/components/ui/botao";
import {
  COOKIE_BANNERS,
  diaDeHoje,
  LINK_COMPARTILHAR,
  paginaDoBanner,
  podeMostrar,
  lerBannersVistos,
  valorComBannerVisto,
  type AcaoBanner,
  type BannerNoAr,
} from "@/lib/banners";

// O banner (criado no admin): uma janela que sobe de baixo no celular e fica no meio da tela no
// computador, nas páginas que o banner escolheu (a inicial, por padrão), depois dos segundos dele.
// Uma janela por visita: se as boas-vindas, a pergunta da inicial ou o aviso de cookies apareceram,
// ou se outro banner já abriu, fica para a próxima. Só uma vez, ou de novo a cada N dias até tocar
// no botão (o cookie publike_banners e, com conta, o banco). Conta quando aparece, quando tocam no
// botão e quando fecham (/api/banners).

// valem para a visita inteira (até recarregar), mesmo trocando de página
let houveOutraNestaVisita = false;
let abriuNestaVisita = false;
const ICONES: Record<AcaoBanner, LucideIcon> = {
  novas: Sparkles,
  busca: Search,
  link: ArrowRight,
  compartilhar: Share2,
};

function assinar(avisar: () => void) {
  for (const e of [EVENTO_BOAS_VINDAS, EVENTO_AVISO_COOKIES, "storage"]) window.addEventListener(e, avisar);
  return () => {
    for (const e of [EVENTO_BOAS_VINDAS, EVENTO_AVISO_COOKIES, "storage"]) window.removeEventListener(e, avisar);
  };
}

/** Outra janela vem antes: as boas-vindas da primeira visita (ou a pergunta da inicial) e o aviso de cookies. */
function outroAvisoAntes() {
  return esperandoBoasVindas("/") || !avisoDeCookiesFechado();
}

function cookieDosBanners() {
  return document.cookie.match(new RegExp(`(?:^|; )${COOKIE_BANNERS}=([^;]*)`))?.[1] ?? "";
}

/** Já apareceu neste navegador (hoje, ou "só uma vez", ou tocou no botão)? */
function jaViu(banner: BannerNoAr) {
  const visto = lerBannersVistos(decodeURIComponent(cookieDosBanners())).get(banner.id);
  return !podeMostrar(banner.repetir_dias, visto, diaDeHoje(Date.now()));
}

/** Guarda que este navegador viu o banner hoje (ou tocou no botão), por um ano. */
function marcarVisto(id: string, clicou = false) {
  const valor = valorComBannerVisto(decodeURIComponent(cookieDosBanners()), id, diaDeHoje(Date.now()), clicou);
  document.cookie = `${COOKIE_BANNERS}=${encodeURIComponent(valor)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

function contar(id: string, evento: "visto" | "clique" | "fechou") {
  const corpo = JSON.stringify({ id, evento });
  try {
    if (navigator.sendBeacon?.("/api/banners", new Blob([corpo], { type: "application/json" }))) return;
  } catch {
    // sem sendBeacon: vai pelo fetch
  }
  void fetch("/api/banners", {
    method: "POST",
    body: corpo,
    headers: { "content-type": "application/json" },
    keepalive: true,
  }).catch(() => {});
}

/** Escolhe o banner da página aberta: o primeiro (o mais novo) que pode abrir aqui. */
export function BannerDoSite({ banners }: { banners: BannerNoAr[] }) {
  const caminho = usePathname() ?? "/";
  const busca = useSearchParams();
  const pagina = paginaDoBanner(caminho, Boolean(busca?.get("q")));
  const banner = pagina ? banners.find((b) => b.paginas.includes(pagina)) : undefined;
  if (!banner) return null;
  // trocou de página: a espera começa de novo
  return <BannerDaHome key={`${banner.id}-${caminho}`} banner={banner} />;
}

export function BannerDaHome({ banner }: { banner: BannerNoAr }) {
  // no servidor (e antes de ler o navegador) não aparece
  const esperando = useSyncExternalStore(assinar, outroAvisoAntes, () => true);
  const [pronto, setPronto] = useState(false);
  const [fechado, setFechado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const dialogo = useRef<HTMLDialogElement>(null);

  // uma janela por visita: se outra apareceu (as boas-vindas, a pergunta da inicial, o aviso de
  // cookies ou outro banner), o banner fica para a próxima. Sem outra, espera os segundos do banner.
  useEffect(() => {
    if (outroAvisoAntes()) {
      houveOutraNestaVisita = true;
      return;
    }
    if (houveOutraNestaVisita || abriuNestaVisita || jaViu(banner)) return;
    const t = window.setTimeout(() => setPronto(true), Math.max(0, banner.atraso) * 1000);
    return () => window.clearTimeout(t);
  }, [esperando, banner]);

  const mostrar = pronto && !fechado;
  useEffect(() => {
    const d = dialogo.current;
    if (!mostrar || !d || d.open) return;
    d.showModal();
    abriuNestaVisita = true;
    marcarVisto(banner.id);
    contar(banner.id, "visto");
  }, [mostrar, banner.id]);

  function fechar(evento: "fechou" | "clique") {
    contar(banner.id, evento);
    if (evento === "clique") marcarVisto(banner.id, true);
    dialogo.current?.close();
    setFechado(true);
  }

  const url = () => new URL(LINK_COMPARTILHAR, window.location.origin).toString();
  const mensagem = () => `${banner.texto ?? banner.titulo} ${url()}`;

  async function compartilhar() {
    contar(banner.id, "clique");
    marcarVisto(banner.id, true);
    if (navigator.share) {
      try {
        await navigator.share({ title: "Publike", text: banner.texto ?? banner.titulo, url: url() });
        dialogo.current?.close();
        setFechado(true);
      } catch {
        // desistiu do compartilhar: a janela fica
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

  if (!mostrar) return null;
  const Icone = ICONES[banner.acao];

  return (
    <dialog
      ref={dialogo}
      aria-labelledby="banner-titulo"
      aria-describedby={banner.texto ? "banner-texto" : undefined}
      onCancel={(e) => {
        e.preventDefault();
        fechar("fechou");
      }}
      onClick={(e) => {
        // toque fora do quadro fecha
        if (e.target === e.currentTarget) fechar("fechou");
      }}
      data-banner={banner.id}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-lg border border-line-strong bg-surface-200 p-0 text-ink shadow-raised backdrop:bg-veu sm:m-auto sm:max-w-md sm:rounded-lg"
    >
      <div className="flex flex-col gap-5 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <span className="flex size-12 items-center justify-center rounded-pill bg-terra-soft text-terra-text">
            <Icone aria-hidden className="size-6" />
          </span>
          <button
            type="button"
            onClick={() => fechar("fechou")}
            aria-label="Fechar"
            className="-mt-1 -mr-1 inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>

        <div>
          <h2 id="banner-titulo" className="text-h2 text-balance">
            {banner.titulo}
          </h2>
          {banner.texto && (
            <p id="banner-texto" className="mt-2 text-body whitespace-pre-line text-ink-muted">
              {banner.texto}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {banner.acao === "compartilhar" ? (
            <>
              <Botao variante="primario" onClick={compartilhar} className="w-full">
                {copiado ? <Check aria-hidden /> : <Share2 aria-hidden />}
                {copiado ? "Link copiado" : banner.botao}
              </Botao>
              {copiado && (
                <p role="status" className="text-center text-body-sm text-ink-muted">
                  Cole no WhatsApp, num grupo ou onde quiser.
                </p>
              )}
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`${banner.texto ?? banner.titulo} ${LINK_COMPARTILHAR}`)}`}
                onClick={(e) => {
                  // o link completo (com o endereço do site) só existe no navegador
                  e.currentTarget.href = `https://wa.me/?text=${encodeURIComponent(mensagem())}`;
                  contar(banner.id, "clique");
                  marcarVisto(banner.id, true);
                }}
                target="_blank"
                rel="noopener noreferrer"
                className="text-center text-label text-ink-muted underline underline-offset-2 hover:text-ink"
              >
                Mandar no WhatsApp
              </a>
            </>
          ) : (
            <Link
              href={banner.link ?? "/"}
              onClick={() => fechar("clique")}
              className={classesBotao("primario", "md", "w-full")}
            >
              {banner.botao}
              <ArrowRight aria-hidden />
            </Link>
          )}
          <button
            type="button"
            onClick={() => fechar("fechou")}
            className="min-h-11 text-label text-ink-muted hover:text-ink"
          >
            Agora não
          </button>
        </div>
      </div>
    </dialog>
  );
}
