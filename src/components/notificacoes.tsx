"use client";

import {
  Bell,
  BellRing,
  BicepsFlexed,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  Eye,
  FileCheck,
  FileCheck2,
  FileSignature,
  FileText,
  Gift,
  Handshake,
  Heart,
  HeartCrack,
  Hourglass,
  Inbox,
  ListChecks,
  MailCheck,
  Megaphone,
  MessageCircleHeart,
  MessageCircleQuestion,
  MessageSquareText,
  MessagesSquare,
  Newspaper,
  PartyPopper,
  SearchCheck,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  ThumbsUp,
  UserCheck,
  UserSearch,
  UsersRound,
  UserX,
  Video, QrCode } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import { destinoDoAviso } from "@/lib/destino-aviso";
import { AtivarNotificacoes } from "./notificacoes-celular";
import { tempoRelativo } from "@/lib/formato";
// o Supabase do navegador só baixa para quem tem conta (17/11/2026: o import fixo levava o pacote para todas as páginas)
import { clienteDoNavegador } from "@/lib/supabase/navegador-sob-demanda";
import { mudarVisibilidadeCurriculo } from "@/lib/acoes/talentos";
import { EscolherContatoNoConvite } from "./conexoes/contato-no-convite";
import { useAcao } from "./ui/usar-acao";

/** O ícone de cada tipo de aviso (o resto: escudo, da moderação). */
const ICONES: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  match: MessageCircleHeart,
  pagamento: CreditCard,
  match_desfeito: HeartCrack,
  curtida: Heart,
  avaliacao: Star,
  mensagem: MessagesSquare,
  etapa: ListChecks,
  entrevista: CalendarClock,
  entrevista_resposta: CalendarClock,
  entrevista_lembrete: CalendarClock,
  video_pedido: Video,
  video_cancelado: Video,
  video_enviado: Video,
  parados: Hourglass,
  proposta: FileSignature,
  proposta_resposta: FileSignature,
  candidatura_recebida: MailCheck,
  seguindo: BellRing,
  busca: SearchCheck,
  // curtida sem resposta: o lembrete para quem publicou e o aviso para quem curtiu
  lembrete_curtida: Hourglass,
  sem_resposta: SearchCheck,
  dispensada: SearchCheck,
  convite: Send,
  teste_pedido: ClipboardCheck,
  teste_feito: ClipboardCheck,
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
  // as vagas e os talentos que combinam, toda semana
  vagas_semana: Sparkles,
  talentos_semana: UserSearch,
  talentos_reativar: UserSearch,
  // deu match: o aviso para quem publicou, e os matches que esperam o contato
  match_empresa: MessageCircleHeart,
  respostas_match: MessageCircleQuestion,
  matches_sem_contato: MessageCircleHeart,
  // o comunicado que a equipe mandou para um público (Admin › Comunicados)
  comunicado: Megaphone,
  // as notícias publicadas no dia, num aviso só
  noticias_do_dia: Newspaper,
  // uma funcionalidade liberada (a página de carreiras pela meta, ou o que a equipe liberou)
  liberacao: Gift,
  // o candidato que combina com a vaga de quem contrata
  talento_combina: UserSearch,
  // o pedido de vaga do cliente da agência (pelo link do cliente)
  pedido_cliente: ClipboardList,
  // talentos novos numa busca salva de Talentos
  busca_talentos: UserSearch,
  // faltam documentos da admissão, 2 dias antes do primeiro dia
  documentos_admissao: FileCheck2,
  // uma vaga indicada por e-mail para quem já tem conta (migração 20270317120000)
  indicacao: Send,
  // um comentário na vaga e a resposta a um comentário (migração 20270318120000)
  comentario: MessageSquareText,
  comentario_resposta: MessageSquareText,
  // as conquistas (migração 20270322120000): "Deu certo?", a confirmação da empresa e os parabéns
  conquista_pergunta: PartyPopper,
  conquista_confirmar: PartyPopper,
  conquista_parabens: PartyPopper,
  // "A empresa te respondeu?" e, no "Ainda não", o aviso para quem publicou (migração 20270526120000)
  te_respondeu: MessageCircleQuestion,
  ainda_espera: Hourglass,
  // o vencimento da vaga (migração 20270529120000)
  vaga_vence: CalendarClock,
  vaga_venceu: CalendarClock,
  // a rota do currículo: abriram uma cópia (migração 20270605120000)
  copia_aberta: QrCode,
  rota_pergunta: QrCode,
  interesse_local: Store,
  procura_na_regiao: UserSearch,
  curriculo_semana: FileText,
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
  link?: string | null;
};

/** O aviso do contato no convite (migração 20270626120000), com "Liberar agora" e "Não liberar" embaixo. */
function ehAvisoDoContato(n: Notificacao) {
  return n.tipo === "comunicado" && !!n.link?.startsWith("/perfil/curriculo#contato-no-convite");
}

/**
 * O que o sino sabe de quem procura, para o que vai embaixo dos avisos: a escolha do contato no convite (null: ainda
 * não escolheu) e se saiu de Talentos. Vem do banco a cada vez que o sino abre, porque a lista some ao fechar e a
 * escolha também muda em "Quem vê seu currículo" (17/11/2026, Marcelo: "cliquei em Liberar várias vezes mas ele
 * volta"). "lendo": a primeira leitura não voltou. Sem dar para ler, fica como antes (os botões aparecem).
 */
type DoTalento = { escolha: boolean | null; saiu: boolean } | "lendo";

/** Sino com avisos de curtida e de match, que chegam na hora (Supabase Realtime). */
export function Notificacoes({
  usuarioId,
  vapid = null,
}: {
  usuarioId: string;
  /** a chave pública das notificações no celular; sem ela, o "Ativar notificações" não aparece */
  vapid?: string | null;
}) {
  const [itens, setItens] = useState<Notificacao[]>([]);
  const [aberto, setAberto] = useState(false);
  const [agora, setAgora] = useState(0);
  const [talento, setTalento] = useState<DoTalento>("lendo");
  const caixa = useRef<HTMLDivElement>(null);
  const naoLidas = itens.filter((i) => !i.lida).length;

  useEffect(() => {
    let ativo = true;
    let fechar = () => {};
    void (async () => {
      const [supabase, { ouvirAoVivo }] = await Promise.all([clienteDoNavegador(), import("@/lib/supabase/navegador")]);
      if (!ativo) return;
      supabase
        .from("notificacoes")
        // tudo: o link do comunicado vem quando o banco tem a coluna (sem ela, a lista sai do mesmo jeito)
        .select("*")
        .order("criado_em", { ascending: false })
        .limit(20)
        .then(({ data }) => {
          if (ativo && data) setItens(data);
        });
      // o canal entra já com o login (sem ele, o Realtime recusa o filtro e o aviso só aparece ao recarregar)
      fechar = ouvirAoVivo(supabase, (s) =>
        s
          .channel(`notificacoes-${usuarioId}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "notificacoes", filter: `destinatario_id=eq.${usuarioId}` },
            (mudanca) => {
              const nova = mudanca.new as Notificacao;
              setItens((atual) => [nova, ...atual].slice(0, 20));
              // a janela de conversas atualiza com o aviso de mensagem (ela não tem canal ao vivo próprio)
              window.dispatchEvent(new CustomEvent("publike:aviso", { detail: { tipo: nova.tipo } }));
            },
          ),
      );
    })();
    return () => {
      ativo = false;
      fechar();
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

  function lerTalento() {
    // sem a migração ou sem internet: mantém o que já sabia; na primeira vez, os botões aparecem, como antes
    const semLer = () => setTalento((t) => (t === "lendo" ? { escolha: null, saiu: false } : t));
    void clienteDoNavegador()
      .then((c) => c.rpc("meu_contato_no_convite_talento"))
      .then(({ data, error }) => {
        const d = data as { escolha?: unknown; situacao?: unknown } | null;
        if (error || !d || typeof d !== "object") {
          if (error) console.warn("Publike: não deu para ler a escolha do contato no convite:", error.message);
          semLer();
          return;
        }
        setTalento({ escolha: typeof d.escolha === "boolean" ? d.escolha : null, saiu: d.situacao === "fora" });
      }, semLer);
  }

  function alternar() {
    const abrir = !aberto;
    setAberto(abrir);
    setAgora(Date.now());
    if (abrir && itens.some((n) => ehAvisoDoContato(n) || n.tipo === "convite")) lerTalento();
    if (abrir && naoLidas > 0) {
      const antes = itens;
      setItens((atual) => atual.map((i) => ({ ...i, lida: true })));
      // não marcou no banco: os avisos voltam a contar como novos (senão sumiriam só nesta tela)
      void clienteDoNavegador()
        .then((c) => c.from("notificacoes").update({ lida: true }).eq("lida", false))
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
          <div className="flex items-baseline justify-between gap-3 px-3 pt-1 pb-2">
            <p className="text-label">Avisos</p>
            {/* o que chega no e-mail e no celular, por tipo */}
            <Link
              href="/perfil/preferencias#avisos"
              onClick={() => setAberto(false)}
              className="text-body-sm text-ink-muted underline underline-offset-2 hover:text-ink"
            >
              Escolher os avisos
            </Link>
          </div>
          {vapid && <AtivarNotificacoes vapid={vapid} />}
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
                      href={destinoDoAviso(n, usuarioId)}
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
                    {n.tipo === "convite" && (
                      <PararConvites
                        saiu={talento !== "lendo" && talento.saiu}
                        aoParar={() => setTalento((t) => (t === "lendo" ? t : { ...t, saiu: true }))}
                      />
                    )}
                    {/* o aviso do contato no convite (migração 20270626120000): liberar já ou não */}
                    {ehAvisoDoContato(n) && talento !== "lendo" && (
                      <EscolherContatoNoConvite
                        escolha={talento.escolha}
                        aoEscolher={(mostrar) => setTalento((t) => (t === "lendo" ? t : { ...t, escolha: mostrar }))}
                        aoSair={() => setAberto(false)}
                      />
                    )}
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

/**
 * No aviso de convite: parar os convites com um toque (sai de Talentos; volta em Currículo quando quiser). Quem já
 * saiu (aqui ou em Currículo) não vê mais o "Não quero mais convites": antes, ele voltava ao abrir o sino de novo.
 */
function PararConvites({ saiu, aoParar }: { saiu: boolean; aoParar: () => void }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [confirmar, setConfirmar] = useState(false);
  const [feito, setFeito] = useState(false);
  if (feito) return <div className="pb-2 pl-[42px] pr-3">{mensagem}</div>;
  if (saiu) return null;
  return (
    <div className="flex flex-col gap-1 pb-2 pl-[42px] pr-3">
      {confirmar ? (
        <>
          <p className="text-[13px] text-ink-muted">
            Você sai de Talentos e as empresas não acham mais seu currículo. Pode voltar em Currículo quando quiser.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pendente}
              onClick={() =>
                rodar(
                  () => mudarVisibilidadeCurriculo(false),
                  (r) => {
                    if (!r.ok) return;
                    setFeito(true);
                    aoParar();
                  },
                )
              }
              className="min-h-9 rounded-sm px-2 text-[13px] font-semibold text-danger underline disabled:opacity-60"
            >
              Parar os convites
            </button>
            <button
              type="button"
              onClick={() => setConfirmar(false)}
              className="min-h-9 rounded-sm px-2 text-[13px] text-ink-muted underline"
            >
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmar(true)}
          className="min-h-9 self-start rounded-sm text-[13px] text-ink-muted underline hover:text-ink"
        >
          Não quero mais convites
        </button>
      )}
      {mensagem}
    </div>
  );
}
