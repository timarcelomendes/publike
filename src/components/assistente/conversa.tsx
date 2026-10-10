"use client";

import { ArrowUp, Briefcase, Building2, LogIn, MessageSquareText, RotateCcw } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { perguntarAoAssistente } from "@/lib/acoes/assistente";
import { PERGUNTAS_INICIAIS, TAMANHO_MENSAGEM_CHAT, type CartaoChat } from "@/lib/assistente";
import { mudarConversa, useConversa, type ItemConversa } from "./conversa-estado";

const BOAS_VINDAS =
  "Oi! Sou o assistente do Publike. Tiro dúvidas sobre como o site funciona e, se você entrar na sua conta, procuro vagas e empresas para você.";

function Cartao({ c }: { c: CartaoChat }) {
  const href = c.tipo === "anuncio" ? `/anuncio/${c.id}` : `/perfil/${c.id}`;
  const Icone = c.tipo === "anuncio" ? Briefcase : Building2;
  return (
    <Link
      href={href}
      className="flex items-start gap-2.5 rounded-md border border-line bg-surface-200 p-2.5 transition-colors hover:border-line-strong hover:bg-surface-100"
    >
      <Icone aria-hidden className="mt-0.5 size-4 shrink-0 text-terra-text" />
      <span className="flex min-w-0 flex-col">
        <span className="text-label leading-snug">{c.tipo === "anuncio" ? c.titulo : c.nome}</span>
        <span className="text-body-sm text-ink-muted">{c.linha}</span>
        {c.tipo === "anuncio" && <span className="text-body-sm font-semibold">{c.valor}</span>}
      </span>
    </Link>
  );
}

function Mensagem({ m, caminho }: { m: ItemConversa; caminho: string }) {
  if (m.de === "pessoa") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-lg rounded-br-sm bg-ink px-3 py-2 text-body-sm whitespace-pre-line text-surface-100">
          {m.texto}
        </p>
      </div>
    );
  }
  return (
    <div className="flex max-w-[92%] flex-col gap-2">
      <p className="rounded-lg rounded-bl-sm bg-surface-300 px-3 py-2 text-body-sm whitespace-pre-line">{m.texto}</p>
      {m.cartoes && m.cartoes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {m.cartoes.map((c) => (
            <Cartao key={`${c.tipo}-${c.id}`} c={c} />
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {m.acao === "pedir_login" && (
          <Link
            href={`/entrar?next=${encodeURIComponent(caminho)}`}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-pill bg-ink px-3.5 text-label text-surface-100 hover:opacity-90"
          >
            <LogIn aria-hidden className="size-4" />
            Entrar ou criar conta
          </Link>
        )}
        {m.acao === "sugerir" && (
          <Link
            href={`/sugerir?de=${encodeURIComponent(caminho)}`}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-line-strong px-3.5 text-label hover:bg-surface-300"
          >
            <MessageSquareText aria-hidden className="size-4" />
            Mandar sugestão ou erro
          </Link>
        )}
        {m.verMais && (
          <Link
            href={m.verMais}
            className="inline-flex min-h-9 items-center rounded-pill border border-line-strong px-3.5 text-label hover:bg-surface-300"
          >
            Ver na busca
          </Link>
        )}
      </div>
    </div>
  );
}

/** A conversa com o assistente (no botão flutuante e na página de ajuda). */
export function Conversa({ autoFoco = false, className = "" }: { autoFoco?: boolean; className?: string }) {
  const conversa = useConversa();
  const caminho = usePathname() ?? "/";
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pensando, iniciar] = useTransition();
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFoco) campo.current?.focus();
  }, [autoFoco]);

  useEffect(() => {
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversa.length, pensando, erro]);

  function perguntar(pergunta: string) {
    const limpa = pergunta.trim().slice(0, TAMANHO_MENSAGEM_CHAT);
    if (!limpa || pensando) return;
    const antes = conversa;
    const comPergunta: ItemConversa[] = [...antes, { de: "pessoa", texto: limpa }];
    mudarConversa(comPergunta);
    setTexto("");
    setErro(null);
    iniciar(async () => {
      const r = await perguntarAoAssistente(comPergunta.map(({ de, texto: t }) => ({ de, texto: t })));
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      mudarConversa([
        ...comPergunta,
        { de: "assistente", texto: r.texto, acao: r.acao, cartoes: r.cartoes, verMais: r.verMais },
      ]);
    });
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    perguntar(texto);
  }

  function tecla(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      perguntar(texto);
    }
  }

  const ultima = conversa.at(-1);
  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div
        ref={lista}
        role="log"
        aria-live="polite"
        aria-label="Conversa com o assistente"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
      >
        <p className="max-w-[92%] rounded-lg rounded-bl-sm bg-surface-300 px-3 py-2 text-body-sm">{BOAS_VINDAS}</p>
        {conversa.length === 0 && (
          <div className="flex flex-wrap gap-2" aria-label="Perguntas comuns">
            {PERGUNTAS_INICIAIS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => perguntar(p)}
                className="min-h-9 rounded-pill border border-line-strong bg-surface-200 px-3 text-left text-body-sm hover:bg-surface-300"
              >
                {p}
              </button>
            ))}
          </div>
        )}
        {conversa.map((m, i) => (
          <Mensagem key={i} m={m} caminho={caminho} />
        ))}
        {pensando && (
          <p
            className="flex items-center gap-1 self-start rounded-lg bg-surface-300 px-3 py-2.5"
            aria-label="O assistente está escrevendo"
          >
            {[0, 150, 300].map((atraso) => (
              <span
                key={atraso}
                className="size-1.5 animate-bounce rounded-pill bg-ink-muted motion-reduce:animate-none"
                style={{ animationDelay: `${atraso}ms` }}
              />
            ))}
          </p>
        )}
        {erro && (
          <div
            role="alert"
            className="flex flex-col items-start gap-2 rounded-md border border-danger p-3 text-body-sm"
          >
            <p className="text-danger">{erro}</p>
            {ultima?.de === "pessoa" && (
              <button
                type="button"
                onClick={() => {
                  mudarConversa(conversa.slice(0, -1));
                  perguntar(ultima.texto);
                }}
                className="underline"
              >
                Tentar de novo
              </button>
            )}
          </div>
        )}
      </div>
      <form onSubmit={enviar} className="flex flex-col gap-2 border-t border-line p-3">
        <div className="flex items-end gap-2 rounded-lg border border-line-strong bg-surface-200 p-1.5 pl-3 has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-focus">
          <label htmlFor="pergunta-assistente" className="sr-only">
            Sua pergunta
          </label>
          <textarea
            ref={campo}
            id="pergunta-assistente"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={tecla}
            rows={1}
            maxLength={TAMANHO_MENSAGEM_CHAT}
            enterKeyHint="send"
            placeholder="Pergunte sobre o Publike…"
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-body-sm text-ink outline-none [field-sizing:content] placeholder:text-ink-muted/80"
          />
          <button
            type="submit"
            disabled={!texto.trim() || pensando}
            className="flex size-9 shrink-0 items-center justify-center rounded-md bg-ink text-surface-100 transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <ArrowUp aria-hidden className="size-4" />
            <span className="sr-only">Enviar</span>
          </button>
        </div>
        <div className="flex items-center justify-between gap-2 text-body-sm text-ink-muted">
          <span>Pode errar. Não mande senha, documentos ou dados de cartão.</span>
          {conversa.length > 0 && (
            <button
              type="button"
              onClick={() => {
                mudarConversa([]);
                setErro(null);
              }}
              className="inline-flex shrink-0 items-center gap-1 hover:text-ink"
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Nova conversa
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
