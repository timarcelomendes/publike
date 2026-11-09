"use client";

import { MessageCircle, X } from "lucide-react";
import { useId, useRef, useState, useTransition } from "react";
import { Esqueleto } from "@/components/ui/basicos";
import { DicaDeNovidade, usarDica } from "@/components/ui/dica-de-novidade";
import { lerComentariosDaVaga } from "@/lib/acoes/comentarios";
import { contarComentarios, type ComentariosDaVaga as Dados, type ResumoComentarios } from "@/lib/comentarios";
import { ComentariosDaVaga } from "./comentarios";
import { IndicarNaJanela } from "./indicar-por-email";

// Comentar no próprio feed (09/11/2026). Na linha do tempo, embaixo de cada vaga: quantos comentários ela tem, o
// último ("Ana S. Qual o horário de sábado?") e o "Indicar"; um toque abre a conversa ali mesmo, com o campo para
// comentar e as respostas de quem publicou, sem sair do feed. Nos cartões das listas (Vagas, busca), o botão dos
// comentários abre a mesma conversa numa janela por cima da lista.

/** Abrir a conversa conta como usar a novidade: o balão "Novo" sai e não volta (uma vez por visita). */
const usadas = new Set<string>();
function abriuAConversa(chave: "comentarios" | "comentarios-empresa") {
  if (usadas.has(chave)) return;
  usadas.add(chave);
  usarDica(chave);
}

/** A conversa da vaga, lida quando abre (e de novo depois de cada comentário, resposta ou denúncia). */
function useConversa(anuncioId: string) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [agora, setAgora] = useState(0);
  const [falhou, setFalhou] = useState(false);
  const [carregando, iniciar] = useTransition();

  function carregar() {
    iniciar(async () => {
      let lida: Dados | null = null;
      try {
        lida = await lerComentariosDaVaga(anuncioId);
      } catch {
        lida = null;
      }
      setAgora(Date.now());
      // ao ler de novo, se falhar, fica a conversa que já estava na tela
      if (lida) setDados(lida);
      setFalhou(!lida);
    });
  }

  return { dados, agora, falhou, carregando, carregar };
}

type Conversa = ReturnType<typeof useConversa>;

function Conversa({ anuncioId, conversa, aoCurtir }: { anuncioId: string; conversa: Conversa; aoCurtir?: () => void }) {
  const { dados, agora, falhou, carregando, carregar } = conversa;
  if (dados)
    return <ComentariosDaVaga anuncioId={anuncioId} dados={dados} agora={agora} compacto aoMudar={carregar} aoCurtir={aoCurtir} />;
  if (falhou && !carregando)
    return (
      <p role="alert" className="text-body-sm text-ink-muted">
        Não deu para abrir os comentários agora.{" "}
        <button type="button" onClick={carregar} className="font-semibold text-ink underline underline-offset-2">
          Tentar de novo
        </button>
      </p>
    );
  return (
    <div role="status" aria-label="Abrindo os comentários" className="flex flex-col gap-2.5">
      <Esqueleto className="h-[72px] w-full" />
      <div className="flex gap-3">
        <Esqueleto className="size-10 shrink-0 rounded-pill" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Esqueleto className="h-4 w-1/3" />
          <Esqueleto className="h-4 w-4/5" />
        </div>
      </div>
    </div>
  );
}

function rotuloDoTotal(total: number) {
  return total === 0 ? "Comentar" : `${total} ${total === 1 ? "comentário" : "comentários"}`;
}

/**
 * Embaixo da vaga na linha do tempo: o botão dos comentários, o último comentário e o "Indicar". A conversa abre
 * ali mesmo.
 */
export function ComentariosNoFeed({
  anuncioId,
  titulo,
  resumo,
  logado,
  proprio,
  aberta,
}: {
  anuncioId: string;
  titulo: string;
  resumo: ResumoComentarios;
  logado: boolean;
  /** a vaga é da conta: sem o "Indicar", e a barra só aparece quando alguém já comentou (para responder ali) */
  proprio: boolean;
  /** a vaga está no ar (preenchida: os comentários ficam, ninguém escreve, e não dá para indicar) */
  aberta: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const conversa = useConversa(anuncioId);
  const id = useId();
  const total = conversa.dados ? contarComentarios(conversa.dados) : resumo.total;
  const comentarios = total > 0 || (aberta && resumo.ligados && !proprio);
  const indicar = aberta && !proprio;
  if (!comentarios && !indicar) return null;

  function alternar() {
    if (!aberto) {
      conversa.carregar();
      abriuAConversa(proprio ? "comentarios-empresa" : "comentarios");
    }
    setAberto((a) => !a);
  }

  // no celular, o último comentário fica na linha de baixo; no computador, entre os dois botões
  const barra = (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
      {comentarios && (
        <button
          type="button"
          onClick={alternar}
          aria-expanded={aberto}
          aria-controls={`${id}-conversa`}
          className={`col-start-1 row-start-1 inline-flex min-h-9 items-center gap-1.5 justify-self-start rounded-pill border px-3 text-label transition-colors ${
            aberto
              ? "border-ink bg-ink text-surface-100"
              : "border-line-strong bg-surface-200 text-ink hover:bg-surface-300"
          }`}
        >
          <MessageCircle aria-hidden className="size-[18px] shrink-0" />
          {aberto ? "Fechar os comentários" : rotuloDoTotal(total)}
        </button>
      )}
      {comentarios && !aberto && resumo.ultimo && (
        // um toque no último comentário também abre a conversa
        <button
          type="button"
          onClick={alternar}
          className="col-span-3 row-start-2 line-clamp-2 px-1 text-left text-body-sm text-ink-muted hover:text-ink sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:line-clamp-1 sm:px-0"
        >
          <span className="sr-only">Último comentário: </span>
          <b className="font-semibold text-ink">{resumo.ultimo.nome}</b> {resumo.ultimo.texto}
        </button>
      )}
      {indicar && (
        <span className="col-start-3 row-start-1 justify-self-end">
          <IndicarNaJanela anuncioId={anuncioId} titulo={titulo} logado={logado} jeito="barra" />
        </span>
      )}
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-2 px-1">
      {comentarios ? (
        <DicaDeNovidade chave={proprio ? "comentarios-empresa" : "comentarios"} logado={logado}>
          {barra}
        </DicaDeNovidade>
      ) : (
        barra
      )}
      {aberto && (
        <div id={`${id}-conversa`} className="rounded-lg border border-line bg-surface-200 p-3 sm:p-4">
          <Conversa anuncioId={anuncioId} conversa={conversa} />
        </div>
      )}
    </div>
  );
}

/**
 * No cartão das listas (Vagas, busca): o botão dos comentários, com o número, abre a conversa numa janela por cima
 * da lista (no celular, uma folha que sobe de baixo).
 */
export function ComentariosNaJanela({
  anuncioId,
  titulo,
  resumo,
  pequeno = false,
}: {
  anuncioId: string;
  titulo: string;
  resumo: ResumoComentarios;
  pequeno?: boolean;
}) {
  const janela = useRef<HTMLDialogElement>(null);
  const conversa = useConversa(anuncioId);
  const id = useId();
  const total = conversa.dados ? contarComentarios(conversa.dados) : resumo.total;
  const rotulo = total === 0 ? "Comentar na vaga" : `${rotuloDoTotal(total)}: ver e comentar`;

  function fechar() {
    janela.current?.close();
  }

  return (
    <>
      <button
        type="button"
        aria-label={rotulo}
        title={rotulo}
        aria-haspopup="dialog"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          conversa.carregar();
          abriuAConversa("comentarios");
          janela.current?.showModal();
        }}
        className={`relative z-10 inline-flex shrink-0 items-center justify-center gap-1 rounded-pill border border-line-strong bg-surface-200 text-label text-ink transition-colors hover:bg-surface-300 ${
          pequeno ? "min-h-9 min-w-9 px-2" : "min-h-11 min-w-11 px-2.5"
        }`}
      >
        <MessageCircle aria-hidden className="size-[18px] shrink-0" />
        {total > 0 && <span className="tabular-nums">{total}</span>}
      </button>
      <dialog
        ref={janela}
        aria-labelledby={`${id}-titulo`}
        // toque fora da janela (no fundo escuro): fecha
        onClick={(e) => {
          if (e.target === e.currentTarget) fechar();
        }}
        className="m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-[22px] border border-line bg-surface-100 p-0 text-ink shadow-raised backdrop:bg-ink/40 sm:m-auto sm:w-[34rem] sm:rounded-[22px] print:hidden"
      >
        <div className="flex flex-col gap-4 px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:p-6">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 id={`${id}-titulo`} className="text-h3">
                Comentários
              </h2>
              <p className="mt-1 text-body-sm break-words text-ink-muted">{titulo}</p>
            </div>
            <button
              type="button"
              onClick={fechar}
              aria-label="Fechar"
              className="-mt-1 -mr-1 grid size-10 shrink-0 place-items-center rounded-pill text-ink-muted hover:bg-surface-300"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <Conversa
            anuncioId={anuncioId}
            conversa={conversa}
            aoCurtir={() => {
              fechar();
              document.getElementById(`anuncio-${anuncioId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          />
        </div>
      </dialog>
    </>
  );
}
