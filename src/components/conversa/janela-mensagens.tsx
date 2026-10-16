"use client";

import { ChevronDown, ChevronUp, ExternalLink, MessageCircleQuestion, MessagesSquare, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { abrirConversaDaJanela, conversasDaJanela } from "@/lib/acoes/mensagens";
import type { Conversa as ConversaResumo, MensagemConversa } from "@/lib/dados";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import { Avatar } from "../ui/basicos";
import { Conversa as ConversaAssistente } from "../assistente/conversa";
import { Conversa } from "./conversa";

// O chat no canto da tela, como no LinkedIn: embaixo, à direita, em todas as páginas,
// com duas abas juntas: Ajuda (o assistente do Publike) e Conversas (os matches).
// Cada conversa abre numa janelinha ao lado, sem sair da página. No celular, um
// ícone no cabeçalho leva à página de conversas e o assistente continua no botão.

const SEM_JANELA = /^\/(painel\/conversas|admin|entrar|auth|email|versao)/;
const MAX_ABERTAS = 2;

type Aberta = {
  chave: string;
  anuncio_id: string;
  outro_id: string;
  outro_nome: string;
  outro_foto: string | null;
  titulo: string;
  minimizada: boolean;
  dados: { perfilId: string; euId: string; mensagens: MensagemConversa[] } | null;
};

function quando(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  return mesmoDia
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

const noNavegador = () => true;
const noServidor = () => false;

/** Com a barra no canto, o botão solto do assistente some no computador (globals.css). */
function marcarJanela(estado: "presente" | null) {
  if (estado) document.documentElement.dataset.janelaMensagens = estado;
  else delete document.documentElement.dataset.janelaMensagens;
}

export function JanelaMensagens({ usuarioId, ajuda }: { usuarioId: string; ajuda: boolean }) {
  const caminho = usePathname() ?? "/";
  const montado = useSyncExternalStore(() => () => {}, noNavegador, noServidor);
  const [conversas, setConversas] = useState<ConversaResumo[] | null>(null);
  // o chat do canto: fechado, ou aberto na aba Ajuda ou Conversas
  const [aba, setAba] = useState<"ajuda" | "conversas" | null>(null);
  const [busca, setBusca] = useState("");
  const [abertas, setAbertas] = useState<Aberta[]>([]);
  const carregando = useRef(false);
  const escondida = SEM_JANELA.test(caminho);

  const carregar = useCallback(async () => {
    if (carregando.current) return;
    carregando.current = true;
    try {
      setConversas(await conversasDaJanela());
    } finally {
      carregando.current = false;
    }
  }, []);

  // carrega ao abrir o site e recarrega quando chega mensagem nova (Realtime respeita quem pode ler)
  useEffect(() => {
    if (escondida) return;
    void carregar();
    const supabase = criarClienteNavegador();
    let espera: ReturnType<typeof setTimeout> | null = null;
    const canal = supabase
      .channel(`janela-mensagens-${usuarioId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensagens" }, () => {
        if (espera) clearTimeout(espera);
        espera = setTimeout(() => void carregar(), 800);
      })
      .subscribe();
    // se o Realtime cair, a lista se atualiza sozinha de tempos em tempos (com a aba à vista)
    const relogio = setInterval(() => {
      if (document.visibilityState === "visible") void carregar();
    }, 60_000);
    return () => {
      clearInterval(relogio);
      if (espera) clearTimeout(espera);
      supabase.removeChannel(canal);
    };
  }, [carregar, escondida, usuarioId]);

  // no computador, a "Ajuda" fica nesta barra: o botão solto do assistente some (globals.css)
  useEffect(() => {
    if (escondida || !montado) return marcarJanela(null);
    marcarJanela("presente");
    return () => marcarJanela(null);
  }, [escondida, montado]);

  async function abrir(c: ConversaResumo) {
    const chave = `${c.anuncio_id}:${c.outro_id}`;
    setAbertas((atual) => {
      const ja = atual.find((a) => a.chave === chave);
      if (ja) return atual.map((a) => (a.chave === chave ? { ...a, minimizada: false } : a));
      const nova: Aberta = {
        chave,
        anuncio_id: c.anuncio_id,
        outro_id: c.outro_id,
        outro_nome: c.outro_nome,
        outro_foto: c.outro_foto,
        titulo: c.anuncio_titulo,
        minimizada: false,
        dados: null,
      };
      return [nova, ...atual].slice(0, MAX_ABERTAS);
    });
    const r = await abrirConversaDaJanela(c.anuncio_id, c.outro_id);
    setAbertas((atual) =>
      atual.map((a) =>
        a.chave === chave && r
          ? { ...a, dados: { perfilId: r.conversa.perfil_id, euId: r.euId, mensagens: r.mensagens } }
          : a,
      ),
    );
    // abrir marca como lida: o número some
    setConversas(
      (atual) => atual?.map((x) => (`${x.anuncio_id}:${x.outro_id}` === chave ? { ...x, nao_lidas: 0 } : x)) ?? null,
    );
  }

  const naoLidas = (conversas ?? []).reduce((t, c) => t + (c.nao_lidas ?? 0), 0);
  // no celular só o ícone no cabeçalho (a página de conversas faz o resto)
  const icone = <IconeMensagens naoLidas={naoLidas} />;
  if (!montado || escondida) return icone;
  const procurado = busca.trim().toLowerCase();
  const filtradas = (conversas ?? []).filter(
    (c) => !procurado || `${c.outro_nome} ${c.anuncio_titulo}`.toLowerCase().includes(procurado),
  );

  return (
    <>
      {icone}
      {createPortal(
        <div className="pointer-events-none fixed right-6 bottom-0 z-40 hidden items-end gap-3 md:flex">
          {abertas.map((a) => (
            <section
              key={a.chave}
              aria-label={`Conversa com ${a.outro_nome}`}
              className={`pointer-events-auto flex w-80 flex-col overflow-hidden rounded-t-lg border border-b-0 border-line-strong bg-surface-200 shadow-raised ${
                a.minimizada ? "" : "h-[26rem]"
              }`}
            >
              <header className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
                <button
                  type="button"
                  onClick={() =>
                    setAbertas((l) => l.map((x) => (x.chave === a.chave ? { ...x, minimizada: !x.minimizada } : x)))
                  }
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  aria-expanded={!a.minimizada}
                >
                  <Avatar nome={a.outro_nome} foto={a.outro_foto} tamanho={28} />
                  <span className="min-w-0">
                    <span className="block truncate text-label">{a.outro_nome}</span>
                    <span className="block truncate text-caption text-ink-muted">{a.titulo}</span>
                  </span>
                </button>
                <Link
                  href={`/painel/conversas/${a.anuncio_id}/${a.outro_id}`}
                  aria-label="Abrir em tela cheia"
                  className="inline-flex size-8 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink"
                >
                  <ExternalLink aria-hidden className="size-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => setAbertas((l) => l.filter((x) => x.chave !== a.chave))}
                  aria-label={`Fechar a conversa com ${a.outro_nome}`}
                  className="inline-flex size-8 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink"
                >
                  <X aria-hidden className="size-4" />
                </button>
              </header>
              {!a.minimizada &&
                (a.dados ? (
                  <Conversa
                    anuncioId={a.anuncio_id}
                    perfilId={a.dados.perfilId}
                    euId={a.dados.euId}
                    outroNome={a.outro_nome}
                    iniciais={a.dados.mensagens}
                    compacto
                  />
                ) : (
                  <p className="m-auto text-body-sm text-ink-muted">Abrindo a conversa…</p>
                ))}
            </section>
          ))}

          <section
            aria-label="Chat"
            className={`pointer-events-auto flex w-[22rem] flex-col overflow-hidden rounded-t-lg border border-b-0 border-line-strong bg-surface-200 shadow-raised ${
              aba ? "h-[34rem] max-h-[calc(100dvh-5rem)]" : ""
            }`}
          >
            {/* as duas abas do chat: a Ajuda (assistente) e as Conversas (os matches) */}
            <div role="tablist" aria-label="Chat" className="flex min-h-12 shrink-0 items-stretch">
              <button
                type="button"
                role="tab"
                aria-selected={aba === "ajuda"}
                onClick={() => setAba((a) => (a === "ajuda" ? null : "ajuda"))}
                className={`flex flex-1 items-center justify-center gap-2 border-b-2 px-3 text-label transition-colors hover:bg-surface-300 ${
                  aba === "ajuda" ? "border-ink" : "border-transparent text-ink-muted"
                }`}
              >
                <MessageCircleQuestion aria-hidden className="size-5 shrink-0" />
                Ajuda
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={aba === "conversas"}
                onClick={() => {
                  setAba((a) => (a === "conversas" ? null : "conversas"));
                  if (aba !== "conversas") void carregar();
                }}
                className={`flex flex-1 items-center justify-center gap-2 border-b-2 px-3 text-label transition-colors hover:bg-surface-300 ${
                  aba === "conversas" ? "border-ink" : "border-transparent text-ink-muted"
                }`}
              >
                <MessagesSquare aria-hidden className="size-5 shrink-0" />
                Conversas
                {naoLidas > 0 && (
                  <span className="inline-flex min-w-6 items-center justify-center rounded-pill bg-like px-1.5 text-caption text-surface-100 tabular-nums">
                    {naoLidas > 99 ? "99+" : naoLidas}
                    <span className="sr-only"> não lidas</span>
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setAba((a) => (a ? null : "conversas"))}
                aria-label={aba ? "Fechar o chat" : "Abrir o chat"}
                className="flex w-11 shrink-0 items-center justify-center text-ink-muted hover:bg-surface-300 hover:text-ink"
              >
                {aba ? <ChevronDown aria-hidden className="size-4" /> : <ChevronUp aria-hidden className="size-4" />}
              </button>
            </div>
            {aba === "ajuda" &&
              (ajuda ? (
                <div className="flex min-h-0 flex-1 flex-col border-t border-line bg-surface-100">
                  <ConversaAssistente autoFoco className="min-h-0 flex-1" />
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 border-t border-line p-6 text-center">
                  <p className="text-body-sm text-ink-muted">
                    Respostas para as dúvidas mais comuns sobre vagas, serviços e o match.
                  </p>
                  <Link href="/ajuda" className="text-label text-terra-text underline underline-offset-2">
                    Abrir a central de ajuda
                  </Link>
                </div>
              ))}
            {aba === "conversas" && (
              <>
                <div className="border-y border-line p-2">
                  <label className="relative block">
                    <span className="sr-only">Procurar conversa</span>
                    <Search
                      aria-hidden
                      className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-muted"
                    />
                    <input
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      placeholder="Procurar pelo nome ou pela vaga"
                      className="min-h-10 w-full rounded-sm border border-line bg-surface-100 pr-2 pl-8 text-body-sm"
                    />
                  </label>
                </div>
                <ul className="min-h-0 flex-1 overflow-y-auto">
                  {conversas === null ? (
                    <li className="p-4 text-body-sm text-ink-muted">Carregando…</li>
                  ) : filtradas.length === 0 ? (
                    <li className="p-4 text-body-sm text-ink-muted">
                      {conversas.length
                        ? "Nenhuma conversa com esse nome."
                        : "Nenhuma conversa ainda. A conversa abre quando dá match."}
                    </li>
                  ) : (
                    filtradas.map((c) => (
                      <li key={`${c.anuncio_id}:${c.outro_id}`}>
                        <button
                          type="button"
                          onClick={() => void abrir(c)}
                          className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-surface-300"
                        >
                          <Avatar nome={c.outro_nome} foto={c.outro_foto} tamanho={36} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className={`truncate text-label ${c.nao_lidas ? "" : "font-normal"}`}>
                                {c.outro_nome}
                              </span>
                              <span className="shrink-0 text-caption text-ink-muted">
                                {quando(c.ultima_em ?? c.match_em)}
                              </span>
                            </span>
                            <span className="block truncate text-caption text-ink-muted">{c.anuncio_titulo}</span>
                            <span
                              className={`block truncate text-body-sm ${c.nao_lidas ? "font-semibold text-ink" : "text-ink-muted"}`}
                            >
                              {c.ultima_texto
                                ? `${c.ultima_minha ? "Você: " : ""}${c.ultima_texto}`
                                : "Deu match! Diga oi."}
                            </span>
                          </span>
                          {c.nao_lidas > 0 && (
                            <span
                              aria-label={`${c.nao_lidas} não lidas`}
                              className="mt-2 size-2.5 shrink-0 rounded-full bg-like"
                            />
                          )}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
                <Link
                  href="/painel/conversas"
                  className="block border-t border-line px-3 py-2.5 text-center text-label text-ink-muted hover:text-ink"
                >
                  Ver todas as conversas
                </Link>
              </>
            )}
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}

/** No celular: o ícone de mensagens no cabeçalho, com o número de não lidas. */
function IconeMensagens({ naoLidas }: { naoLidas: number }) {
  return (
    <Link
      href="/painel/conversas"
      aria-label={naoLidas ? `Mensagens, ${naoLidas} não lidas` : "Mensagens"}
      className="relative inline-flex size-11 items-center justify-center rounded-pill text-ink hover:bg-surface-300 md:hidden"
    >
      <MessagesSquare aria-hidden className="size-5" />
      {naoLidas > 0 && (
        <span
          aria-hidden
          className="absolute top-1.5 right-1.5 inline-flex min-w-4 items-center justify-center rounded-pill bg-like px-1 text-[11px] leading-4 text-surface-100"
        >
          {naoLidas > 9 ? "9+" : naoLidas}
        </span>
      )}
    </Link>
  );
}
