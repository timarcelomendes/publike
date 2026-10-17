"use client";

import { ChevronLeft, ChevronRight, Heart, Keyboard, Sparkles, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { responderCurtida } from "@/lib/acoes/curtidas";
import { resumirCandidatoComIA } from "@/lib/acoes/talentos";
import type { ResumoCandidato } from "@/lib/ia/tarefas";
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

/** Uma tecla de atalho no botão (some no celular). */
function Tecla({ children }: { children: string }) {
  return (
    <kbd className="hidden min-w-5 rounded-sm border border-line-strong px-1 text-center font-sans text-caption leading-5 text-ink-muted lg:inline-block">
      {children}
    </kbd>
  );
}

const digitando = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return (
    e.metaKey ||
    e.ctrlKey ||
    e.altKey ||
    Boolean(t?.closest("input, textarea, select, [contenteditable=true], dialog[open]"))
  );
};

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
}: {
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
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [ajuda, setAjuda] = useState(false);
  const desfazer = useUltima();
  const primeiro = nome.split(" ")[0];

  function responder(decisao: "match" | "dispensada") {
    setErro(null);
    iniciar(async () => {
      const r = await responderCurtida(anuncioId, perfilId, decisao);
      if (!r.ok) {
        if (r.ir) router.push(r.ir);
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
              : `Deu match com ${primeiro}! O contato está liberado.`,
      });
      router.push(depois, { scroll: false });
    });
  }

  function voltar() {
    const u = ultima;
    if (!u?.desfaz) return;
    iniciar(async () => {
      const r = await responderCurtida(u.anuncioId, u.perfilId, "pendente");
      if (!r.ok) return setErro(r.erro);
      guardar(null);
      router.push(`/painel/caixa?aba=responder&c=${u.anuncioId}:${u.perfilId}`, { scroll: false });
    });
  }

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (digitando(e) || pendente) return;
      const k = e.key.toLowerCase();
      // a navegação conta como pendente: tecla repetida não pula ninguém
      if (k === "j" && proximo) iniciar(() => router.push(proximo, { scroll: false }));
      else if (k === "k" && anterior) iniciar(() => router.push(anterior, { scroll: false }));
      else if (k === "a" && (estado === "responder" || estado === "desfeito")) responder("match");
      else if (k === "d" && estado === "responder") responder("dispensada");
      else if (k === "z" && ultima?.desfaz) voltar();
      else if (k === "c" && conversa) router.push(conversa);
      else if (k === "e" && estado === "match") {
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {(estado === "responder" || estado === "desfeito") && (
          <button
            type="button"
            disabled={pendente}
            onClick={() => responder("match")}
            className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-line-strong bg-surface-200 px-4 text-label text-ink transition-colors hover:bg-like-soft hover:text-like-text disabled:opacity-60"
          >
            <Heart aria-hidden className="size-[18px] text-like" />
            {estado === "desfeito" ? "Dar match de novo" : "Aceitar"}
            <Tecla>A</Tecla>
          </button>
        )}
        {estado === "responder" && (
          <button
            type="button"
            disabled={pendente}
            onClick={() => responder("dispensada")}
            className="inline-flex min-h-11 items-center gap-2 rounded-pill px-4 text-label text-ink transition-colors hover:bg-surface-300 disabled:opacity-60"
          >
            <X aria-hidden className="size-[18px]" />
            Dispensar
            <Tecla>D</Tecla>
          </button>
        )}
        {estado === "dispensada" && (
          <button
            type="button"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await responderCurtida(anuncioId, perfilId, "pendente");
                if (!r.ok) setErro(r.erro);
              })
            }
            className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-line-strong px-4 text-label hover:bg-surface-300 disabled:opacity-60"
          >
            <Undo2 aria-hidden className="size-[18px]" />
            Voltar para Para responder
          </button>
        )}
        <span className="ml-auto flex items-center gap-1">
          <NavLink href={anterior} rotulo="Anterior" tecla="K">
            <ChevronLeft aria-hidden className="size-5" />
          </NavLink>
          <NavLink href={proximo} rotulo="Próximo" tecla="J">
            <ChevronRight aria-hidden className="size-5" />
          </NavLink>
          <button
            type="button"
            onClick={() => setAjuda((a) => !a)}
            aria-expanded={ajuda}
            aria-label="Atalhos de teclado"
            className="hidden size-10 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink lg:inline-flex"
          >
            <Keyboard aria-hidden className="size-5" />
          </button>
        </span>
      </div>
      {semCurriculo && (estado === "responder" || estado === "desfeito") && (
        <p className="text-body-sm text-ink-muted">
          A vaga pede currículo e {semCurriculo} ainda não mandou. Aceitando, {semCurriculo} recebe o pedido e o match
          sai quando o currículo chegar.
        </p>
      )}
      {ajuda && (
        <ul
          aria-label="Atalhos de teclado"
          className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md bg-surface-300 px-4 py-3 text-body-sm sm:grid-cols-4"
        >
          {[
            ["A", "aceitar"],
            ["D", "dispensar"],
            ["J", "próximo"],
            ["K", "anterior"],
            ["E", "entrevista"],
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
};

/** A entrevista na ficha: a marcada (com remarcar e cancelar) ou o formulário para marcar. */
export function EntrevistaDaFicha({
  anuncioId,
  perfilId,
  nome,
  entrevista,
  endereco,
}: {
  anuncioId: string;
  perfilId: string;
  nome: string;
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
        <EntrevistaMarcada entrevista={entrevista} aoRemarcar={() => (setMarcou(false), setMarcando(true))} />
      </div>
    );
  }
  return (
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
              const r = await resumirCandidatoComIA(anuncioId, perfilId);
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
