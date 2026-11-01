"use client";

import {
  CalendarPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  ClipboardCheck,
  Clock3,
  Heart,
  Keyboard,
  MoreHorizontal,
  PartyPopper,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { marcarVagaPreenchida } from "@/lib/acoes/anuncios";
import { responderCurtida } from "@/lib/acoes/curtidas";
import { moverCandidatos } from "@/lib/acoes/recrutamento";
import { pedirTeste } from "@/lib/acoes/testes";
import { resumirCandidatoComIA } from "@/lib/acoes/talentos";
import { SITE_URL } from "@/lib/config";
import type { VideoNoQuadro } from "@/lib/entrevista-video";
import type { ResumoCandidato } from "@/lib/ia/tarefas";
import type { Proposta } from "@/lib/proposta";
import { PropostaNaFicha } from "../proposta/proposta-na-ficha";
import { useAcao } from "../ui/usar-acao";
import { VideoNaFicha } from "../video/video-na-ficha";
import { classesBotao } from "../ui/botao";
import { EntrevistaMarcada, FormEntrevista } from "./recrutamento";

// Os controles da ficha do candidato na caixa de entrada: responder (aceitar ou
// dispensar), ir para o próximo e desfazer, com atalhos de teclado. O "desfazer" fica
// guardado fora do componente para sobreviver à troca de ficha.

type Ultima = { anuncioId: string; perfilId: string; texto: string; desfaz: boolean } | null;
let ultima: Ultima = null;
const ouvintes = new Set<() => void>();
function guardar(u: Ultima) {
  ultima = u;
  ouvintes.forEach((f) => f());
}
function useUltima() {
  return useSyncExternalStore(
    (f) => (ouvintes.add(f), () => ouvintes.delete(f)),
    () => ultima,
    () => null,
  );
}

export type EstadoFicha = "responder" | "aceita" | "match" | "dispensada" | "desfeito" | "moderacao";

const digitando = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return (
    e.metaKey ||
    e.ctrlKey ||
    e.altKey ||
    Boolean(t?.closest("input, textarea, select, [contenteditable=true], dialog[open]"))
  );
};

/** A etapa da ficha, com os nomes de Candidatos (`abaDaEtapa`). */
export type AbaDaFicha = "novos" | "analise" | "entrevista" | "contratados" | "nao_seguiu";

/** O que a folha de "Chamar" e a de "Contratado" precisam (claude/plano-fluxo-contratar.md, partes 3 a 5). */
export type ExtrasDaFicha = {
  aba: AbaDaFicha;
  entrevista: EntrevistaResumo | null;
  agora: number;
  vaga: { titulo: string; noAr: boolean; preenchida: boolean; quantas: number; contratados: number };
  endereco: string;
  /** a chamada pelo Publike (Entrevista em vídeo liberada e a Daily configurada) */
  aoVivo: boolean;
  video: { liberado: boolean; atual: VideoNoQuadro | null };
  /** os testes da vaga, para "Pedir o teste antes" */
  testes: { id: string; titulo: string }[];
  proposta: Proposta | null;
  /** o que as Automações personalizadas fizeram com a pessoa nesta vaga (com o Desfazer) */
  regras?: {
    id: number;
    regra: string;
    feitas: { tipo: string; resultado: string; etapa?: string | null }[];
    feito_em: string;
    desfeito_em: string | null;
  }[];
};

type Feito = { texto: string; voltar?: () => Promise<{ ok: boolean; erro?: string }> } | null;

export function ControlesDaFicha({
  anuncioId,
  perfilId,
  nome,
  estado,
  semCurriculo,
  anterior,
  proximo,
  depois,
  conversa,
  base = "/painel/caixa",
  extras = null,
  conectar = null,
}: {
  base?: string;
  /** o Conectar (conexão sem vaga): fica no "Mais", com o Só aceitar e os atalhos */
  conectar?: ReactNode;
  anuncioId: string;
  perfilId: string;
  nome: string;
  estado: EstadoFicha;
  semCurriculo: string | null;
  anterior: string | null;
  proximo: string | null;
  /** para onde ir depois de responder (o próximo da lista, que ainda espera) */
  depois: string;
  conversa: string | null;
  /** sem eles (a ficha antiga), só Aceitar e Dispensar */
  extras?: ExtrasDaFicha | null;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [ajuda, setAjuda] = useState(false);
  const [mais, setMais] = useState(false);
  const caixaMais = useRef<HTMLDivElement>(null);
  // a folha aberta: "chamar" (entrevista, vídeo, teste) ou "contratado" (proposta e vaga completa)
  const [folha, setFolha] = useState<"chamar" | "contratado" | null>(null);
  const [feito, setFeito] = useState<Feito>(null);
  const desfazer = useUltima();
  const primeiro = nome.split(" ")[0];
  const aba = extras?.aba ?? "novos";
  const entrevista = extras?.entrevista ?? null;
  const passou =
    entrevista && entrevista.situacao !== "escolher" && extras
      ? new Date(entrevista.quando).getTime() < extras.agora
      : false;
  // a vaga completou as pessoas que pediu: a folha do contratado sugere encerrar (desligado, nada fecha sozinho)
  const completa = extras ? extras.vaga.contratados >= extras.vaga.quantas : false;

  function responder(decisao: "match" | "dispensada") {
    setErro(null);
    iniciar(async () => {
      const r = await chamarAcao(() => responderCurtida(anuncioId, perfilId, decisao));
      if (!r.ok) {
        if ("ir" in r && r.ir) router.push(r.ir);
        else setErro(r.erro);
        return;
      }
      const aceitaSemCurriculo = decisao === "match" && semCurriculo !== null;
      guardar({
        anuncioId,
        perfilId,
        desfaz: decisao === "dispensada" || aceitaSemCurriculo,
        texto:
          decisao === "dispensada"
            ? `${primeiro} foi dispensado.`
            : aceitaSemCurriculo
              ? `Aceito: ${primeiro} recebeu o pedido do currículo.`
              : `${primeiro} foi aceito. O contato está liberado.`,
      });
      router.push(depois, { scroll: false });
    });
  }

  function voltar() {
    const u = ultima;
    if (!u?.desfaz) return;
    iniciar(async () => {
      const r = await chamarAcao(() => responderCurtida(u.anuncioId, u.perfilId, "pendente"));
      if (!r.ok) return setErro(r.erro);
      guardar(null);
      router.push(`${base}?c=${u.anuncioId}:${u.perfilId}`, { scroll: false });
    });
  }

  /** Leva para uma etapa (Ver depois, Contratar, Não seguiu), com o Desfazer de volta para a de antes. */
  function mover(destino: "analise" | "contratado" | "nao_seguiu", texto: string) {
    setErro(null);
    const antes =
      aba === "contratados" ? "contratado" : aba === "nao_seguiu" ? "nao_seguiu" : aba === "novos" ? "novo" : aba;
    iniciar(async () => {
      const r = await chamarAcao(() => moverCandidatos(anuncioId, [perfilId], destino));
      if (!r.ok) return setErro(r.erro);
      if (!r.feitos) return setErro(r.falhas[0]?.erro ?? "Não deu para mudar agora.");
      setFeito({
        texto,
        voltar: async () => {
          const v = await chamarAcao(() => moverCandidatos(anuncioId, [perfilId], antes, { semMensagem: true }));
          return v.ok ? { ok: true } : { ok: false, erro: v.erro };
        },
      });
      if (destino === "contratado") setFolha("contratado");
      router.refresh();
    });
  }

  // a vaga completa: preenchida, e quem ficou recebe o aviso (o aviso não volta: sem Desfazer; reabrir fica na vaga)
  function marcarPreenchida() {
    setErro(null);
    iniciar(async () => {
      const r = await chamarAcao(() => marcarVagaPreenchida(anuncioId, true));
      if (!r.ok) return setErro(r.erro);
      setFeito({ texto: r.mensagem ?? "Vaga marcada como preenchida." });
      router.refresh();
    });
  }

  function desfazerFeito() {
    const f = feito;
    if (!f?.voltar) return;
    iniciar(async () => {
      const r = await f.voltar!();
      if (!r.ok) return setErro(r.erro ?? "Não deu para desfazer.");
      setFeito(null);
      setFolha(null);
      router.refresh();
    });
  }

  const responde = estado === "responder" || estado === "desfeito";
  const noProcesso = estado === "match" && aba !== "contratados" && aba !== "nao_seguiu";
  const podeChamar = Boolean(extras) && (responde || (noProcesso && !entrevista));

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (digitando(e) || pendente) return;
      const k = e.key.toLowerCase();
      // a navegação conta como pendente: tecla repetida não pula ninguém
      if (k === "j" && proximo) iniciar(() => router.push(proximo, { scroll: false }));
      else if (k === "k" && anterior) iniciar(() => router.push(anterior, { scroll: false }));
      else if (k === "a" && responde) responder("match");
      else if (k === "d" && estado === "responder") responder("dispensada");
      else if (k === "z" && ultima?.desfaz) voltar();
      else if (k === "c" && conversa) router.push(conversa);
      else if (k === "e" && podeChamar) {
        setFolha("chamar");
        // a folha abre com o cursor no primeiro campo (o dia e a hora)
        setTimeout(() => document.querySelector<HTMLElement>("#folha-chamar input[type=datetime-local]")?.focus(), 50);
      } else if (k === "e" && estado === "match") {
        const alvo = document.getElementById("entrevista");
        alvo?.scrollIntoView({ behavior: "smooth", block: "start" });
        alvo?.querySelector<HTMLElement>("input, button")?.focus({ preventScroll: true });
      } else if (e.key === "?") setAjuda((a) => !a);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  // o "Mais" (o Só aceitar, o Conectar e os atalhos) fecha com um toque fora ou com Esc
  const soAtalhos = !((responde && extras) || (noProcesso && extras) || conectar);
  useEffect(() => {
    if (!mais) return;
    function fora(e: PointerEvent) {
      if (!caixaMais.current?.contains(e.target as Node)) setMais(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setMais(false);
    }
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [mais]);

  const principal =
    "inline-flex min-h-11 items-center gap-2 rounded-pill bg-terra px-4 text-label text-on-terra transition-colors hover:bg-terra-hover disabled:opacity-60";
  const secundario =
    "inline-flex min-h-11 items-center gap-2 rounded-pill border border-line-strong bg-surface-200 px-4 text-label text-ink transition-colors hover:bg-surface-300 disabled:opacity-60";
  const leve =
    "inline-flex min-h-11 items-center gap-2 rounded-pill px-4 text-label text-ink transition-colors hover:bg-surface-300 disabled:opacity-60";

  return (
    <div className="flex flex-col gap-3">
      {/* no celular, os atalhos ficam presos embaixo (acima da barra), no alcance do polegar, enquanto a ficha rola */}
      <div className="flex flex-wrap items-center gap-2 max-md:sticky max-md:bottom-[calc(4rem+env(safe-area-inset-bottom))] max-md:z-10 max-md:-mx-4 max-md:border-t max-md:border-line max-md:bg-surface-200/95 max-md:px-4 max-md:py-2 max-md:backdrop-blur-md">
        {podeChamar && (
          <button
            type="button"
            disabled={pendente}
            onClick={() => setFolha(folha === "chamar" ? null : "chamar")}
            aria-expanded={folha === "chamar"}
            className={principal}
          >
            <CalendarPlus aria-hidden className="size-[18px]" />
            {responde ? "Chamar para entrevista" : "Marcar a entrevista"}
          </button>
        )}
        {responde && extras && aba !== "analise" && (
          <button
            type="button"
            disabled={pendente}
            onClick={() => mover("analise", `${primeiro} foi para Em análise.`)}
            className={secundario}
          >
            <Clock3 aria-hidden className="size-[18px]" />
            Ver depois
          </button>
        )}
        {responde && !extras && (
          <button
            type="button"
            disabled={pendente}
            onClick={() => responder("match")}
            className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-line-strong bg-surface-200 px-4 text-label text-ink transition-colors hover:bg-like-soft hover:text-like-text disabled:opacity-60"
          >
            <Heart aria-hidden className="size-[18px] text-like" />
            {estado === "desfeito" ? "Aceitar de novo" : "Aceitar"}
          </button>
        )}
        {estado === "responder" && (
          <button type="button" disabled={pendente} onClick={() => responder("dispensada")} className={leve}>
            <X aria-hidden className="size-[18px]" />
            Dispensar
          </button>
        )}
        {noProcesso && extras && (
          <button
            type="button"
            disabled={pendente}
            onClick={() => mover("contratado", `${primeiro} foi contratado.`)}
            className={entrevista && !passou ? secundario : podeChamar ? secundario : principal}
          >
            <PartyPopper aria-hidden className="size-[18px]" />
            Contratar
          </button>
        )}
        {estado === "match" && extras && aba === "contratados" && (
          <button
            type="button"
            onClick={() => setFolha(folha === "contratado" ? null : "contratado")}
            aria-expanded={folha === "contratado"}
            className={secundario}
          >
            <PartyPopper aria-hidden className="size-[18px] text-cerrado-text" />
            Contratado: proposta e vaga
          </button>
        )}
        {estado === "match" && extras && aba === "nao_seguiu" && (
          <button
            type="button"
            disabled={pendente}
            onClick={() => mover("analise", `${primeiro} voltou para Em análise.`)}
            className={secundario}
          >
            <Undo2 aria-hidden className="size-[18px]" />
            Voltar para Em análise
          </button>
        )}
        {estado === "dispensada" && (
          <button
            type="button"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await chamarAcao(() => responderCurtida(anuncioId, perfilId, "pendente"));
                if (!r.ok) setErro(r.erro);
              })
            }
            className={secundario}
          >
            <Undo2 aria-hidden className="size-[18px]" />
            Voltar para Novos
          </button>
        )}
        <div ref={caixaMais} className={`relative ml-auto ${soAtalhos ? "max-lg:hidden" : ""}`}>
          <button
            type="button"
            onClick={() => setMais((m) => !m)}
            aria-expanded={mais}
            aria-label="Mais opções"
            title="Mais opções"
            className="inline-flex size-11 items-center justify-center rounded-pill text-ink-muted transition-colors hover:bg-surface-300 hover:text-ink"
          >
            <MoreHorizontal aria-hidden className="size-5" />
          </button>
          {mais && (
            <div
              role="group"
              aria-label="Mais opções"
              className="absolute right-0 z-20 mt-1 flex w-72 flex-col gap-1 rounded-lg border border-line bg-surface-100 p-2 shadow-card max-md:bottom-full max-md:mb-2 max-md:mt-0"
            >
              {responde && extras && (
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => {
                    setMais(false);
                    responder("match");
                  }}
                  className="flex min-h-11 items-center gap-2 rounded-md px-3 text-left text-body-sm hover:bg-surface-300 disabled:opacity-60"
                >
                  <Heart aria-hidden className="size-4 shrink-0 text-like" />
                  {estado === "desfeito" ? "Só aceitar de novo" : "Só aceitar, sem marcar a entrevista"}
                </button>
              )}
              {noProcesso && extras && (
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => {
                    setMais(false);
                    mover("nao_seguiu", `${primeiro} não segue no processo.`);
                  }}
                  className="flex min-h-11 items-center gap-2 rounded-md px-3 text-left text-body-sm hover:bg-surface-300 disabled:opacity-60"
                >
                  <X aria-hidden className="size-4 shrink-0 text-ink-muted" />
                  Não seguiu no processo
                </button>
              )}
              {conectar && (
                <div className="flex flex-col gap-1 rounded-md px-3 py-2">
                  <p className="text-caption text-ink-muted">Para manter o contato depois da vaga</p>
                  {conectar}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setMais(false);
                  setAjuda((x) => !x);
                }}
                className="hidden min-h-11 items-center gap-2 rounded-md px-3 text-left text-body-sm hover:bg-surface-300 lg:flex"
              >
                <Keyboard aria-hidden className="size-4 shrink-0 text-ink-muted" />
                {ajuda ? "Esconder os atalhos do teclado" : "Atalhos do teclado"}
              </button>
            </div>
          )}
        </div>
      </div>
      {semCurriculo && responde && (
        <p className="text-body-sm text-ink-muted">
          A vaga pede currículo e {semCurriculo} ainda não mandou. Aceitando, {semCurriculo} recebe o pedido e o contato
          sai quando o currículo chegar.
        </p>
      )}

      {folha === "chamar" && extras && (
        <FolhaChamar
          anuncioId={anuncioId}
          perfilId={perfilId}
          nome={nome}
          responde={responde}
          extras={extras}
          aoFechar={() => setFolha(null)}
        />
      )}
      {folha === "contratado" && extras && (
        <section
          aria-label="Contratado"
          className="flex flex-col gap-4 rounded-lg border border-cerrado/40 bg-surface-100 p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-label">{primeiro} foi contratado: o que mais?</h3>
            <button
              type="button"
              onClick={() => setFolha(null)}
              aria-label="Fechar"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-label">A proposta (opcional)</p>
            <PropostaNaFicha
              anuncioId={anuncioId}
              perfilId={perfilId}
              nome={nome}
              endereco={extras.endereco}
              proposta={extras.proposta}
            />
          </div>
          {extras.vaga.noAr && extras.vaga.preenchida && (
            <p className="flex items-center gap-1.5 border-t border-line pt-3 text-body-sm">
              <CircleCheckBig aria-hidden className="size-4 text-cerrado-text" />A vaga está marcada como preenchida.
            </p>
          )}
          {extras.vaga.noAr && !extras.vaga.preenchida && (
            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <p className="text-body-sm">
                {completa
                  ? `A vaga está completa: ${extras.vaga.contratados} de ${extras.vaga.quantas} ${extras.vaga.quantas === 1 ? "pessoa contratada" : "pessoas contratadas"}.`
                  : `${extras.vaga.contratados} de ${extras.vaga.quantas} contratados. A vaga continua no ar.`}
              </p>
              {completa && (
                <div className="flex flex-col items-start gap-1">
                  <button
                    type="button"
                    disabled={pendente}
                    onClick={marcarPreenchida}
                    className={`${secundario} self-start`}
                  >
                    <CircleCheckBig aria-hidden className="size-[18px] text-cerrado-text" />
                    Marcar como preenchida
                  </button>
                  <p className="text-caption text-ink-muted">
                    Quem ficou recebe o aviso de que a vaga foi preenchida, com as outras vagas perto. Para só tirar do
                    ar, use o Encerrar da vaga.
                  </p>
                </div>
              )}
              <p className="text-caption text-ink-muted">
                Para marcar a vaga como preenchida sozinha quando completar, ligue em{" "}
                <Link href={`/painel/anuncio/${anuncioId}/automacoes`} className="underline underline-offset-2">
                  Automações
                </Link>
                .
              </p>
            </div>
          )}
        </section>
      )}

      {ajuda && (
        <ul
          aria-label="Atalhos de teclado"
          className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md bg-surface-300 px-4 py-3 text-body-sm sm:grid-cols-4"
        >
          {[
            ["E", extras ? "chamar para entrevista" : "entrevista"],
            ["A", "aceitar"],
            ["D", "dispensar"],
            ["J", "próximo"],
            ["K", "anterior"],
            ["C", "conversar"],
            ["Z", "desfazer"],
            ["?", "mostrar ou esconder"],
          ].map(([t, o]) => (
            <li key={t} className="flex items-center gap-2">
              <kbd className="min-w-5 rounded-sm border border-line-strong bg-surface-200 px-1 text-center font-sans text-caption leading-5">
                {t}
              </kbd>
              {o}
            </li>
          ))}
        </ul>
      )}
      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
      {feito && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-ink px-4 py-2.5 text-body-sm text-surface-100"
        >
          <span className="flex-1">{feito.texto}</span>
          {feito.voltar && (
            <button
              type="button"
              disabled={pendente}
              onClick={desfazerFeito}
              className="inline-flex min-h-9 items-center gap-1.5 font-semibold underline underline-offset-2"
            >
              Desfazer
            </button>
          )}
          <button
            type="button"
            onClick={() => setFeito(null)}
            aria-label="Fechar o aviso"
            className="inline-flex size-9 items-center justify-center rounded-pill hover:bg-surface-100/10"
          >
            <X aria-hidden className="size-4" />
          </button>
        </p>
      )}
      {desfazer && (desfazer.anuncioId !== anuncioId || desfazer.perfilId !== perfilId || estado !== "responder") && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-ink px-4 py-2.5 text-body-sm text-surface-100"
        >
          <span className="flex-1">{desfazer.texto}</span>
          {desfazer.desfaz && (
            <button
              type="button"
              disabled={pendente}
              onClick={voltar}
              className="inline-flex min-h-9 items-center gap-1.5 font-semibold underline underline-offset-2"
            >
              Desfazer
              <kbd className="hidden rounded-sm border border-surface-100/40 px-1 font-sans text-caption lg:inline">
                Z
              </kbd>
            </button>
          )}
          <button
            type="button"
            onClick={() => guardar(null)}
            aria-label="Fechar o aviso"
            className="inline-flex size-9 items-center justify-center rounded-pill hover:bg-surface-100/10"
          >
            <X aria-hidden className="size-4" />
          </button>
        </p>
      )}
    </div>
  );
}

/**
 * A folha de "Chamar para entrevista": diz o que acontece e traz o jeito de marcar (o dia e a hora, ou os horários
 * para o candidato escolher, com os livres da conta), a entrevista gravada e o teste antes, cada um opcional.
 */
function FolhaChamar({
  anuncioId,
  perfilId,
  nome,
  responde,
  extras,
  aoFechar,
}: {
  anuncioId: string;
  perfilId: string;
  nome: string;
  responde: boolean;
  extras: ExtrasDaFicha;
  aoFechar: () => void;
}) {
  const primeiro = nome.split(" ")[0];
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <section
      id="folha-chamar"
      aria-label={`Chamar ${primeiro} para a entrevista`}
      className="flex flex-col gap-4 rounded-lg border border-line-strong bg-surface-100 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-label">Chamar {primeiro} para a entrevista</h3>
          <p className="text-body-sm text-ink-muted">
            {responde ? `${primeiro} é aceito e o contato fica liberado. ` : ""}Marque o dia e a hora, ou mande alguns
            horários para {primeiro} escolher.
          </p>
        </div>
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <FormEntrevista
        anuncioId={anuncioId}
        perfilId={perfilId}
        nome={nome}
        atual={extras.entrevista}
        endereco={extras.endereco}
        aoVivo={extras.aoVivo}
        aoTerminar={aoFechar}
      />
      {(extras.video.liberado || extras.testes.length > 0) && (
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          <p className="text-label">Antes da conversa, se quiser</p>
          {extras.video.liberado && (
            <VideoNaFicha
              anuncioId={anuncioId}
              perfilId={perfilId}
              nome={nome}
              video={extras.video.atual}
              liberado
              agora={extras.agora}
            />
          )}
          {extras.testes.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-body-sm text-ink-muted">Pedir o Teste Prático:</span>
              {extras.testes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={pendente}
                  onClick={() => rodar(() => pedirTeste(anuncioId, perfilId, t.id))}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-pill border border-line-strong px-3.5 text-label hover:bg-surface-300 disabled:opacity-60"
                >
                  <ClipboardCheck aria-hidden className="size-4 text-ink-muted" />
                  {t.titulo}
                </button>
              ))}
            </div>
          )}
          {mensagem}
        </div>
      )}
    </section>
  );
}

/** O anterior e o próximo da lista (as teclas K e J), no alto da ficha. */
export function NavegarFichas({ anterior, proximo }: { anterior: string | null; proximo: string | null }) {
  if (!anterior && !proximo) return null;
  return (
    <nav aria-label="Outros candidatos" className="flex shrink-0 items-start gap-0.5">
      <NavLink href={anterior} rotulo="Anterior" tecla="K">
        <ChevronLeft aria-hidden className="size-5" />
      </NavLink>
      <NavLink href={proximo} rotulo="Próximo" tecla="J">
        <ChevronRight aria-hidden className="size-5" />
      </NavLink>
    </nav>
  );
}

function NavLink({
  href,
  rotulo,
  tecla,
  children,
}: {
  href: string | null;
  rotulo: string;
  tecla: string;
  children: React.ReactNode;
}) {
  const classe = "inline-flex size-10 items-center justify-center rounded-pill";
  if (!href)
    return (
      <span aria-hidden className={`${classe} text-ink-muted opacity-40`}>
        {children}
      </span>
    );
  return (
    <Link
      href={href}
      scroll={false}
      aria-label={`${rotulo} (${tecla})`}
      title={`${rotulo} (${tecla})`}
      className={`${classe} text-ink hover:bg-surface-300`}
    >
      {children}
    </Link>
  );
}

type EntrevistaResumo = {
  id: string;
  quando: string;
  formato: string;
  local: string | null;
  obs: string | null;
  situacao: string;
  duracao_min?: number | null;
  atualizado_em?: string | null;
};

/** A entrevista na ficha: a marcada (com remarcar e cancelar) ou o formulário para marcar. */
export function EntrevistaDaFicha({
  anuncioId,
  perfilId,
  nome,
  vaga,
  entrevista,
  endereco,
}: {
  anuncioId: string;
  perfilId: string;
  nome: string;
  /** o título da vaga (para o evento na agenda) */
  vaga: string;
  entrevista: EntrevistaResumo | null;
  endereco: string;
}) {
  const [marcando, setMarcando] = useState(false);
  const [marcou, setMarcou] = useState(false);
  if (entrevista && !marcando) {
    return (
      <div className="flex flex-col gap-2">
        {marcou && (
          <p role="status" className="text-body-sm text-cerrado-text">
            Entrevista marcada. {nome.split(" ")[0]} recebeu o aviso e a mensagem na conversa.
          </p>
        )}
        <EntrevistaMarcada
          entrevista={entrevista}
          aoRemarcar={() => (setMarcou(false), setMarcando(true))}
          agenda={{
            vaga,
            candidato: nome,
            url: `${SITE_URL}/painel/anuncio/${anuncioId}/quadro?candidato=${perfilId}`,
          }}
        />
      </div>
    );
  }
  const form = (
    <FormEntrevista
      anuncioId={anuncioId}
      perfilId={perfilId}
      nome={nome}
      atual={entrevista}
      endereco={endereco}
      aoTerminar={() => {
        setMarcando(false);
        setMarcou(true);
      }}
    />
  );
  if (entrevista) return form;
  // sem entrevista, o formulário fica fechado no botão (a ficha não estica); a tecla E abre
  return (
    <details className="group">
      <summary
        className={classesBotao(
          "secundario",
          "sm",
          "w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden",
        )}
      >
        <CalendarPlus aria-hidden />
        Marcar entrevista
        <ChevronDown aria-hidden className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="pt-3">{form}</div>
    </details>
  );
}

/** O resumo do currículo pela IA: o guardado ou o botão para pedir. */
export function ResumoDaIA({
  anuncioId,
  perfilId,
  inicial,
}: {
  anuncioId: string;
  perfilId: string;
  inicial: ResumoCandidato | null;
}) {
  const [resumo, setResumo] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  if (!resumo) {
    return (
      <div className="flex flex-col items-start gap-2">
        <button
          type="button"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              setErro(null);
              const r = await chamarAcao(() => resumirCandidatoComIA(anuncioId, perfilId));
              if (r.ok) setResumo(r.resumo);
              else setErro(r.erro);
            })
          }
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line-strong bg-surface-200 px-3.5 text-label hover:bg-surface-300 disabled:opacity-60"
        >
          <Sparkles aria-hidden className="size-[18px]" />
          {pendente ? "Lendo o currículo…" : "Resumir com IA"}
        </button>
        <p className="text-body-sm text-ink-muted">
          A IA lê o currículo e as respostas e diz os pontos fortes, o que conferir e perguntas para a entrevista.
        </p>
        {erro && (
          <p role="alert" className="text-body-sm text-danger">
            {erro}
          </p>
        )}
      </div>
    );
  }
  const lista = (titulo: string, itens: string[]) =>
    itens.length > 0 && (
      <div>
        <p className="text-caption text-ink-muted uppercase">{titulo}</p>
        <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5 text-body-sm">
          {itens.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </div>
    );
  return (
    <div className="flex flex-col gap-3 rounded-md bg-surface-300 p-3">
      <p className="text-body">{resumo.resumo}</p>
      {lista("Pontos fortes para a vaga", resumo.fortes)}
      {lista("Para conferir", resumo.conferir)}
      {lista("Perguntas para a entrevista", resumo.perguntas)}
      <p className="text-caption text-ink-muted">Feito pela IA a partir do currículo: confira antes de decidir.</p>
    </div>
  );
}
