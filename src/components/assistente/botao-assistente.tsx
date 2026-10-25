"use client";

import { MessageCircleQuestion, MessagesSquare, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from "react";
import {
  avisarNaoLidas,
  EVENTO_ABRIR_CHAT,
  EVENTO_ABRIR_CONVERSA,
  marcarChatNaPagina,
  type PedidoConversa,
} from "@/lib/abrir-conversa";
import { PainelConversas, useConversasDoChat } from "../conversa/janela-mensagens";
import { Conversa } from "./conversa";
import { mudarConversa, useConversa } from "./conversa-estado";

// Onde o botão não aparece: o admin, a entrada pelo link e o Descobrir (os botões
// de curtir ficam embaixo).
const SEM_BOTAO = [/^\/admin/, /^\/auth\//, /^\/descobrir/];

/** Marca no endereço enquanto a conversa está aberta: o "voltar" do celular fecha a conversa, não o site. */
const MARCA = "#assistente";

/**
 * No celular, a conversa ocupa a parte visível da tela (a área acima do
 * teclado, quando ele abre), deixando uma faixa da página no topo. Assim o
 * cabeçalho com o "Fechar" fica sempre à vista.
 */
function useAreaVisivel(ativo: boolean) {
  const [area, setArea] = useState<{ topo: number; altura: number } | null>(null);
  useEffect(() => {
    if (!ativo) return;
    const vv = window.visualViewport;
    const celular = window.matchMedia("(max-width: 767px)");
    const medir = () => {
      if (!celular.matches) return setArea(null);
      setArea({ topo: vv?.offsetTop ?? 0, altura: vv?.height ?? window.innerHeight });
    };
    medir();
    vv?.addEventListener("resize", medir);
    vv?.addEventListener("scroll", medir);
    celular.addEventListener("change", medir);
    return () => {
      vv?.removeEventListener("resize", medir);
      vv?.removeEventListener("scroll", medir);
      celular.removeEventListener("change", medir);
    };
  }, [ativo]);
  return area;
}

/**
 * No celular, o botão mostra "Chat" no topo da página e vira só o
 * ícone depois que a pessoa rola (assim tapa menos os cartões); volta a mostrar
 * o texto quando ela sobe de novo. Descendo a lista, ele sai da frente (fica no canto onde
 * passam os botões Curtir) e volta assim que ela sobe. No computador, o texto fica sempre.
 */
function useSoIcone() {
  const [soIcone, setSoIcone] = useState(false);
  const [escondido, setEscondido] = useState(false);
  useEffect(() => {
    const celular = window.matchMedia("(max-width: 639px)");
    let antes = window.scrollY;
    const medir = () => {
      const y = window.scrollY;
      setSoIcone(celular.matches && y > 120);
      // pequenas mexidas (o dedo parado) não escondem nem mostram
      if (Math.abs(y - antes) > 8) {
        setEscondido(celular.matches && y > 120 && y > antes);
        antes = y;
      }
    };
    medir();
    window.addEventListener("scroll", medir, { passive: true });
    celular.addEventListener("change", medir);
    return () => {
      window.removeEventListener("scroll", medir);
      celular.removeEventListener("change", medir);
    };
  }, []);
  return { soIcone, escondido };
}

/**
 * O "Chat" no canto da tela: um botão só, com duas abas dentro. Ajuda é a conversa
 * com o assistente do Publike; Conversas são os matches (a lista e a conversa aberta
 * ali mesmo). O número no botão são as mensagens não lidas.
 */
export function BotaoAssistente({ ajuda, usuarioId }: { ajuda: boolean; usuarioId: string | null }) {
  const caminho = usePathname() ?? "/";
  const [aberto, setAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const quemAbriu = useRef<HTMLElement | null>(null);
  const area = useAreaVisivel(aberto);
  const { soIcone, escondido } = useSoIcone();
  const conversa = useConversa();
  const { conversas, carregar, marcarLida, naoLidas } = useConversasDoChat(usuarioId);
  // abre na aba que tem novidade: mensagem não lida vai direto para Conversas
  const [aba, setAba] = useState<"ajuda" | "conversas">("ajuda");
  // conversa pedida de fora do chat (o "Deu match!" da vaga): abre direto nela
  const [pedida, setPedida] = useState<PedidoConversa | null>(null);

  function abrir(conversaPedida: PedidoConversa | null = null) {
    setPedida(conversaPedida);
    setAba(conversaPedida || naoLidas > 0 || !ajuda ? "conversas" : "ajuda");
    // um passo a mais no histórico: o "voltar" fecha a conversa
    if (window.location.hash !== MARCA) {
      window.history.pushState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}${MARCA}`,
      );
    }
    setAberto(true);
  }

  const aoPedirConversa = useEffectEvent((e: Event) => {
    // quem abriu (o ícone do cabeçalho, no celular) recebe o foco de volta ao fechar
    quemAbriu.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    abrir(e.type === EVENTO_ABRIR_CONVERSA ? (e as CustomEvent<PedidoConversa>).detail : null);
  });
  useEffect(() => {
    // só com conta: as conversas são dos matches
    if (!usuarioId) return;
    marcarChatNaPagina(true);
    const ouvir = (e: Event) => aoPedirConversa(e);
    window.addEventListener(EVENTO_ABRIR_CONVERSA, ouvir);
    window.addEventListener(EVENTO_ABRIR_CHAT, ouvir);
    return () => {
      marcarChatNaPagina(false);
      window.removeEventListener(EVENTO_ABRIR_CONVERSA, ouvir);
      window.removeEventListener(EVENTO_ABRIR_CHAT, ouvir);
    };
  }, [usuarioId]);

  // o ícone do cabeçalho mostra o mesmo número
  useEffect(() => {
    if (usuarioId) avisarNaoLidas(naoLidas);
  }, [usuarioId, naoLidas]);

  function fechar() {
    if (window.location.hash === MARCA) window.history.back();
    else setAberto(false);
    const volta = quemAbriu.current;
    quemAbriu.current = null;
    requestAnimationFrame(() => (volta?.isConnected ? volta : botao.current)?.focus());
  }

  const aoTeclar = useEffectEvent((e: globalThis.KeyboardEvent) => {
    if (e.key === "Escape") fechar();
  });

  useEffect(() => {
    if (!aberto) return;
    const aoVoltar = () => {
      if (window.location.hash !== MARCA) setAberto(false);
    };
    const tecla = (e: globalThis.KeyboardEvent) => aoTeclar(e);
    window.addEventListener("popstate", aoVoltar);
    window.addEventListener("keydown", tecla);
    // no celular, a página atrás não rola junto
    const raiz = document.documentElement;
    const antes = raiz.style.overflow;
    if (window.matchMedia("(max-width: 767px)").matches) raiz.style.overflow = "hidden";
    return () => {
      window.removeEventListener("popstate", aoVoltar);
      window.removeEventListener("keydown", tecla);
      raiz.style.overflow = antes;
    };
  }, [aberto]);

  // sem o botão (admin, Descobrir), o Chat ainda abre pelo ícone do cabeçalho
  const semBotao = SEM_BOTAO.some((r) => r.test(caminho));

  // no celular: a folha vai do topo da área visível (com uma folga) até o fim dela
  const folga = area ? Math.min(72, Math.max(16, area.altura * 0.08)) : 0;
  const estilo: CSSProperties | undefined = area
    ? { top: area.topo + folga, height: area.altura - folga, bottom: "auto" }
    : undefined;

  return (
    <>
      {!aberto && !semBotao && (
        <button
          ref={botao}
          type="button"
          onClick={() => abrir()}
          aria-haspopup="dialog"
          data-assistente="botao"
          // no celular, não aparece (cobria o Curtir dos cartões): quem tem conta tem as Mensagens na barra de
          // baixo, e o visitante, a Ajuda no cabeçalho. Com a barra do Curtir (página da vaga), sobe
          className={`max-md:hidden fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 [html[data-barra-curtir]_&]:max-lg:bottom-[calc(9.5rem+env(safe-area-inset-bottom))] inline-flex h-12 min-w-12 items-center justify-center rounded-pill bg-ink text-label text-surface-100 shadow-raised transition-[padding,transform,opacity] duration-200 hover:scale-[1.03] motion-reduce:transition-none md:right-6 md:bottom-6 ${
            soIcone ? "px-3.5" : "px-4"
          } ${escondido ? "pointer-events-none translate-y-24 opacity-0" : ""}`}
        >
          <MessagesSquare aria-hidden className="size-5 shrink-0" />
          {/* recolhido, o texto some da tela mas continua sendo o nome do botão */}
          <span
            className={`overflow-hidden whitespace-nowrap transition-[max-width,margin-left,opacity] duration-200 motion-reduce:transition-none ${
              soIcone ? "ml-0 max-w-0 opacity-0" : "ml-2 max-w-36 opacity-100"
            }`}
          >
            Chat
          </span>
          {naoLidas > 0 && (
            <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-pill bg-like px-1.5 text-caption text-surface-100 tabular-nums">
              {naoLidas > 99 ? "99+" : naoLidas}
              <span className="sr-only"> mensagens não lidas</span>
            </span>
          )}
        </button>
      )}
      {aberto && (
        <>
          {/* fundo escurecido: tocar fora fecha (só no celular) */}
          <div aria-hidden onClick={fechar} className="fixed inset-0 z-50 bg-veu md:hidden" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Chat do Publike"
            style={estilo}
            // um link da conversa leva para outra página: a conversa fecha
            onClickCapture={(e) => {
              if ((e.target as HTMLElement).closest("a")) setAberto(false);
            }}
            className="fixed inset-x-0 bottom-0 z-50 flex h-[88dvh] flex-col overflow-hidden rounded-t-2xl bg-surface-100 shadow-raised md:inset-x-auto md:right-6 md:bottom-6 md:h-[min(38rem,calc(100dvh-6rem))] md:w-[25rem] md:rounded-2xl md:border md:border-line"
          >
            <div className="shrink-0 border-b border-line bg-surface-200">
              <div aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-pill bg-line-strong/60 md:hidden" />
              <div className="flex items-center gap-2 px-3 py-2">
                <div role="tablist" aria-label="Chat" className="flex min-w-0 flex-1 gap-1">
                  {(
                    [
                      { id: "ajuda", nome: "Ajuda", icone: MessageCircleQuestion, numero: 0 },
                      { id: "conversas", nome: "Conversas", icone: MessagesSquare, numero: naoLidas },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={aba === t.id}
                      onClick={() => setAba(t.id)}
                      className={`inline-flex min-h-10 items-center gap-1.5 rounded-pill px-3.5 text-label transition-colors ${
                        aba === t.id ? "bg-ink text-surface-100" : "text-ink-muted hover:bg-surface-300 hover:text-ink"
                      }`}
                    >
                      <t.icone aria-hidden className="size-4 shrink-0" />
                      {t.nome}
                      {t.numero > 0 && (
                        <span className="inline-flex min-w-5 items-center justify-center rounded-pill bg-like px-1.5 text-caption text-surface-100 tabular-nums">
                          {t.numero}
                          <span className="sr-only"> não lidas</span>
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {aba === "ajuda" && conversa.length > 0 && (
                  <button
                    type="button"
                    onClick={() => mudarConversa([])}
                    title="Nova conversa"
                    className="flex size-10 shrink-0 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink"
                  >
                    <RotateCcw aria-hidden className="size-[18px]" />
                    <span className="sr-only">Nova conversa com o assistente</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={fechar}
                  aria-label="Fechar o chat"
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-pill border border-line-strong bg-surface-100 hover:bg-surface-300"
                >
                  <X aria-hidden className="size-4" />
                </button>
              </div>
            </div>
            {aba === "ajuda" ? (
              ajuda ? (
                <Conversa autoFoco className="flex-1" />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                  <p className="text-body-sm text-ink-muted">
                    Respostas para as dúvidas mais comuns sobre vagas, serviços, currículo e o match.
                  </p>
                  <Link href="/ajuda" className="text-label text-terra-text underline underline-offset-2">
                    Abrir a central de ajuda
                  </Link>
                </div>
              )
            ) : (
              <PainelConversas
                key={pedida ? pedida.outroId : "lista"}
                pedida={pedida}
                usuarioId={usuarioId}
                conversas={conversas}
                carregar={carregar}
                marcarLida={marcarLida}
              />
            )}
          </div>
        </>
      )}
    </>
  );
}
