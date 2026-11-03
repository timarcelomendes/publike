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
  MessageCircle,
  MessagesSquare,
  PartyPopper,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { marcaDeContato } from "@/lib/contato-candidato";
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
  contato = null,
}: {
  base?: string;
  /** depois do aceite: o WhatsApp (o link com a mensagem pronta) e a conversa (na própria ficha ou na página) */
  contato?: ContatoDaFicha | null;
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
      // falta o contato da conta para aceitar: vai completar o perfil
      if (!r.ok && "ir" in r && r.ir) return router.push(r.ir);
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

  // a conversa na própria ficha: rola até ela e põe o cursor no campo
  function irParaConversa() {
    const alvo = document.getElementById("conversa");
    alvo?.scrollIntoView({ behavior: "smooth", block: "start" });
    alvo?.querySelector<HTMLElement>("textarea, input")?.focus({ preventScroll: true });
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
      else if (k === "c" && contato?.conversaNaFicha) irParaConversa();
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

  const secundario =
    "inline-flex min-h-11 items-center gap-2 rounded-pill border border-line-strong bg-surface-200 px-4 text-label text-ink transition-colors hover:bg-surface-300 disabled:opacity-60";

  // A linha de ações (01/11/2026): botões do mesmo tamanho, o ícone em cima e o nome embaixo, numa linha só (até 4).
  // O principal (terra) vem primeiro e o "não" por último; depois do aceite, o contato entra no meio.
  const contatos: ReactNode[] = [];
  if (estado === "match" && contato) {
    if (!contato.whatsapp || !contato.conversaNaFicha)
      contatos.push(
        <Acao
          key="conversar"
          icone={MessagesSquare}
          rotulo="Conversar"
          dica="Conversar no Publike (tecla C)"
          selo={contato.naoLidas}
          {...(contato.conversaNaFicha ? { onClick: irParaConversa } : { href: conversa })}
        />,
      );
    if (contato.whatsapp)
      contatos.push(
        <Acao
          key="whatsapp"
          icone={MessageCircle}
          cor="text-cerrado-text"
          rotulo="WhatsApp"
          dica={entrevista ? "Avisar da entrevista no WhatsApp" : "Chamar no WhatsApp"}
          href={contato.whatsapp}
          externo
          marca={marcaDeContato(anuncioId, perfilId, "whatsapp")}
        />,
      );
  }
  const chamar = podeChamar ? (
    <Acao
      key="chamar"
      principal
      icone={CalendarPlus}
      rotulo={responde ? "Chamar para entrevista" : "Marcar a entrevista"}
      dica="Atalho: tecla E"
      onClick={() => setFolha(folha === "chamar" ? null : "chamar")}
      expandido={folha === "chamar"}
      disabled={pendente}
    />
  ) : null;
  const acoes: ReactNode[] = [];
  if (responde) {
    if (chamar) acoes.push(chamar);
    acoes.push(
      <Acao
        key="aceitar"
        principal={!extras}
        icone={Heart}
        cor="text-like"
        rotulo={estado === "desfeito" ? "Aceitar de novo" : extras ? "Só aceitar" : "Aceitar"}
        dica={extras ? "Aceitar sem marcar a entrevista: o contato fica liberado (tecla A)" : "Atalho: tecla A"}
        onClick={() => responder("match")}
        disabled={pendente}
      />,
    );
    if (extras && aba !== "analise")
      acoes.push(
        <Acao
          key="depois"
          icone={Clock3}
          rotulo="Ver depois"
          dica="Passa para Em análise"
          onClick={() => mover("analise", `${primeiro} foi para Em análise.`)}
          disabled={pendente}
        />,
      );
    if (estado === "responder")
      acoes.push(
        <Acao
          key="dispensar"
          icone={X}
          rotulo="Dispensar"
          dica="Atalho: tecla D"
          onClick={() => responder("dispensada")}
          disabled={pendente}
        />,
      );
  } else if (noProcesso && extras) {
    // o Contratar é o principal quando não falta a entrevista: sem marcar e já passou
    const contratarPrincipal = !podeChamar && !(entrevista && !passou);
    const contratar = (
      <Acao
        key="contratar"
        principal={contratarPrincipal}
        icone={PartyPopper}
        rotulo="Contratar"
        onClick={() => mover("contratado", `${primeiro} foi contratado.`)}
        disabled={pendente}
      />
    );
    if (chamar) acoes.push(chamar);
    if (contratarPrincipal) acoes.push(contratar);
    acoes.push(...contatos);
    if (!contratarPrincipal) acoes.push(contratar);
    acoes.push(
      <Acao
        key="nao-seguiu"
        icone={X}
        rotulo="Não seguiu"
        dica="Tira do processo (dá para voltar)"
        onClick={() => mover("nao_seguiu", `${primeiro} não segue no processo.`)}
        disabled={pendente}
      />,
    );
  } else if (estado === "match" && extras && aba === "contratados") {
    acoes.push(
      <Acao
        key="contratado"
        icone={PartyPopper}
        cor="text-cerrado-text"
        rotulo="Proposta e vaga"
        dica="Contratado: a proposta e a vaga"
        onClick={() => setFolha(folha === "contratado" ? null : "contratado")}
        expandido={folha === "contratado"}
      />,
      ...contatos,
    );
  } else if (estado === "match" && extras && aba === "nao_seguiu") {
    acoes.push(
      <Acao
        key="voltar"
        icone={Undo2}
        rotulo="Voltar para Em análise"
        onClick={() => mover("analise", `${primeiro} voltou para Em análise.`)}
        disabled={pendente}
      />,
      ...contatos,
    );
  } else if (estado === "match") {
    acoes.push(...contatos);
  } else if (estado === "dispensada") {
    acoes.push(
      <Acao
        key="novos"
        icone={Undo2}
        rotulo="Voltar para Novos"
        onClick={() =>
          iniciar(async () => {
            const r = await chamarAcao(() => responderCurtida(anuncioId, perfilId, "pendente"));
            if (!r.ok) setErro(r.erro);
          })
        }
        disabled={pendente}
      />,
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {acoes.length > 0 && (
        // no celular, a linha fica presa embaixo (acima da barra), no alcance do polegar, enquanto a ficha rola
        <div
          role="group"
          aria-label="O que fazer"
          className="flex gap-1.5 max-md:sticky max-md:bottom-[calc(4rem+env(safe-area-inset-bottom))] max-md:z-10 max-md:-mx-4 max-md:border-t max-md:border-line max-md:bg-surface-200/95 max-md:px-4 max-md:py-2 max-md:backdrop-blur-md"
        >
          {acoes}
        </div>
      )}
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

      {ajuda && <ListaDeAtalhos extras={Boolean(extras)} />}
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

export type ContatoDaFicha = {
  /** o link do WhatsApp, com a mensagem pronta */
  whatsapp: string | null;
  naoLidas: number;
  /** a conversa aparece na própria ficha (o Conversar rola até ela) */
  conversaNaFicha: boolean;
};

/**
 * Um botão da linha de ações da ficha: todos do mesmo tamanho, o ícone em cima e o nome embaixo (até duas linhas). O
 * principal leva o terra; os outros, o creme do fundo.
 */
function Acao({
  icone: Icone,
  rotulo,
  dica,
  principal = false,
  cor = "text-ink-muted",
  selo = 0,
  onClick,
  href,
  externo = false,
  marca,
  disabled = false,
  expandido,
}: {
  icone: LucideIcon;
  rotulo: string;
  dica?: string;
  principal?: boolean;
  cor?: string;
  /** mensagens novas (o número no canto) */
  selo?: number;
  onClick?: () => void;
  href?: string | null;
  externo?: boolean;
  /** o link de contato com o candidato (Admin › Retorno conta o toque) */
  marca?: Record<string, string>;
  disabled?: boolean;
  expandido?: boolean;
}) {
  const classe = `relative flex min-h-[4.5rem] max-w-36 min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-center text-label leading-[1.15] transition-colors disabled:opacity-60 ${
    principal
      ? "bg-terra text-on-terra hover:bg-terra-hover aria-expanded:bg-terra-hover"
      : "bg-surface-100 text-ink hover:bg-surface-300 aria-expanded:bg-surface-300"
  }`;
  const miolo = (
    <>
      <Icone aria-hidden className={`size-5 shrink-0 ${principal ? "" : cor}`} />
      <span className="text-balance">{rotulo}</span>
      {selo > 0 && (
        <span className="absolute top-1 right-1 inline-flex min-w-5 items-center justify-center rounded-pill bg-like px-1.5 text-caption text-on-like">
          {selo}
          <span className="sr-only"> {selo === 1 ? "mensagem nova" : "mensagens novas"}</span>
        </span>
      )}
    </>
  );
  if (href && externo)
    return (
      <a href={href} title={dica} target="_blank" rel="noopener noreferrer" className={classe} {...marca}>
        {miolo}
      </a>
    );
  if (href)
    return (
      <Link href={href} title={dica} className={classe}>
        {miolo}
      </Link>
    );
  return (
    <button
      type="button"
      title={dica}
      onClick={onClick}
      disabled={disabled}
      aria-expanded={expandido}
      className={classe}
    >
      {miolo}
    </button>
  );
}

/** Os atalhos do teclado da ficha (a tecla ? mostra no alto; o "Atalhos do teclado" do pé, embaixo). */
function ListaDeAtalhos({ extras }: { extras: boolean }) {
  return (
    <ul
      aria-label="Atalhos de teclado"
      className="grid basis-full grid-cols-2 gap-x-6 gap-y-1 rounded-md bg-surface-300 px-4 py-3 text-body-sm"
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
  );
}

/** "Atalhos do teclado", no pé da ficha (só no computador). */
export function BotaoAtalhos({ extras }: { extras: boolean }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="hidden min-h-10 items-center gap-1.5 text-label text-ink-muted underline-offset-2 hover:text-ink hover:underline lg:inline-flex"
      >
        <Keyboard aria-hidden className="size-4" />
        Atalhos do teclado
      </button>
      {aberto && <ListaDeAtalhos extras={extras} />}
    </>
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
