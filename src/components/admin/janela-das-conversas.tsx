"use client";

import { ArrowLeft, Maximize2, MessageCircle, Send, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  conversaDaJanela,
  conversasDaJanela,
  type ConversaNaJanela,
  type ConversaNaLista,
} from "@/lib/acoes/conversas-flutuantes";
import { mudarConversaWhatsapp, responderConversaWhatsapp } from "@/lib/acoes/whatsapp-admin";
import {
  diaDaMensagem,
  horaDaMensagem,
  Iniciais,
  quandoNaLista,
  semMarcas,
  separarBotoes,
  TextoDoWhatsapp,
} from "./conversa-whatsapp-visual";

// A janela flutuante das conversas do WhatsApp (19/11/2026; Marcelo: "deixa o chat aberto em uma janela flutuante
// [...] exibir somente quando acessar o admin"). Fica no layout do Admin: aberta, continua aberta enquanto se navega
// pelas telas. A lista e a conversa se atualizam sozinhas. Na aba Conversas, que já mostra tudo, o botão some.

const CADA = { aberta: 10_000, lista: 20_000, fechada: 60_000 };
const QUEM = { pessoa: "", robo: "Publike: ", equipe: "Equipe: " } as const;

export function JanelaDasConversas() {
  const caminho = usePathname();
  const busca = useSearchParams();
  const naAba = caminho === "/admin/whatsapp" && busca.get("aba") === "conversas";
  const [aberta, setAberta] = useState(false);
  const [filtro, setFiltro] = useState<"todas" | "equipe">("todas");
  const [lista, setLista] = useState<ConversaNaLista[] | null>(null);
  const [comEquipe, setComEquipe] = useState(0);
  const [chave, setChave] = useState<string | null>(null);
  const [conversa, setConversa] = useState<ConversaNaJanela | null>(null);
  // a hora da última leitura, para "Hoje", "ontem" e a janela de 24 horas
  const [agora, setAgora] = useState(0);

  // lembra se estava aberta (só neste navegador)
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lido do navegador depois de montar
      if (localStorage.getItem("publike_janela_conversas") === "1") setAberta(true);
    } catch {}
  }, []);
  const abrirOuFechar = (v: boolean) => {
    setAberta(v);
    try {
      localStorage.setItem("publike_janela_conversas", v ? "1" : "0");
    } catch {}
  };

  const lerLista = useCallback(async () => {
    const r = await conversasDaJanela(filtro).catch(() => null);
    if (!r) return;
    setLista(r.lista);
    setComEquipe(r.comEquipe);
    setAgora(Date.now());
  }, [filtro]);
  const lerConversa = useCallback(async () => {
    if (!chave) return;
    const r = await conversaDaJanela(chave).catch(() => null);
    if (!r) return;
    setConversa(r);
    setAgora(Date.now());
  }, [chave]);

  useEffect(() => {
    if (naAba) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca no servidor; o estado muda depois da resposta
    lerLista();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") lerLista();
    }, aberta ? CADA.lista : CADA.fechada);
    return () => clearInterval(t);
  }, [aberta, lerLista, naAba]);

  useEffect(() => {
    if (!aberta || !chave || naAba) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca no servidor; o estado muda depois da resposta
    lerConversa();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") lerConversa();
    }, CADA.aberta);
    return () => clearInterval(t);
  }, [aberta, chave, lerConversa, naAba]);

  if (naAba) return null;
  const naoVistas = lista?.filter((x) => x.nao_vista).length ?? 0;
  const aviso = comEquipe + naoVistas;

  if (!aberta)
    return (
      <button
        type="button"
        onClick={() => abrirOuFechar(true)}
        className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 inline-flex md:bottom-4 [html[data-sem-barra]_&]:bottom-4 min-h-12 items-center gap-2 rounded-pill bg-cerrado px-4 text-label text-on-cerrado shadow-card hover:opacity-90 print:hidden"
      >
        <MessageCircle aria-hidden className="size-5" />
        Conversas
        {aviso > 0 && (
          <span className="grid min-w-6 place-items-center rounded-pill bg-surface-200 px-1.5 text-caption text-ink tabular-nums">
            {aviso}
          </span>
        )}
      </button>
    );

  return (
    <section
      aria-label="Conversas do WhatsApp"
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-surface-200 shadow-card sm:inset-auto sm:right-4 sm:bottom-4 sm:h-[min(640px,calc(100vh-2rem))] sm:w-[400px] sm:rounded-lg sm:border sm:border-line print:hidden"
    >
      <header className="flex items-center gap-2 border-b border-line bg-cerrado px-3 py-2 text-on-cerrado">
        {chave ? (
          <button
            type="button"
            onClick={() => {
              setChave(null);
              setConversa(null);
              lerLista();
            }}
            aria-label="Voltar para a lista"
            className="grid size-9 place-items-center rounded-full hover:bg-white/15"
          >
            <ArrowLeft aria-hidden className="size-5" />
          </button>
        ) : (
          <MessageCircle aria-hidden className="ml-1 size-5" />
        )}
        <p className="min-w-0 flex-1 truncate text-label">
          {chave ? (conversa?.nome ?? lista?.find((x) => x.chave === chave)?.nome ?? "Conversa") : "Conversas do WhatsApp"}
          {chave && conversa ? <span className="font-normal opacity-80"> · {conversa.final}</span> : null}
        </p>
        <Link
          href={`/admin/whatsapp?aba=conversas${chave ? `&c=${chave}` : ""}`}
          aria-label="Abrir na tela inteira"
          title="Abrir na tela inteira"
          className="grid size-9 place-items-center rounded-full hover:bg-white/15"
        >
          <Maximize2 aria-hidden className="size-4" />
        </Link>
        <button
          type="button"
          onClick={() => abrirOuFechar(false)}
          aria-label="Fechar"
          className="grid size-9 place-items-center rounded-full hover:bg-white/15"
        >
          <X aria-hidden className="size-5" />
        </button>
      </header>

      {chave ? (
        <Conversa conversa={conversa} agora={agora} recarregar={lerConversa} />
      ) : (
        <>
          <div className="flex gap-2 border-b border-line px-3 py-2" role="group" aria-label="Filtro">
            {(["todas", "equipe"] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filtro === f}
                onClick={() => setFiltro(f)}
                className={`min-h-9 rounded-pill px-3 text-body-sm ${
                  filtro === f ? "bg-ink text-surface-100" : "bg-surface-300 text-ink"
                }`}
              >
                {f === "todas" ? "Todas" : `Com a equipe${comEquipe ? ` (${comEquipe})` : ""}`}
              </button>
            ))}
          </div>
          <ul className="flex-1 overflow-y-auto">
            {lista === null ? (
              <li className="p-4 text-body-sm text-ink-muted">Carregando…</li>
            ) : lista.length === 0 ? (
              <li className="p-4 text-body-sm text-ink-muted">Nenhuma conversa aqui.</li>
            ) : (
              lista.map((x) => (
                <li key={x.chave} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => {
                      setConversa(null);
                      setChave(x.chave);
                    }}
                    className="flex w-full gap-3 px-3 py-2.5 text-left hover:bg-surface-100"
                  >
                    <Iniciais nome={x.nome} chave={x.chave} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-baseline gap-2">
                        <span className={`min-w-0 flex-1 truncate ${x.nao_vista ? "text-label" : "text-body-sm"} text-ink`}>
                          {x.nome ?? "Sem nome"}
                          <span className="text-caption text-ink-muted"> · {x.final}</span>
                        </span>
                        <span className={`shrink-0 text-caption tabular-nums ${x.nao_vista ? "text-cerrado-text" : "text-ink-muted"}`}>
                          {quandoNaLista(x.ultima_em, agora)}
                        </span>
                      </span>
                      {x.ultima && (
                        <span className="flex items-center gap-2">
                          <span className={`min-w-0 flex-1 truncate text-body-sm ${x.nao_vista ? "text-ink" : "text-ink-muted"}`}>
                            {QUEM[x.ultima.de]}
                            {semMarcas(separarBotoes(x.ultima.texto).texto)}
                          </span>
                          {x.nao_vista && <span aria-label="nova" className="size-2.5 shrink-0 rounded-full bg-cerrado" />}
                        </span>
                      )}
                      {x.situacao === "equipe" && <span className="text-caption font-semibold text-terra-text">Com a equipe</span>}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </>
      )}
    </section>
  );
}

function Conversa({
  conversa: c,
  agora,
  recarregar,
}: {
  conversa: ConversaNaJanela | null;
  agora: number;
  recarregar: () => Promise<void>;
}) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const fim = useRef<HTMLDivElement>(null);
  const quantas = c?.mensagens.length ?? 0;
  // a mensagem nova aparece embaixo, como no WhatsApp
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [quantas]);
  if (!c) return <p className="p-4 text-body-sm text-ink-muted">Carregando…</p>;
  const janela = Boolean(c.janela_ate && new Date(c.janela_ate).getTime() > agora);
  const equipe = c.situacao === "equipe";

  return (
    <>
      <div className={`flex items-center justify-between gap-2 px-3 py-2 text-body-sm ${equipe ? "bg-terra-soft" : "bg-tom-servico"}`}>
        <span>{equipe ? "A equipe está respondendo" : "O Publike responde sozinho"}</span>
        <button
          type="button"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              setErro(null);
              const r = await mudarConversaWhatsapp(c.chave, equipe ? "robo" : "equipe");
              if (!r.ok) setErro(r.erro);
              await recarregar();
              // devolvida, o automático pode responder em uns segundos
              if (equipe) setTimeout(() => void recarregar(), 8000);
            })
          }
          className="min-h-9 shrink-0 rounded-pill border border-line-strong bg-surface-200 px-3 text-label hover:bg-surface-100"
        >
          {equipe ? "Devolver" : "Pegar"}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto bg-surface-100 px-3 py-3">
        <ol className="flex flex-col gap-1.5">
          {c.mensagens.map((m, i) => {
            const { texto: t, botoes } = m.de === "pessoa" ? { texto: m.texto, botoes: [] } : separarBotoes(m.texto);
            const dia = diaDaMensagem(m.em, agora);
            const novoDia = i === 0 || diaDaMensagem(c.mensagens[i - 1].em, agora) !== dia;
            const daPessoa = m.de === "pessoa";
            return (
              <li key={i} className={`flex flex-col ${daPessoa ? "items-start" : "items-end"}`}>
                {novoDia && (
                  <span className="my-2 self-center rounded-pill bg-surface-300 px-3 py-0.5 text-caption text-ink-muted">{dia}</span>
                )}
                <div
                  className={`flex max-w-[88%] flex-col gap-1 rounded-lg px-3 py-2 text-body-sm shadow-card ${
                    daPessoa ? "rounded-tl-sm bg-surface-200" : m.de === "equipe" ? "rounded-tr-sm bg-terra-soft" : "rounded-tr-sm bg-tom-servico"
                  }`}
                >
                  {!daPessoa && (
                    <span className="text-caption font-semibold text-ink-muted">{m.de === "equipe" ? "Equipe" : "Publike (automático)"}</span>
                  )}
                  <TextoDoWhatsapp texto={t} />
                  {botoes.length > 0 && (
                    <span className="mt-1 flex flex-col gap-1 border-t border-line pt-1.5">
                      {botoes.map((b) => (
                        <span key={b} className="text-center text-label text-cerrado-text">
                          {b}
                        </span>
                      ))}
                    </span>
                  )}
                  <span className="self-end text-caption text-ink-muted tabular-nums">{horaDaMensagem(m.em)}</span>
                </div>
              </li>
            );
          })}
        </ol>
        <div ref={fim} />
      </div>
      {erro && (
        <p role="alert" className="px-3 pt-2 text-body-sm text-danger">
          {erro}
        </p>
      )}
      {janela ? (
        <form
          className="flex items-end gap-2 border-t border-line p-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            const enviar = texto;
            if (!enviar.trim()) return;
            // a caixa esvazia na hora; se não for, o texto volta
            setTexto("");
            iniciar(async () => {
              setErro(null);
              const r = await responderConversaWhatsapp(c.chave, enviar);
              if (!r.ok) {
                setTexto(enviar);
                return setErro(r.erro);
              }
              await recarregar();
            });
          }}
        >
          <textarea
            rows={2}
            maxLength={4000}
            value={texto}
            onChange={(ev) => setTexto(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && !ev.shiftKey) {
                ev.preventDefault();
                ev.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Responder como equipe…"
            aria-label="Responder como equipe do Publike"
            className="min-h-11 flex-1 resize-none rounded-md border border-line-strong bg-surface-200 px-3 py-2 text-body-sm"
          />
          <button
            type="submit"
            disabled={pendente || !texto.trim()}
            aria-label="Enviar pelo WhatsApp"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-cerrado text-on-cerrado disabled:opacity-50"
          >
            <Send aria-hidden className="size-5" />
          </button>
        </form>
      ) : (
        <p className="border-t border-line p-3 text-caption text-ink-muted">
          Passaram 24 horas da última mensagem da pessoa: a Meta só deixa responder quando ela escrever de novo.
        </p>
      )}
    </>
  );
}
