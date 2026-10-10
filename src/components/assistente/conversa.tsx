"use client";

import {
  ArrowUp,
  BadgeCheck,
  Briefcase,
  Building2,
  ChevronRight,
  HeartHandshake,
  LogIn,
  MapPin,
  MessageSquareText,
  Search,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { perguntarAoAssistente } from "@/lib/acoes/assistente";
import { PERGUNTAS_INICIAIS, TAMANHO_MENSAGEM_CHAT, type CartaoChat } from "@/lib/assistente";
import { Simbolo } from "../ui/basicos";
import { mudarConversa, useConversa, type ItemConversa } from "./conversa-estado";

const ICONES_PERGUNTAS: LucideIcon[] = [HeartHandshake, BadgeCheck, MapPin, Building2];

/** O "rosto" do assistente: o símbolo do Publike numa bolinha. */
export function AvatarAssistente({ grande = false }: { grande?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-pill border border-line bg-surface-200 ${
        grande ? "size-14" : "size-8"
      }`}
    >
      <Simbolo altura={grande ? 30 : 17} />
    </span>
  );
}

function Cartao({ c }: { c: CartaoChat }) {
  const href = c.tipo === "anuncio" ? `/anuncio/${c.id}` : `/perfil/${c.id}`;
  const Icone = c.tipo === "anuncio" ? Briefcase : Building2;
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg border border-line bg-surface-200 p-3 shadow-card transition-colors hover:border-line-strong"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-terra-soft text-terra-text">
        <Icone aria-hidden className="size-[18px]" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-label leading-snug">{c.tipo === "anuncio" ? c.titulo : c.nome}</span>
        <span className="truncate text-body-sm text-ink-muted">{c.linha}</span>
        {c.tipo === "anuncio" && <span className="text-body-sm font-semibold">{c.valor}</span>}
      </span>
      <ChevronRight
        aria-hidden
        className="size-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}

const pilula =
  "inline-flex min-h-10 items-center gap-1.5 rounded-pill border border-line-strong bg-surface-200 px-4 text-label hover:bg-surface-300";

function Mensagem({ m, caminho }: { m: ItemConversa; caminho: string }) {
  if (m.de === "pessoa") {
    return (
      <div className="flex justify-end pl-10">
        <p className="rounded-2xl rounded-tr-md bg-ink px-3.5 py-2.5 text-body whitespace-pre-line text-surface-100">
          {m.texto}
        </p>
      </div>
    );
  }
  return (
    <div className="flex gap-2 pr-4">
      <AvatarAssistente />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
        <p data-resposta className="rounded-2xl rounded-tl-md border border-line bg-surface-200 px-3.5 py-2.5 text-body whitespace-pre-line">
          {m.texto}
        </p>
        {m.cartoes && m.cartoes.length > 0 && (
          <div className="flex w-full flex-col gap-2">
            {m.cartoes.map((c) => (
              <Cartao key={`${c.tipo}-${c.id}`} c={c} />
            ))}
          </div>
        )}
        {(m.acao === "pedir_login" || m.acao === "sugerir" || m.verMais) && (
          <div className="flex flex-wrap gap-2">
            {m.acao === "pedir_login" && (
              <Link
                href={`/entrar?next=${encodeURIComponent(caminho)}`}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-pill bg-ink px-4 text-label text-surface-100 hover:opacity-90"
              >
                <LogIn aria-hidden className="size-4" />
                Entrar ou criar conta
              </Link>
            )}
            {m.acao === "sugerir" && (
              <Link href={`/sugerir?de=${encodeURIComponent(caminho)}`} className={pilula}>
                <MessageSquareText aria-hidden className="size-4" />
                Mandar sugestão ou erro
              </Link>
            )}
            {m.verMais && (
              <Link href={m.verMais} className={pilula}>
                <Search aria-hidden className="size-4" />
                Ver na busca
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** A conversa com o assistente (no botão flutuante e na página de ajuda). */
export function Conversa({
  autoFoco = false,
  className = "",
}: {
  /** põe o cursor na caixa de texto ao abrir (só no computador: no celular o teclado tapa a tela) */
  autoFoco?: boolean;
  className?: string;
}) {
  const conversa = useConversa();
  const caminho = usePathname() ?? "/";
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pensando, iniciar] = useTransition();
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFoco && window.matchMedia("(pointer: fine)").matches) campo.current?.focus();
  }, [autoFoco]);

  useEffect(() => {
    const el = lista.current;
    // sem conversa ainda: fica no começo (boas-vindas e perguntas prontas)
    if (el && (conversa.length || pensando || erro)) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [conversa.length, pensando, erro]);

  function perguntar(pergunta: string) {
    const limpa = pergunta.trim().slice(0, TAMANHO_MENSAGEM_CHAT);
    if (!limpa || pensando) return;
    const comPergunta: ItemConversa[] = [...conversa, { de: "pessoa", texto: limpa }];
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
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-5"
      >
        <div className="flex flex-col items-center gap-2 px-2 pb-1 text-center">
          <AvatarAssistente grande />
          <p className="font-display text-h3">Oi! Como posso ajudar?</p>
          <p className="max-w-xs text-body-sm text-ink-muted">
            Tiro dúvidas sobre o Publike. Se você entrar na sua conta, também procuro vagas e empresas para você.
          </p>
          {caminho !== "/ajuda" && (
            <Link href="/ajuda" className="text-body-sm text-ink-muted underline underline-offset-2 hover:text-ink">
              Ver todas as perguntas da ajuda
            </Link>
          )}
        </div>
        {conversa.length === 0 && (
          <ul className="flex flex-col gap-2" aria-label="Perguntas comuns">
            {PERGUNTAS_INICIAIS.map((p, i) => {
              const Icone = ICONES_PERGUNTAS[i] ?? MessageSquareText;
              return (
                <li key={p}>
                  <button
                    type="button"
                    onClick={() => perguntar(p)}
                    className="group flex min-h-12 w-full items-center gap-3 rounded-lg border border-line bg-surface-200 px-3 text-left text-label shadow-card transition-colors hover:border-line-strong"
                  >
                    <Icone aria-hidden className="size-[18px] shrink-0 text-terra-text" />
                    <span className="flex-1">{p}</span>
                    <ChevronRight
                      aria-hidden
                      className="size-4 text-ink-muted transition-transform group-hover:translate-x-0.5"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {conversa.map((m, i) => (
          <Mensagem key={i} m={m} caminho={caminho} />
        ))}
        {pensando && (
          <div className="flex gap-2">
            <AvatarAssistente />
            <p
              className="flex items-center gap-1 rounded-2xl rounded-tl-md border border-line bg-surface-200 px-4 py-3.5"
              aria-label="O assistente está escrevendo"
            >
              {[0, 150, 300].map((atraso) => (
                <span
                  key={atraso}
                  className="size-2 animate-bounce rounded-pill bg-ink-muted motion-reduce:animate-none"
                  style={{ animationDelay: `${atraso}ms` }}
                />
              ))}
            </p>
          </div>
        )}
        {erro && (
          <div
            role="alert"
            className="ml-10 flex flex-col items-start gap-2 rounded-lg border border-danger bg-surface-200 p-3"
          >
            <p className="text-body-sm text-danger">{erro}</p>
            {ultima?.de === "pessoa" && (
              <button
                type="button"
                onClick={() => {
                  mudarConversa(conversa.slice(0, -1));
                  perguntar(ultima.texto);
                }}
                className={pilula}
              >
                Tentar de novo
              </button>
            )}
          </div>
        )}
      </div>
      <form
        onSubmit={enviar}
        className="shrink-0 border-t border-line bg-surface-100 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-end gap-2 rounded-[1.5rem] border border-line-strong bg-surface-200 p-1.5 pl-4 has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-focus">
          <label htmlFor="pergunta-assistente" className="sr-only">
            Sua pergunta
          </label>
          {/* 16 px: com menos que isso, o iPhone dá zoom na página ao tocar na caixa */}
          <textarea
            ref={campo}
            id="pergunta-assistente"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={tecla}
            rows={1}
            maxLength={TAMANHO_MENSAGEM_CHAT}
            enterKeyHint="send"
            placeholder="Escreva sua pergunta…"
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2 text-body text-ink outline-none [field-sizing:content] placeholder:text-ink-muted/80"
          />
          <button
            type="submit"
            disabled={!texto.trim() || pensando}
            className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-ink text-surface-100 transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            <ArrowUp aria-hidden className="size-5" />
            <span className="sr-only">Enviar</span>
          </button>
        </div>
        <p className="mt-2 text-center text-caption text-ink-muted">
          O assistente pode errar. Não mande senha, documentos ou dados de cartão.
        </p>
      </form>
    </div>
  );
}
