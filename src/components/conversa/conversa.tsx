"use client";

import { SendHorizontal } from "lucide-react";
import { useEffect, useEffectEvent, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { enviarMensagem, marcarConversaLida } from "@/lib/acoes/mensagens";
import type { MensagemConversa } from "@/lib/dados";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import { MensagemErro } from "../ui/campo";

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function dia(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });
}

/**
 * A conversa de um match, dentro do Publike. As mensagens novas chegam na hora
 * (Supabase Realtime); só os dois do match leem.
 */
export function Conversa({
  anuncioId,
  perfilId,
  euId,
  outroNome,
  iniciais,
  compacto = false,
}: {
  anuncioId: string;
  /** quem curtiu (a conversa é a da curtida) */
  perfilId: string;
  euId: string;
  outroNome: string;
  iniciais: MensagemConversa[];
  /** na janela de mensagens do canto: ocupa a altura dela, sem borda própria */
  compacto?: boolean;
}) {
  const idCampo = useId();
  const [mensagens, setMensagens] = useState<MensagemConversa[]>(iniciais);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const lista = useRef<HTMLDivElement>(null);
  const primeiroNome = outroNome.split(" ")[0];

  const ler = useEffectEvent(() => {
    marcarConversaLida(anuncioId, perfilId).catch(() => undefined);
  });

  // ao abrir: marca como lida e passa a ouvir as mensagens novas
  useEffect(() => {
    ler();
    const supabase = criarClienteNavegador();
    const canal = supabase
      .channel(`conversa-${anuncioId}-${perfilId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mensagens", filter: `anuncio_id=eq.${anuncioId}` },
        (mudanca) => {
          const nova = mudanca.new as MensagemConversa & { perfil_id: string };
          if (nova.perfil_id !== perfilId) return;
          setMensagens((atual) => (atual.some((m) => m.id === nova.id) ? atual : [...atual, nova]));
          if (nova.autor_id !== euId) ler();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "mensagens", filter: `anuncio_id=eq.${anuncioId}` },
        (mudanca) => {
          const mudou = mudanca.new as MensagemConversa;
          // "lida" aparece na hora em que a outra pessoa abre a conversa
          setMensagens((atual) => atual.map((m) => (m.id === mudou.id ? { ...m, lida_em: mudou.lida_em } : m)));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [anuncioId, perfilId, euId]);

  // desce até a última mensagem
  useEffect(() => {
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensagens.length]);

  function enviar(e?: FormEvent) {
    e?.preventDefault();
    const t = texto.trim();
    if (!t || pendente) return;
    setErro(null);
    iniciar(async () => {
      const r = await enviarMensagem(anuncioId, perfilId, t);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setTexto("");
      setMensagens((atual) => (atual.some((m) => m.id === r.mensagem.id) ? atual : [...atual, r.mensagem]));
    });
  }

  return (
    <div
      className={
        compacto
          ? "flex min-h-0 flex-1 flex-col bg-surface-200"
          : "flex flex-col overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card"
      }
    >
      <div
        ref={lista}
        role="log"
        aria-live="polite"
        aria-label={`Conversa com ${outroNome}`}
        className={`flex flex-col gap-2 overflow-y-auto p-3 ${compacto ? "min-h-0 flex-1" : "h-[min(60dvh,32rem)] sm:p-4"}`}
      >
        {mensagens.length === 0 ? (
          <p className="m-auto max-w-sm text-center text-body-sm text-ink-muted">
            Deu match! Mande a primeira mensagem para {primeiroNome}: combinem horário, endereço e o que mais precisar.
          </p>
        ) : (
          mensagens.map((m, i) => {
            const minha = m.autor_id === euId;
            const novoDia = i === 0 || dia(mensagens[i - 1].criado_em) !== dia(m.criado_em);
            return (
              <div key={m.id} className="flex flex-col">
                {novoDia && (
                  <p className="my-2 self-center rounded-pill bg-surface-300 px-3 py-0.5 text-caption text-ink-muted">
                    {dia(m.criado_em)}
                  </p>
                )}
                <div
                  className={`max-w-[85%] rounded-md px-3 py-2 text-body whitespace-pre-wrap break-words ${
                    minha
                      ? "self-end rounded-br-sm bg-ink text-surface-100"
                      : "self-start rounded-bl-sm bg-surface-300 text-ink"
                  }`}
                >
                  <span className="sr-only">{minha ? "Você" : primeiroNome}: </span>
                  {m.texto}
                  <span
                    className={`mt-0.5 block text-right text-[12px] ${minha ? "text-surface-100/70" : "text-ink-muted"}`}
                  >
                    {hora(m.criado_em)}
                    {minha && m.lida_em ? " · lida" : ""}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
      <form onSubmit={enviar} className="flex flex-col gap-2 border-t border-line p-3">
        {erro && <MensagemErro>{erro}</MensagemErro>}
        <div className="flex items-end gap-2">
          <label htmlFor={idCampo} className="sr-only">
            Mensagem para {primeiroNome}
          </label>
          <textarea
            id={idCampo}
            value={texto}
            onChange={(e) => setTexto(e.target.value.slice(0, 2000))}
            onKeyDown={(e) => {
              // Enter manda; Shift+Enter pula linha (no celular, o botão manda)
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                window.matchMedia("(pointer: fine)").matches
              ) {
                e.preventDefault();
                enviar();
              }
            }}
            rows={compacto ? 1 : 2}
            placeholder={`Escreva para ${primeiroNome}…`}
            className="min-h-11 flex-1 resize-none rounded-sm border border-line-strong bg-surface-100 px-3 py-2 text-body text-ink placeholder:text-ink-muted/80"
          />
          <button
            type="submit"
            disabled={pendente || !texto.trim()}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md bg-terra px-4 text-label text-on-terra transition-colors hover:bg-terra-hover disabled:opacity-50"
          >
            <SendHorizontal aria-hidden className="size-4" />
            <span className={compacto ? "sr-only" : ""}>Enviar</span>
          </button>
        </div>
      </form>
    </div>
  );
}
