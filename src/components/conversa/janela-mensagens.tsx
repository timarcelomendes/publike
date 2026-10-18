"use client";

import { ArrowLeft, ExternalLink, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { abrirConversaDaJanela, conversasDaJanela } from "@/lib/acoes/mensagens";
import type { PedidoConversa } from "@/lib/abrir-conversa";
import type { Conversa as ConversaResumo, MensagemConversa } from "@/lib/dados";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import { Avatar } from "../ui/basicos";
import { Conversa } from "./conversa";

// As conversas (dos matches) dentro do chat do canto da tela, ao lado da Ajuda
// (botao-assistente.tsx): a lista, com busca e não lidas, e a conversa aberta ali
// mesmo, sem sair da página.

function quando(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const mesmoDia = d.toDateString() === new Date().toDateString();
  return mesmoDia
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

/**
 * As conversas da conta, para o número de não lidas no botão do chat e para a lista.
 * Atualiza quando chega mensagem (Realtime) e, se ele cair, a cada minuto.
 */
export function useConversasDoChat(usuarioId: string | null) {
  const [conversas, setConversas] = useState<ConversaResumo[] | null>(null);
  const carregando = useRef(false);

  const carregar = useCallback(async () => {
    if (!usuarioId || carregando.current) return;
    carregando.current = true;
    try {
      setConversas(await conversasDaJanela());
    } finally {
      carregando.current = false;
    }
  }, [usuarioId]);

  useEffect(() => {
    if (!usuarioId) return;
    void carregar();
    const supabase = criarClienteNavegador();
    let espera: ReturnType<typeof setTimeout> | null = null;
    const canal = supabase
      .channel(`chat-conversas-${usuarioId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensagens" }, () => {
        if (espera) clearTimeout(espera);
        espera = setTimeout(() => void carregar(), 800);
      })
      .subscribe();
    const relogio = setInterval(() => {
      if (document.visibilityState === "visible") void carregar();
    }, 60_000);
    return () => {
      clearInterval(relogio);
      if (espera) clearTimeout(espera);
      supabase.removeChannel(canal);
    };
  }, [carregar, usuarioId]);

  const marcarLida = useCallback((anuncioId: string, outroId: string) => {
    setConversas(
      (atual) =>
        atual?.map((c) => (c.anuncio_id === anuncioId && c.outro_id === outroId ? { ...c, nao_lidas: 0 } : c)) ?? null,
    );
  }, []);

  const naoLidas = (conversas ?? []).reduce((t, c) => t + (c.nao_lidas ?? 0), 0);
  return { conversas, carregar, marcarLida, naoLidas };
}

type Aberta = {
  anuncio_id: string;
  outro_id: string;
  outro_nome: string;
  outro_foto: string | null;
  titulo: string;
  dados: { perfilId: string; euId: string; mensagens: MensagemConversa[]; vaga: boolean } | null;
};

/** A aba "Conversas" do chat: a lista e, tocando numa, a conversa ali dentro. */
export function PainelConversas({
  usuarioId,
  conversas,
  carregar,
  marcarLida,
  pedida = null,
}: {
  usuarioId: string | null;
  conversas: ConversaResumo[] | null;
  carregar: () => Promise<void>;
  marcarLida: (anuncioId: string, outroId: string) => void;
  /** abre já nesta conversa (pedida de fora do chat, como o "Deu match!" da vaga) */
  pedida?: PedidoConversa | null;
}) {
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<Aberta | null>(
    pedida
      ? {
          anuncio_id: pedida.anuncioId,
          outro_id: pedida.outroId,
          outro_nome: pedida.outroNome,
          outro_foto: pedida.outroFoto ?? null,
          titulo: pedida.titulo,
          dados: null,
        }
      : null,
  );

  // a conversa pedida de fora: busca as mensagens e marca como lida
  useEffect(() => {
    if (!pedida) return;
    let vale = true;
    abrirConversaDaJanela(pedida.anuncioId, pedida.outroId).then((r) => {
      if (!vale) return;
      setAberta((a) =>
        a && a.anuncio_id === pedida.anuncioId && a.outro_id === pedida.outroId && r
          ? {
              ...a,
              dados: {
                perfilId: r.conversa.perfil_id,
                euId: r.euId,
                mensagens: r.mensagens,
                vaga: r.conversa.anuncio_tipo === "vaga",
              },
            }
          : a,
      );
      marcarLida(pedida.anuncioId, pedida.outroId);
    });
    return () => {
      vale = false;
    };
  }, [pedida, marcarLida]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!usuarioId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-body-sm text-ink-muted">
          Entre para conversar com quem deu match com você: vagas, serviços e entrevistas, tudo aqui.
        </p>
        <Link href="/entrar" className="text-label text-terra-text underline underline-offset-2">
          Entrar
        </Link>
      </div>
    );
  }

  async function abrir(c: ConversaResumo) {
    setAberta({
      anuncio_id: c.anuncio_id,
      outro_id: c.outro_id,
      outro_nome: c.outro_nome,
      outro_foto: c.outro_foto,
      titulo: c.anuncio_titulo,
      dados: null,
    });
    const r = await abrirConversaDaJanela(c.anuncio_id, c.outro_id);
    setAberta((a) =>
      a && a.anuncio_id === c.anuncio_id && a.outro_id === c.outro_id && r
        ? {
            ...a,
            dados: {
              perfilId: r.conversa.perfil_id,
              euId: r.euId,
              mensagens: r.mensagens,
              vaga: r.conversa.anuncio_tipo === "vaga",
            },
          }
        : a,
    );
    marcarLida(c.anuncio_id, c.outro_id);
  }

  if (aberta) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface-200 px-2 py-2">
          <button
            type="button"
            onClick={() => {
              setAberta(null);
              void carregar();
            }}
            aria-label="Voltar para as conversas"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink"
          >
            <ArrowLeft aria-hidden className="size-5" />
          </button>
          <Avatar nome={aberta.outro_nome} foto={aberta.outro_foto} tamanho={32} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-label">{aberta.outro_nome}</span>
            <span className="block truncate text-caption text-ink-muted">{aberta.titulo}</span>
          </span>
          <Link
            href={`/painel/conversas/${aberta.anuncio_id}/${aberta.outro_id}`}
            aria-label="Abrir a conversa em tela cheia"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink"
          >
            <ExternalLink aria-hidden className="size-4" />
          </Link>
        </div>
        {aberta.dados ? (
          <Conversa
            anuncioId={aberta.anuncio_id}
            perfilId={aberta.dados.perfilId}
            euId={aberta.dados.euId}
            outroNome={aberta.outro_nome}
            iniciais={aberta.dados.mensagens}
            vaga={aberta.dados.vaga}
            compacto
          />
        ) : (
          <p className="m-auto text-body-sm text-ink-muted">Abrindo a conversa…</p>
        )}
      </div>
    );
  }

  const procurado = busca.trim().toLowerCase();
  const filtradas = (conversas ?? []).filter(
    (c) => !procurado || `${c.outro_nome} ${c.anuncio_titulo}`.toLowerCase().includes(procurado),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-line p-2">
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
            className="min-h-10 w-full rounded-sm border border-line bg-surface-200 pr-2 pl-8 text-body-sm"
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
              : "Nenhuma conversa ainda. A conversa abre quando dá match: aí vocês combinam tudo por aqui."}
          </li>
        ) : (
          filtradas.map((c) => (
            <li key={`${c.anuncio_id}:${c.outro_id}`}>
              <button
                type="button"
                onClick={() => void abrir(c)}
                className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-surface-300"
              >
                <Avatar nome={c.outro_nome} foto={c.outro_foto} tamanho={40} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-label ${c.nao_lidas ? "" : "font-normal"}`}>{c.outro_nome}</span>
                    <span className="shrink-0 text-caption text-ink-muted">{quando(c.ultima_em ?? c.match_em)}</span>
                  </span>
                  <span className="block truncate text-caption text-ink-muted">{c.anuncio_titulo}</span>
                  <span
                    className={`block truncate text-body-sm ${c.nao_lidas ? "font-semibold text-ink" : "text-ink-muted"}`}
                  >
                    {c.ultima_texto ? `${c.ultima_minha ? "Você: " : ""}${c.ultima_texto}` : "Deu match! Diga oi."}
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
        className="block shrink-0 border-t border-line px-3 py-2.5 text-center text-label text-ink-muted hover:text-ink"
      >
        Ver todas as conversas
      </Link>
    </div>
  );
}
