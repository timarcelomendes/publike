"use client";

import {
  Bell,
  FileCheck,
  FileText,
  Handshake,
  Heart,
  HeartCrack,
  ListChecks,
  MessageCircleHeart,
  MessagesSquare,
  Send,
  ShieldCheck,
  Star,
  BellRing,
  CalendarClock,
  ClipboardCheck,
  PartyPopper,
  SearchCheck,
  ThumbsUp,
  UserCheck,
  UserSearch,
  UsersRound,
  UserX,
  MessageSquareText,
  BicepsFlexed,
  Inbox,
  Share2,
  Store,
  Eye,
  Megaphone,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import { caminhoConversa } from "@/lib/conversas";
import { tempoRelativo } from "@/lib/formato";
import { criarClienteNavegador } from "@/lib/supabase/navegador";

/** O ícone de cada tipo de aviso (o resto: escudo, da moderação). */
const ICONES: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  match: MessageCircleHeart,
  match_desfeito: HeartCrack,
  curtida: Heart,
  avaliacao: Star,
  mensagem: MessagesSquare,
  etapa: ListChecks,
  entrevista: CalendarClock,
  entrevista_resposta: CalendarClock,
  seguindo: BellRing,
  busca: SearchCheck,
  convite: Send,
  recomendacao: ThumbsUp,
  contratacao: PartyPopper,
  aceite_curriculo: FileText,
  curriculo_recebido: FileCheck,
  vaga_preenchida: UserCheck,
  finalistas: ClipboardCheck,
  convite_candidato: UserX,
  equipe: UsersRound,
  conexao: Handshake,
  recado_no_ar: MessageSquareText,
  recado_forca: BicepsFlexed,
  // os convites do admin, para quem não tem e-mail
  convite_curriculo: FileText,
  convite_empresa: Inbox,
  convite_agencia: Inbox,
  convite_servicos: Share2,
  convite_vitrine: Store,
  // o currículo passou a aparecer para as empresas e na aba Talentos
  curriculo_publico: UserSearch,
  // quem viu o perfil, o currículo ou a candidatura
  visita: Eye,
  visitas_do_dia: Eye,
  visitas_novidade: Eye,
  // a mensagem que a equipe do Publike escreveu para a conta
  mensagem_equipe: Megaphone,
};

type Notificacao = {
  id: number;
  tipo: string;
  anuncio_id: string | null;
  ator_id: string | null;
  texto: string;
  lida: boolean;
  criado_em: string;
  recado_id: string | null;
};

function destino(n: Notificacao, usuarioId: string) {
  if (n.tipo === "mensagem_equipe") return "/painel/mensagens-da-equipe";
  if (n.tipo === "convite_curriculo") return "/perfil/curriculo";
  if (n.tipo === "curriculo_publico") return "/perfil/curriculo#quem-acha";
  if (n.tipo === "visitas_novidade") return "/painel/visitas#opcoes";
  if (n.tipo === "visita" || n.tipo === "visitas_do_dia") return "/painel/visitas";
  if (n.tipo === "convite_empresa" || n.tipo === "convite_agencia") return "/painel";
  if (n.tipo === "convite_servicos") return `/perfil/${usuarioId}`;
  if (n.tipo === "convite_vitrine") return "/painel/servicos";
  if (n.tipo === "curtida" && n.anuncio_id) return `/painel/anuncio/${n.anuncio_id}`;
  if (n.tipo === "match") return "/painel/matches";
  if (n.tipo === "match_desfeito" && n.anuncio_id) return `/anuncio/${n.anuncio_id}`;
  if (n.tipo === "avaliacao") return "/painel/avaliacoes";
  if (n.tipo === "avaliacao_retida" || n.tipo === "avaliacao_removida") return "/regras";
  if (n.tipo === "avaliacao_liberada" && n.anuncio_id) return `/anuncio/${n.anuncio_id}`;
  // moderação do anúncio: Meus anúncios mostra se está em análise, no ar ou como pôr de volta
  if (n.tipo === "em_analise" || n.tipo === "liberado") return "/painel/anuncios";
  if (n.tipo === "etapa") return "/painel/curtidas";
  if (n.tipo === "entrevista" && n.anuncio_id) return `/anuncio/${n.anuncio_id}`;
  if (n.tipo === "entrevista_resposta" && n.anuncio_id) return `/painel/anuncio/${n.anuncio_id}/quadro`;
  if (n.tipo === "finalistas" && n.anuncio_id) return `/painel/anuncio/${n.anuncio_id}/finalistas`;
  if (n.tipo === "convite_candidato" && n.anuncio_id) return `/painel/anuncio/${n.anuncio_id}/convidar`;
  if (n.tipo === "equipe") return "/painel/equipe";
  // recados: a página do recado (o "não publicado" leva aos recados do perfil, onde aparece o motivo)
  if ((n.tipo === "recado_no_ar" || n.tipo === "recado_forca") && n.recado_id) return `/recado/${n.recado_id}`;
  if (n.tipo === "recado_retido") return `/perfil/${usuarioId}#recados`;
  if (n.tipo === "conexao") return n.ator_id ? `/painel/conexoes/${n.ator_id}` : "/painel/conexoes";
  // aceito numa vaga que pede currículo: direto para o currículo, que volta para a vaga
  if (n.tipo === "aceite_curriculo" && n.anuncio_id)
    return `/perfil/curriculo?next=${encodeURIComponent(`/anuncio/${n.anuncio_id}`)}`;
  if (n.tipo === "curriculo_recebido" && n.anuncio_id)
    return `/painel/anuncio/${n.anuncio_id}${n.ator_id ? `#candidato-${n.ator_id}` : ""}`;
  if ((n.tipo === "seguindo" || n.tipo === "busca" || n.tipo === "convite") && n.anuncio_id)
    return `/anuncio/${n.anuncio_id}`;
  if (n.tipo === "vaga_preenchida") return "/?tipo=vaga";
  if (n.tipo === "recomendacao") return `/perfil/${usuarioId}#recomendacoes`;
  if (n.tipo === "contratacao" && n.anuncio_id) return `/painel/contratacao/${n.anuncio_id}`;
  // a conversa é uma por pessoa (as vagas em comum e a conexão juntas)
  if (n.tipo === "mensagem") return n.ator_id ? caminhoConversa(n.ator_id) : "/painel/conversas";
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
      .select("id, tipo, anuncio_id, ator_id, texto, lida, criado_em, recado_id")
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
      const antes = itens;
      setItens((atual) => atual.map((i) => ({ ...i, lida: true })));
      // não marcou no banco: os avisos voltam a contar como novos (senão sumiriam só nesta tela)
      criarClienteNavegador()
        .from("notificacoes")
        .update({ lida: true })
        .eq("lida", false)
        .then(
          ({ error }) => {
            if (error) {
              console.warn("Publike: não deu para marcar os avisos como lidos:", error.message);
              setItens(antes);
            }
          },
          () => setItens(antes),
        );
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
          className="absolute top-full right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] max-sm:fixed max-sm:inset-x-4 max-sm:top-16 max-sm:w-auto rounded-md border border-line bg-surface-200 p-2 shadow-raised"
        >
          <p className="px-3 pt-1 pb-2 text-label">Avisos</p>
          {itens.length === 0 ? (
            <p className="px-3 pb-3 text-body-sm text-ink-muted">
              Nada por enquanto. Curtidas, matches, mensagens e novidades das suas candidaturas aparecem aqui.
            </p>
          ) : (
            <ul className="flex max-h-96 flex-col overflow-y-auto">
              {itens.map((n) => {
                const Icone = ICONES[n.tipo] ?? ShieldCheck;
                return (
                  <li key={n.id}>
                    <Link
                      href={destino(n, usuarioId)}
                      onClick={() => setAberto(false)}
                      className="flex gap-3 rounded-sm px-3 py-2.5 hover:bg-surface-300"
                    >
                      <Icone
                        aria-hidden
                        className={`mt-0.5 size-[18px] shrink-0 ${n.tipo === "curtida" ? "text-like" : n.tipo === "match" || n.tipo === "curriculo_recebido" ? "text-cerrado-text" : n.tipo === "aceite_curriculo" ? "text-terra-text" : "text-ink-muted"}`}
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
