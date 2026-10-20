"use client";

import { CalendarCheck, CalendarClock } from "lucide-react";
import { responderEntrevista } from "@/lib/acoes/recrutamento";
import { eventoDaEntrevista } from "@/lib/agenda";
import { SITE_URL } from "@/lib/config";
import {
  dataDaEntrevista,
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
};

/** Para quem se candidatou: a entrevista marcada, com confirmar presença ou pedir para remarcar. */
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
  const aberta = ["marcada", "confirmada", "remarcar"].includes(e.situacao);
  const situacao = SITUACOES_ENTREVISTA[e.situacao] ?? SITUACOES_ENTREVISTA.marcada;
  const formato = FORMATOS_ENTREVISTA[e.formato as FormatoEntrevista];
  const video = e.formato === "video" && e.local?.startsWith("https://");
  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface-200 p-3 text-ink">
      <p className="flex flex-wrap items-center gap-2 text-label">
        <CalendarClock aria-hidden className="size-4 shrink-0 text-ink-muted" />
        Entrevista: {dataDaEntrevista(e.quando)}
        <Selo variante={e.situacao === "marcada" ? "aviso" : situacao.tom}>
          {e.situacao === "marcada" ? "Confirme" : e.situacao === "remarcar" ? "Remarcação pedida" : situacao.nome}
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
      {aberta && (
        <BotoesAgenda
          evento={eventoDaEntrevista(e, { vaga, empresa, para: "candidato", url: `${SITE_URL}/anuncio/${anuncioId}` })}
        />
      )}
      {aberta && (
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
