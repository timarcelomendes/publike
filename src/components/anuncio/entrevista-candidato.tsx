"use client";

import { CalendarCheck, CalendarClock } from "lucide-react";
import { useState } from "react";
import { escolherHorario, responderEntrevista } from "@/lib/acoes/recrutamento";
import { eventoDaEntrevista } from "@/lib/agenda";
import { SITE_URL } from "@/lib/config";
import {
  dataDaEntrevista,
  ENTREVISTA_ABERTA,
  FORMATOS_ENTREVISTA,
  SITUACOES_ENTREVISTA,
  type FormatoEntrevista,
} from "@/lib/recrutamento";
import { BotoesAgenda } from "../agenda/botoes-agenda";
import { Selo } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

export type EntrevistaDoCandidato = {
  id: string;
  quando: string;
  formato: string;
  local: string | null;
  obs: string | null;
  situacao: string;
  duracao_min?: number | null;
  atualizado_em?: string | null;
  /** os horários para escolher (situação `escolher`) */
  opcoes?: string[] | null;
};

/**
 * Para quem se candidatou: a entrevista marcada, com confirmar presença ou pedir para remarcar. Com horários para
 * escolher, um botão por horário (escolher já confirma) e "Nenhum serve".
 */
export function EntrevistaDoCandidato({
  e,
  vaga,
  empresa,
  anuncioId,
}: {
  e: EntrevistaDoCandidato;
  /** para o evento na agenda: o título da vaga, quem publicou e a vaga no Publike */
  vaga: string;
  empresa?: string;
  anuncioId: string;
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const aberta = ENTREVISTA_ABERTA.includes(e.situacao);
  const escolher = e.situacao === "escolher";
  // a hora de abrir a página: os horários que já passaram somem
  const [agora] = useState(() => Date.now());
  const opcoes = (e.opcoes ?? []).filter((o) => new Date(o).getTime() > agora);
  const situacao = SITUACOES_ENTREVISTA[e.situacao] ?? SITUACOES_ENTREVISTA.marcada;
  const formato = FORMATOS_ENTREVISTA[e.formato as FormatoEntrevista];
  const video = e.formato === "video" && e.local?.startsWith("https://");
  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface-200 p-3 text-ink">
      <p className="flex flex-wrap items-center gap-2 text-label">
        <CalendarClock aria-hidden className="size-4 shrink-0 text-ink-muted" />
        {escolher ? "Entrevista: escolha o horário" : `Entrevista: ${dataDaEntrevista(e.quando)}`}
        <Selo variante={e.situacao === "marcada" || escolher ? "aviso" : situacao.tom}>
          {e.situacao === "marcada"
            ? "Confirme"
            : escolher
              ? "Escolha"
              : e.situacao === "remarcar"
                ? "Remarcação pedida"
                : situacao.nome}
        </Selo>
      </p>
      <p className="text-body-sm">
        {formato?.nome}
        {e.local && !video ? `: ${e.local}` : ""}
        {video && e.local && (
          <>
            :{" "}
            <a href={e.local} target="_blank" rel="noopener noreferrer" className="underline">
              entrar na chamada
            </a>
          </>
        )}
      </p>
      {e.obs && <p className="text-body-sm text-ink-muted">{e.obs}</p>}
      {escolher && (
        <div className="flex flex-col gap-2">
          <p className="text-body-sm">Toque no horário que fica melhor para você. A entrevista já fica confirmada.</p>
          {opcoes.length ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Horários para escolher">
              {opcoes.map((o) => (
                <Botao key={o} tamanho="sm" disabled={pendente} onClick={() => rodar(() => escolherHorario(e.id, o))}>
                  <CalendarCheck aria-hidden />
                  {dataDaEntrevista(o)}
                </Botao>
              ))}
            </div>
          ) : (
            <p className="text-body-sm text-ink-muted">Os horários já passaram. Peça outros.</p>
          )}
          <Botao
            tamanho="sm"
            variante="fantasma"
            className="self-start"
            disabled={pendente}
            onClick={() => rodar(() => responderEntrevista(e.id, "remarcar"))}
          >
            Nenhum serve: pedir outros
          </Botao>
        </div>
      )}
      {aberta && !escolher && (
        <BotoesAgenda
          evento={eventoDaEntrevista(e, { vaga, empresa, para: "candidato", url: `${SITE_URL}/anuncio/${anuncioId}` })}
        />
      )}
      {aberta && !escolher && (
        <div className="flex flex-wrap gap-2">
          {e.situacao !== "confirmada" && (
            <Botao
              tamanho="sm"
              variante="primario"
              disabled={pendente}
              onClick={() => rodar(() => responderEntrevista(e.id, "confirmada"))}
            >
              <CalendarCheck aria-hidden />
              Confirmar presença
            </Botao>
          )}
          {e.situacao !== "remarcar" && (
            <Botao
              tamanho="sm"
              variante="secundario"
              disabled={pendente}
              onClick={() => rodar(() => responderEntrevista(e.id, "remarcar"))}
            >
              Pedir outro horário
            </Botao>
          )}
        </div>
      )}
      {mensagem}
    </div>
  );
}
