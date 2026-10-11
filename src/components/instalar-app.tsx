"use client";

import { Download, EllipsisVertical, Share, SquarePlus, X } from "lucide-react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { classesBotao } from "./ui/botao";

// "Instale o app do Publike" (PWA).
//   Android e computador (Chrome, Edge, Samsung): o navegador oferece instalar e o
//   botão "Instalar" abre a janela dele, em um toque.
//   iPhone e iPad: a Apple não deixa o site instalar sozinho; mostramos o caminho
//   (Compartilhar → Adicionar à Tela de Início).
//   Safari no Mac: Arquivo → Adicionar ao Dock.
// O convite aparece sozinho uma vez (depois de alguns segundos no site); quem toca
// em "Agora não" só vê de novo em 30 dias. O "Instalar o app" do rodapé abre sempre.

type EventoInstalar = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Jeito = "botao" | "iphone" | "mac" | "menu" | "app-de-rede" | "outro" | "instalado";

const DISPENSADO = "publike_instalar_dispensado";
const TRINTA_DIAS = 30 * 24 * 3600 * 1000;
const ESPERA_MS = 12000;
const EVENTO_ABRIR = "publike:instalar";
// páginas onde o convite atrapalha
const SEM_CONVITE = ["/entrar", "/auth", "/admin", "/perfil", "/publicar", "/painel/conversas/"];

// o pedido do navegador chega uma vez só, em qualquer página: guardado fora do React
let pedido: EventoInstalar | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());
function assinar(f: () => void) {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

function emTelaCheia() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function jeitoDeInstalar(): Jeito {
  if (emTelaCheia()) return "instalado";
  if (pedido) return "botao";
  const ua = navigator.userAgent;
  if (/FBAN|FBAV|Instagram|Line\/|TikTok/i.test(ua)) return "app-de-rede";
  const iphone = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (iphone) return "iphone";
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/.test(ua)) return "mac";
  // Chrome e Edge sem o pedido (já instalado, ou ainda decidindo) e Firefox no Android: pelo menu
  if (/Chrome|Chromium|Edg|SamsungBrowser/.test(ua) || (/Android/.test(ua) && /Firefox/.test(ua))) return "menu";
  return "outro";
}

function dispensadoHaPouco() {
  try {
    const quando = Number(window.localStorage.getItem(DISPENSADO));
    return Boolean(quando) && Date.now() - quando < TRINTA_DIAS;
  } catch {
    return false;
  }
}

function dispensar() {
  try {
    window.localStorage.setItem(DISPENSADO, String(Date.now()));
  } catch {
    // sem armazenamento: o convite volta na próxima visita
  }
}

/** Botão "Instalar o app" (rodapé): abre o convite com o jeito de instalar deste aparelho. */
export function BotaoInstalarApp({ className }: { className?: string }) {
  const instalado = useSyncExternalStore(
    assinar,
    () => emTelaCheia(),
    () => false,
  );
  if (instalado) return null;
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR))} className={className}>
      Instalar o app
    </button>
  );
}

/** Registra o service worker e mostra o convite para instalar. Vai uma vez no layout. */
export function ConviteInstalar() {
  const caminho = usePathname();
  const [aberto, setAberto] = useState<"auto" | "pedido" | null>(null);
  const temPedido = useSyncExternalStore(
    assinar,
    () => pedido !== null,
    () => false,
  );
  const [jeito, setJeito] = useState<Jeito>("outro");
  const titulo = useId();

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    const aoPedir = (e: Event) => {
      e.preventDefault(); // o convite é nosso, na hora certa
      pedido = e as EventoInstalar;
      avisar();
    };
    const aoInstalar = () => {
      pedido = null;
      setAberto(null);
      avisar();
    };
    const aoAbrir = () => {
      setJeito(jeitoDeInstalar());
      setAberto("pedido");
    };
    window.addEventListener("beforeinstallprompt", aoPedir);
    window.addEventListener("appinstalled", aoInstalar);
    window.addEventListener(EVENTO_ABRIR, aoAbrir);
    return () => {
      window.removeEventListener("beforeinstallprompt", aoPedir);
      window.removeEventListener("appinstalled", aoInstalar);
      window.removeEventListener(EVENTO_ABRIR, aoAbrir);
    };
  }, []);

  // convite sozinho: uma vez, depois de alguns segundos, só onde dá para instalar
  useEffect(() => {
    if (aberto || dispensadoHaPouco()) return;
    if (SEM_CONVITE.some((c) => caminho.startsWith(c))) return;
    const espera = window.setTimeout(() => {
      const j = jeitoDeInstalar();
      if (j !== "botao" && j !== "iphone" && j !== "mac") return;
      setJeito(j);
      setAberto("auto");
    }, ESPERA_MS);
    return () => window.clearTimeout(espera);
  }, [caminho, aberto, temPedido]);

  if (!aberto) return null;

  function fechar() {
    if (aberto === "auto") dispensar();
    setAberto(null);
  }

  async function instalar() {
    const p = pedido;
    if (!p) return;
    await p.prompt();
    const { outcome } = await p.userChoice;
    pedido = null; // o navegador só deixa usar uma vez
    avisar();
    if (outcome === "dismissed") dispensar();
    setAberto(null);
  }

  return (
    <div
      role="dialog"
      aria-labelledby={titulo}
      className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[45] rounded-lg border border-line-strong bg-surface-200 p-4 shadow-raised md:inset-x-auto md:bottom-6 md:left-6 md:w-[24rem]"
    >
      <button
        type="button"
        onClick={fechar}
        aria-label="Fechar"
        className="absolute top-2 right-2 inline-flex size-10 items-center justify-center rounded-md text-ink-muted hover:bg-surface-300 hover:text-ink"
      >
        <X aria-hidden className="size-5" />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <Image
          src="/icons/icon-192.png"
          alt=""
          width={48}
          height={48}
          unoptimized
          className="size-12 shrink-0 rounded-xl border border-line"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <p id={titulo} className="text-label">
            {jeito === "instalado" ? "O app do Publike já está aberto" : "Instale o app do Publike"}
          </p>
          <Explicacao jeito={jeito} />
        </div>
      </div>
      {jeito === "botao" && (
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={fechar} className={classesBotao("fantasma", "sm")}>
            Agora não
          </button>
          <button type="button" onClick={instalar} className={classesBotao("primario", "sm")}>
            <Download aria-hidden />
            Instalar
          </button>
        </div>
      )}
      {(jeito === "iphone" || jeito === "mac") && (
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={fechar} className={classesBotao("fantasma", "sm")}>
            {aberto === "auto" ? "Agora não" : "Entendi"}
          </button>
        </div>
      )}
    </div>
  );
}

function Explicacao({ jeito }: { jeito: Jeito }) {
  const passo = "flex items-center gap-2 text-body-sm";
  const icone = "size-4 shrink-0 text-terra-text";
  switch (jeito) {
    case "botao":
      return (
        <p className="text-body-sm text-ink-muted">
          Abra direto da tela inicial, em tela cheia, sem procurar o site. Não ocupa quase nada e é grátis.
        </p>
      );
    case "iphone":
      return (
        <>
          <p className="text-body-sm text-ink-muted">No iPhone, são dois toques:</p>
          <ol className="mt-1 flex flex-col gap-1.5">
            <li className={passo}>
              <Share aria-hidden className={icone} />
              <span>
                1. Toque em <strong>Compartilhar</strong> (na barra do navegador)
              </span>
            </li>
            <li className={passo}>
              <SquarePlus aria-hidden className={icone} />
              <span>
                2. Escolha <strong>Adicionar à Tela de Início</strong>
              </span>
            </li>
          </ol>
        </>
      );
    case "mac":
      return (
        <p className="text-body-sm text-ink-muted">
          No Safari, abra o menu <strong>Arquivo</strong> e escolha <strong>Adicionar ao Dock</strong>.
        </p>
      );
    case "app-de-rede":
      return (
        <p className="flex flex-wrap items-center gap-1 text-body-sm text-ink-muted">
          Este navegador fica dentro de outro app. Toque em <EllipsisVertical aria-hidden className="size-4" /> e
          escolha <strong>Abrir no navegador</strong>; lá aparece a opção de instalar.
        </p>
      );
    case "menu":
      return (
        <p className="flex flex-wrap items-center gap-1 text-body-sm text-ink-muted">
          Abra o menu do navegador (<EllipsisVertical aria-hidden className="size-4" />) e escolha{" "}
          <strong>Instalar o Publike</strong> ou <strong>Adicionar à tela inicial</strong>. Se a opção não aparecer, o
          app já está instalado: procure o ícone do Publike.
        </p>
      );
    case "instalado":
      return <p className="text-body-sm text-ink-muted">Você já está usando o Publike como app neste aparelho.</p>;
    default:
      return (
        <p className="text-body-sm text-ink-muted">
          Este navegador não instala apps de sites. Abra o Publike no <strong>Chrome</strong>, no <strong>Edge</strong>{" "}
          ou no <strong>Safari</strong> e toque em “Instalar o app” de novo.
        </p>
      );
  }
}
