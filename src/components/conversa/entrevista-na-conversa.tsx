"use client";

import { CalendarCheck, CalendarClock, CalendarX2, Clock, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { eventoDaEntrevista } from "@/lib/agenda";
import { SITE_URL } from "@/lib/config";
import { horarioDaEntrevista, type EntrevistaNaMensagem } from "@/lib/entrevista-na-conversa";
import { dataDaEntrevista } from "@/lib/recrutamento";
import { BotoesAgenda } from "../agenda/botoes-agenda";

export type RespostaDaEntrevista = { resposta: "confirmada" | "remarcar" | "escolher"; quando?: string };

/** Uma linha da situação, com o ícone. `fraca`: a espera, em cinza. */
function Linha({
  icone: Icone,
  escuro,
  fraca = false,
  children,
}: {
  icone: LucideIcon;
  escuro: boolean;
  fraca?: boolean;
  children: ReactNode;
}) {
  const cor = escuro ? (fraca ? "text-surface-100/70" : "text-surface-100") : fraca ? "text-ink-muted" : "text-ink";
  return (
    <span className={`flex items-center gap-1.5 ${fraca ? "text-caption" : "text-label"} ${cor}`}>
      <Icone aria-hidden className="size-4 shrink-0" />
      {children}
    </span>
  );
}

function Botao({
  cheio = false,
  icone: Icone,
  desligado,
  onClick,
  children,
}: {
  cheio?: boolean;
  icone?: LucideIcon;
  desligado: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={desligado}
      onClick={onClick}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-pill px-3.5 text-label transition-colors disabled:opacity-60 ${
        cheio
          ? "bg-ink text-surface-100 hover:bg-ink/85"
          : "border border-line-strong bg-surface-100 text-ink hover:border-ink"
      }`}
    >
      {Icone && <Icone aria-hidden className="size-4 shrink-0" />}
      {children}
    </button>
  );
}

/**
 * A entrevista dentro da mensagem (claude/plano-entrevista-na-conversa.md). O candidato responde com um toque, como
 * na página da vaga: "Confirmar presença" e "Pedir outro horário", ou um botão por horário e "Nenhum serve"; depois,
 * a situação e o "Adicionar à agenda". Quem marcou vê a situação. A mensagem de antes de remarcar, a entrevista
 * cancelada ou a que já passou ficam sem botões.
 */
export function EntrevistaNaConversa({
  e,
  candidato,
  nome,
  empresa,
  anuncioId,
  ocupado,
  responder,
}: {
  e: EntrevistaNaMensagem;
  /** quem recebeu a mensagem (o candidato): vê os botões */
  candidato: boolean;
  /** o primeiro nome da outra pessoa da conversa */
  nome: string;
  /** para o evento da agenda: quem marcou */
  empresa: string;
  anuncioId: string | null;
  ocupado: boolean;
  responder: (r: RespostaDaEntrevista) => void;
}) {
  // a hora de abrir a conversa: a entrevista que já passou (há mais de uma hora) fica sem botões
  const [agora] = useState(() => Date.now());
  const escuro = !candidato;
  const horario = horarioDaEntrevista(e);
  const passou = horario !== null && new Date(horario).getTime() < agora - 60 * 60 * 1000;
  const caixa = (conteudo: ReactNode) => (
    <span className="mt-2 flex flex-col items-start gap-2 whitespace-normal">{conteudo}</span>
  );

  if (e.estado === "substituida") {
    return caixa(
      <Linha icone={CalendarClock} escuro={escuro} fraca>
        Remarcada: vale a mensagem mais nova.
      </Linha>,
    );
  }
  if (e.estado === "cancelada") {
    return caixa(
      <Linha icone={CalendarX2} escuro={escuro}>
        Entrevista cancelada.
      </Linha>,
    );
  }
  if (e.estado === "encerrada") return null;

  // quem marcou: a situação
  if (!candidato) {
    if (e.estado === "aberta" && passou) return null;
    const feita = e.estado === "confirmada" || e.estado === "escolhido";
    const texto =
      e.estado === "confirmada"
        ? `${nome} confirmou a presença.`
        : e.estado === "escolhido" && e.escolhido
          ? `${nome} escolheu ${dataDaEntrevista(e.escolhido)}.`
          : e.estado === "remarcar"
            ? e.tipo === "horarios"
              ? `${nome} disse que nenhum horário serve.`
              : `${nome} pediu outro horário.`
            : e.tipo === "horarios"
              ? `Esperando ${nome} escolher um horário.`
              : `Esperando a confirmação de ${nome}.`;
    return caixa(
      <Linha
        icone={feita ? CalendarCheck : e.estado === "remarcar" ? CalendarX2 : Clock}
        escuro
        fraca={e.estado === "aberta"}
      >
        {texto}
      </Linha>,
    );
  }

  // o candidato: confirmada ou escolhida, com a agenda e o "Pedir outro horário"
  if (e.estado === "confirmada" || e.estado === "escolhido") {
    return caixa(
      <>
        <Linha icone={CalendarCheck} escuro={false}>
          {e.tipo === "horarios" && e.escolhido
            ? `Você escolheu ${dataDaEntrevista(e.escolhido)}.`
            : "Presença confirmada."}
        </Linha>
        {horario && !passou && (
          <BotoesAgenda
            evento={eventoDaEntrevista(
              {
                id: e.id,
                quando: horario,
                duracao_min: e.duracao,
                formato: e.formato,
                local: e.local,
                obs: e.obs,
                situacao: "confirmada",
              },
              { vaga: e.vaga, empresa, para: "candidato", url: anuncioId ? `${SITE_URL}/anuncio/${anuncioId}` : null },
            )}
          />
        )}
        {!passou && (
          <Botao desligado={ocupado} onClick={() => responder({ resposta: "remarcar" })}>
            Pedir outro horário
          </Botao>
        )}
      </>,
    );
  }
  if (e.estado === "remarcar") {
    return caixa(
      <>
        <Linha icone={CalendarX2} escuro={false}>
          {e.tipo === "horarios" ? "Você pediu outros horários." : "Você pediu outro horário."}
        </Linha>
        {e.tipo === "marcada" && !passou && (
          <Botao cheio icone={CalendarCheck} desligado={ocupado} onClick={() => responder({ resposta: "confirmada" })}>
            Confirmar presença
          </Botao>
        )}
      </>,
    );
  }

  // aberta: os botões
  if (passou) return null;
  if (e.tipo === "horarios") {
    const futuras = e.opcoes.filter((o) => new Date(o).getTime() > agora);
    return (
      <span
        role="group"
        aria-label="Escolha o horário da entrevista"
        className="mt-2 flex flex-col items-start gap-2 whitespace-normal"
      >
        {futuras.length ? (
          <span className="flex flex-wrap gap-2">
            {futuras.map((o) => (
              <Botao
                key={o}
                icone={CalendarCheck}
                desligado={ocupado}
                onClick={() => responder({ resposta: "escolher", quando: o })}
              >
                {dataDaEntrevista(o)}
              </Botao>
            ))}
          </span>
        ) : (
          <span className="text-body-sm text-ink-muted">Os horários já passaram. Peça outros.</span>
        )}
        <Botao desligado={ocupado} onClick={() => responder({ resposta: "remarcar" })}>
          Nenhum serve: pedir outros
        </Botao>
      </span>
    );
  }
  return (
    <span role="group" aria-label="Responda à entrevista" className="mt-2 flex flex-wrap gap-2 whitespace-normal">
      <Botao cheio icone={CalendarCheck} desligado={ocupado} onClick={() => responder({ resposta: "confirmada" })}>
        Confirmar presença
      </Botao>
      <Botao desligado={ocupado} onClick={() => responder({ resposta: "remarcar" })}>
        Pedir outro horário
      </Botao>
    </span>
  );
}
