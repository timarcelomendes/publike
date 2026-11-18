"use client";

import { useId, useState } from "react";
import { salvarConviteDoPacote } from "@/lib/acoes/admin-impulsos";
import { formatarDataHora, plural } from "@/lib/formato";
import { useAcao } from "../ui/usar-acao";

// O convite do pacote, no alto de Admin › Impulsos (migração 20270717120000; 18/11/2026, claude/plano-ritmo-do-pacote.md,
// pedido do Marcelo: "Mais ritmo antes de vender" e "Pode ligar às 8h"). Ligado, o Publike convida para a vaga de cada
// pacote no ar quem tem currículo em Talentos e combina com ela, do mais perto para o mais longe, até o máximo por
// pacote. A curtida de quem foi convidado conta no pacote.

export type PacoteComConvite = {
  impulso_id: string;
  titulo: string;
  cliente: string | null;
  no_ar: boolean;
  alvo: number;
  entregues: number;
  convidados: number;
  curtiram: number;
  /** o convite pelo WhatsApp (migração 20270718120000): quantos saíram e, desses, quantos curtiram */
  whatsapp?: number;
  whatsapp_curtiram?: number;
};

export function ChaveDoConvite({
  ligado,
  maximo,
  horaInicio,
  horaFim,
  rodouEm,
  pacotes,
}: {
  ligado: boolean;
  /** até quantas pessoas cada pacote convida */
  maximo: number;
  horaInicio: number;
  horaFim: number;
  /** a última rodada do robô */
  rodouEm: string | null;
  /** os pacotes no ar e os que terminaram nos últimos 30 dias depois de convidar */
  pacotes: PacoteComConvite[];
}) {
  const id = useId();
  const { rodar, pendente, mensagem } = useAcao();
  const [novoMaximo, setNovoMaximo] = useState(String(maximo));
  const horas = `das ${horaInicio}h às ${horaFim}h`;
  const valor = Number(novoMaximo);
  const maximoValido = novoMaximo.trim() !== "" && Number.isInteger(valor) && valor >= 0 && valor <= 200;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span id={id} className="text-label">
          Convite do pacote
        </span>
        <span className="flex items-center gap-2.5">
          <span className="text-body-sm text-ink-muted" aria-hidden>
            {pendente ? (ligado ? "Desligando…" : "Ligando…") : ligado ? "Ligado" : "Desligado"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={ligado}
            aria-labelledby={id}
            aria-describedby={`${id}-texto`}
            disabled={pendente}
            onClick={() => rodar(() => salvarConviteDoPacote(!ligado, null))}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-pill border transition-colors disabled:opacity-50 ${
              ligado ? "border-transparent bg-cerrado" : "border-line-strong bg-surface-300"
            }`}
          >
            <span
              aria-hidden
              className={`inline-block size-5 rounded-pill bg-surface-100 shadow-card transition-transform ${
                ligado ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </span>
      </div>
      <p id={`${id}-texto`} className="max-w-3xl text-body-sm text-ink-muted">
        {ligado
          ? `Ligado: ${horas}, a cada 15 minutos, o Publike convida para a vaga de cada pacote no destaque até ${plural(
              maximo,
              "pessoa",
              "pessoas",
            )} que combinam com ela (70% ou mais), do mais perto para o mais longe, por sino, celular e e-mail. A curtida de quem foi convidado conta no pacote. ${
              rodouEm ? `Última rodada: ${formatarDataHora(rodouEm)}.` : "A primeira rodada sai no próximo horário."
            }`
          : `Desligado: os pacotes contam só quem chega pelo quadro. Ligado, o Publike convida ${horas} quem combina com a vaga de cada pacote, até ${plural(
              maximo,
              "pessoa",
              "pessoas",
            )} por pacote.`}{" "}
        As proteções do convite valem: no máximo 2 convites automáticos por pessoa por semana, e quem desligou os
        automáticos em Preferências não recebe.
      </p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (maximoValido) rodar(() => salvarConviteDoPacote(ligado, valor));
        }}
      >
        <label className="flex flex-col gap-1 text-body-sm">
          <span className="text-label">Máximo por pacote</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={200}
            step={1}
            value={novoMaximo}
            onChange={(e) => setNovoMaximo(e.target.value)}
            className="h-10 w-28 rounded-md border border-line-strong bg-surface-100 px-3 tabular-nums"
          />
        </label>
        <button
          type="submit"
          disabled={pendente || !maximoValido || valor === maximo}
          className="h-10 rounded-md border border-line-strong bg-surface-100 px-4 text-body-sm font-semibold disabled:opacity-50"
        >
          Salvar o máximo
        </button>
      </form>
      {pacotes.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface-100">
          {pacotes.map((p) => (
            <li key={p.impulso_id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2">
              <span className="min-w-0 text-body-sm">
                <span className="font-semibold">{p.titulo}</span>
                {p.cliente ? <span className="text-ink-muted"> · {p.cliente}</span> : null}
                {!p.no_ar && <span className="text-ink-muted"> · terminou</span>}
              </span>
              <span className="text-body-sm tabular-nums text-ink-muted">
                {plural(p.convidados, "convidado", "convidados")}, {p.curtiram === 1 ? "1 curtiu" : `${p.curtiram} curtiram`}
                {p.whatsapp ? ` · ${p.whatsapp} pelo WhatsApp, ${p.whatsapp_curtiram ?? 0} curtiram` : ""} ·{" "}
                {Math.min(p.entregues, p.alvo)} de {p.alvo} no pacote
              </span>
            </li>
          ))}
        </ul>
      )}
      {mensagem}
    </div>
  );
}
