"use client";

import { Bell, Heart, HeartCrack, MessageCircleHeart, ShieldCheck, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { tempoRelativo } from "@/lib/formato";
import { criarClienteNavegador } from "@/lib/supabase/navegador";

type Notificacao = {
  id: number;
  tipo: string;
  anuncio_id: string | null;
  texto: string;
  lida: boolean;
  criado_em: string;
};

function destino(n: Notificacao) {
  if (n.tipo === "curtida" && n.anuncio_id) return `/painel/anuncio/${n.anuncio_id}`;
  if (n.tipo === "match") return "/painel/matches";
  if (n.tipo === "match_desfeito" && n.anuncio_id) return `/anuncio/${n.anuncio_id}`;
  if (n.tipo === "avaliacao") return "/painel/avaliacoes";
  if (n.tipo === "avaliacao_retida") return "/privacidade#regras";
  return "/painel";
}

/** Sino com avisos de curtida e de match, que chegam na hora (Supabase Realtime). */
export function Notificacoes({ usuarioId }: { usuarioId: string }) {
  const [itens, setItens] = useState<Notificacao[]>([]);
  const [aberto, setAberto] = useState(false);
  const [agora, setAgora] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);
  const naoLidas = itens.filter((i) => !i.lida).length;

  useEffect(() => {
    const supabase = criarClienteNavegador();
    let ativo = true;
    supabase
      .from("notificacoes")
      .select("id, tipo, anuncio_id, texto, lida, criado_em")
      .order("criado_em", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (ativo && data) setItens(data);
      });
    const canal = supabase
      .channel(`notificacoes-${usuarioId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notificacoes", filter: `destinatario_id=eq.${usuarioId}` },
        (mudanca) => setItens((atual) => [mudanca.new as Notificacao, ...atual].slice(0, 20)),
      )
      .subscribe();
    return () => {
      ativo = false;
      supabase.removeChannel(canal);
    };
  }, [usuarioId]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  function alternar() {
    const abrir = !aberto;
    setAberto(abrir);
    setAgora(Date.now());
    if (abrir && naoLidas > 0) {
      setItens((atual) => atual.map((i) => ({ ...i, lida: true })));
      criarClienteNavegador().from("notificacoes").update({ lida: true }).eq("lida", false).then(() => undefined);
    }
  }

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={aberto}
        aria-controls="lista-avisos"
        className="relative flex size-11 items-center justify-center rounded-pill text-ink hover:bg-surface-300"
      >
        <Bell aria-hidden className="size-5" />
        {naoLidas > 0 && (
          <span className="absolute top-1.5 right-1.5 flex min-w-5 items-center justify-center rounded-pill bg-like px-1 text-[11px] leading-5 font-bold text-on-like">
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        )}
        <span className="sr-only">
          {naoLidas === 0 ? "Avisos" : naoLidas === 1 ? "1 aviso novo" : `${naoLidas} avisos novos`}
        </span>
      </button>
      {aberto && (
        <div
          id="lista-avisos"
          className="absolute top-full right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-md border border-line bg-surface-200 p-2 shadow-raised"
        >
          <p className="px-3 pt-1 pb-2 text-label">Avisos</p>
          {itens.length === 0 ? (
            <p className="px-3 pb-3 text-body-sm text-ink-muted">
              Nada por enquanto. Quando alguém curtir seu anúncio ou der match, aparece aqui.
            </p>
          ) : (
            <ul className="flex max-h-96 flex-col overflow-y-auto">
              {itens.map((n) => {
                const Icone =
                  n.tipo === "match"
                    ? MessageCircleHeart
                    : n.tipo === "match_desfeito"
                      ? HeartCrack
                      : n.tipo === "curtida"
                        ? Heart
                        : n.tipo === "avaliacao"
                          ? Star
                          : ShieldCheck;
                return (
                  <li key={n.id}>
                    <Link
                      href={destino(n)}
                      onClick={() => setAberto(false)}
                      className="flex gap-3 rounded-sm px-3 py-2.5 hover:bg-surface-300"
                    >
                      <Icone
                        aria-hidden
                        className={`mt-0.5 size-[18px] shrink-0 ${n.tipo === "curtida" ? "text-like" : n.tipo === "match" ? "text-cerrado-text" : "text-ink-muted"}`}
                        fill={n.tipo === "curtida" ? "currentColor" : "none"}
                      />
                      <span className="flex flex-col">
                        <span className="text-body-sm text-ink">{n.texto}</span>
                        <span className="text-[13px] text-ink-muted">{tempoRelativo(n.criado_em, agora)}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
