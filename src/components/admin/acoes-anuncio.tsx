"use client";

import { CalendarClock, CircleCheckBig, Pencil, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { excluirAnuncioDeVez } from "@/lib/acoes/admin";
import { agendarRemocao, cancelarRemocao, moderarAnuncio } from "@/lib/acoes/moderacao";
import { Botao, BotaoLink } from "../ui/botao";
import { classesEntrada } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

const MOTIVOS_PRONTOS = [
  "Cobra dinheiro de quem procura trabalho.",
  "Tem sinais de golpe.",
  "Tem exigência discriminatória.",
  "Não é vaga nem serviço (propaganda ou spam).",
  "Informação falsa ou enganosa.",
];

/** Remover (com motivo para quem publicou) ou liberar. Usado na ficha e na fila de denúncias. */
export function AcoesModeracaoAnuncio({
  anuncioId,
  status,
  denunciasAbertas = 0,
  iaFalhou = false,
  mostrarEditar = true,
}: {
  anuncioId: string;
  status: string;
  denunciasAbertas?: number;
  /** A IA não conseguiu revisar: uma pessoa confere e marca como revisado. */
  iaFalhou?: boolean;
  mostrarEditar?: boolean;
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const [removendo, setRemovendo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const comModeracao = status === "em_analise" || status === "removido";

  return (
    <div className="flex flex-col gap-3">
      {removendo ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={`motivo-${anuncioId}`} className="text-label">
            Por que remover? <span className="font-normal text-ink-muted">(quem publicou recebe este motivo)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {MOTIVOS_PRONTOS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMotivo(m)}
                className="min-h-9 rounded-pill border border-line bg-surface-300 px-3 text-body-sm hover:border-line-strong"
              >
                {m}
              </button>
            ))}
          </div>
          <textarea
            id={`motivo-${anuncioId}`}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Escreva o motivo ou escolha um acima."
            className={`${classesEntrada} resize-y`}
          />
          <div className="flex flex-wrap gap-2">
            <Botao
              variante="perigo"
              tamanho="sm"
              disabled={pendente}
              onClick={() => rodar(() => moderarAnuncio(anuncioId, "remover", motivo), (r) => r.ok && setRemovendo(false))}
            >
              <XCircle aria-hidden />
              {pendente ? "Removendo…" : "Remover anúncio"}
            </Botao>
            <Botao tamanho="sm" variante="fantasma" onClick={() => setRemovendo(false)}>
              Cancelar
            </Botao>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {status !== "removido" && (
            <Botao variante="perigo" tamanho="sm" disabled={pendente} onClick={() => setRemovendo(true)}>
              <XCircle aria-hidden />
              Remover
            </Botao>
          )}
          {comModeracao && (
            <Botao tamanho="sm" disabled={pendente} onClick={() => rodar(() => moderarAnuncio(anuncioId, "liberar"))}>
              <CircleCheckBig aria-hidden />
              {status === "removido" ? "Pôr de volta no ar" : "Está tudo certo, liberar"}
            </Botao>
          )}
          {!comModeracao && (denunciasAbertas > 0 || iaFalhou) && (
            <Botao
              tamanho="sm"
              variante="fantasma"
              disabled={pendente}
              onClick={() => rodar(() => moderarAnuncio(anuncioId, "liberar"))}
              title={
                iaFalhou
                  ? "Marca o anúncio como revisado e fecha as denúncias abertas"
                  : "Fecha as denúncias abertas sem mexer no anúncio"
              }
            >
              <CircleCheckBig aria-hidden />
              {iaFalhou ? "Está tudo certo" : "Dispensar denúncias"}
            </Botao>
          )}
          {mostrarEditar && (
            <BotaoLink tamanho="sm" variante="fantasma" href={`/admin/anuncios/${anuncioId}/editar`}>
              <Pencil aria-hidden />
              Corrigir texto
            </BotaoLink>
          )}
        </div>
      )}
      {mensagem}
    </div>
  );
}

/** Só o admin: apagar de vez (spam, teste). */
export function ApagarAnuncioDeVez({ anuncioId }: { anuncioId: string }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [motivo, setMotivo] = useState("");
  return (
    <details className="rounded-md border border-line px-4 py-3">
      <summary className="cursor-pointer text-label text-ink-muted">Apagar de vez</summary>
      <div className="mt-3 flex flex-col gap-2">
        <p className="text-body-sm text-ink-muted">
          Some com curtidas, matches e denúncias, sem aviso para quem publicou. Para quem quebrou as regras, prefira
          remover: assim a pessoa fica sabendo do motivo.
        </p>
        <input
          aria-label="Motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={300}
          placeholder="Motivo (fica no registro da equipe)"
          className={classesEntrada}
        />
        <div className="flex flex-col items-start gap-2">
          <Botao variante="perigo" tamanho="sm" disabled={pendente} onClick={() => rodar(() => excluirAnuncioDeVez(anuncioId, motivo))}>
            <Trash2 aria-hidden />
            {pendente ? "Apagando…" : "Apagar o anúncio de vez"}
          </Botao>
          {mensagem}
        </div>
      </div>
    </details>
  );
}

export type RemocaoAgendada = {
  remover_em: string;
  situacao: "agendada" | "feita" | "respondeu" | "cancelada";
  so_sem_resposta: boolean;
  esperando: number;
  resolvida_em: string | null;
};

const horaCurta = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/**
 * A remoção agendada (migração 20270525120000; 14/11/2026, Marcelo: "agendar remoçao, em 7h, 3h e 24h"): sai do ar na
 * hora marcada, e quem publicou recebe o aviso agora. Com "só se não responder", fica no ar se ninguém mais esperar.
 */
export function AgendarRemocao({ anuncioId, agendada }: { anuncioId: string; agendada: RemocaoAgendada | null }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [soSemResposta, setSoSemResposta] = useState(true);
  const [motivo, setMotivo] = useState("Os candidatos ficaram sem resposta.");
  if (agendada?.situacao === "agendada") {
    return (
      <div className="flex flex-col gap-2 rounded-md bg-terra-soft p-3 text-body-sm">
        <p>
          <CalendarClock aria-hidden className="mr-1 inline size-4 align-[-3px]" />
          Sai do ar {horaCurta(agendada.remover_em)}
          {agendada.so_sem_resposta
            ? `, se os candidatos continuarem sem resposta (${agendada.esperando === 1 ? "1 esperando" : `${agendada.esperando} esperando`} agora).`
            : "."}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Botao tamanho="sm" variante="fantasma" disabled={pendente} onClick={() => rodar(() => cancelarRemocao(anuncioId))}>
            Cancelar a remoção
          </Botao>
          {mensagem}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {agendada && agendada.resolvida_em && agendada.situacao !== "cancelada" && (
        <p className="text-body-sm text-ink-muted">
          {agendada.situacao === "feita"
            ? `Saiu do ar pela remoção agendada ${horaCurta(agendada.resolvida_em)}.`
            : `A remoção agendada não aconteceu: os candidatos foram respondidos (${horaCurta(agendada.resolvida_em)}).`}
        </p>
      )}
      <p className="text-label">Agendar a remoção</p>
      <input
        aria-label="Motivo para quem publicou"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        maxLength={500}
        className={classesEntrada}
      />
      <label className="flex items-center gap-2 text-body-sm">
        <input type="checkbox" checked={soSemResposta} onChange={(e) => setSoSemResposta(e.target.checked)} className="size-4" />
        Só se os candidatos continuarem sem resposta
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {[3, 7, 24, 72, 168].map((h) => (
          <Botao
            key={h}
            tamanho="sm"
            disabled={pendente}
            onClick={() => rodar(() => agendarRemocao(anuncioId, h, motivo, soSemResposta))}
          >
            <CalendarClock aria-hidden />
            {h < 72 ? `Em ${h} h` : `Em ${h / 24} dias`}
          </Botao>
        ))}
      </div>
      <p className="text-body-sm text-ink-muted">Quem publicou recebe o aviso agora, na conversa, com a hora.</p>
      {mensagem}
    </div>
  );
}
