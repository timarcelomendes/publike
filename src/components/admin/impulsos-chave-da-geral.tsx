"use client";

import { useId } from "react";
import { ligarCampanhaGeral } from "@/lib/acoes/admin-impulsos";
import { formatarDataHora, formatarMoeda, plural } from "@/lib/formato";
import { useAcao } from "../ui/usar-acao";

// A chave da campanha geral, no alto de Admin › Impulsos (migração 20270520120000; 14/11/2026, pedido do Marcelo:
// "deixe uma chave de liga / desliga no admin"). Ligada, o robô deixa o orçamento da campanha geral na base mais a verba
// de cada pacote no ar, até o máximo; desligada, devolve à base uma vez, se tinha subido, e não mexe mais.

const reais = (v: number) => formatarMoeda(Math.round(v * 100) / 100);

export function ChaveDaGeral({
  ligada,
  pronta,
  alvo,
  base,
  maximo,
  porPacote,
  noAr,
  ultima,
  voltando,
}: {
  ligada: boolean;
  /** a conta e o número da campanha estão nas Regras */
  pronta: boolean;
  /** o orçamento com a chave ligada, agora: a base mais a verba dos pacotes no ar, até o máximo */
  alvo: number | null;
  base: number;
  maximo: number;
  /** quanto cada pacote no ar soma por dia */
  porPacote: number;
  /** quantos pacotes estão no ar */
  noAr: number;
  /** a última vez que o robô acertou a campanha, o valor e o último erro */
  ultima: { em: string | null; valor: number | null; erro: string | null; erro_em: string | null };
  /** desligada, a campanha ainda volta para a base na próxima volta do robô */
  voltando: boolean;
}) {
  const id = useId();
  const { rodar, pendente, mensagem } = useAcao();
  const conta = `${reais(base)} de base mais ${reais(porPacote)} por pacote no destaque (${
    noAr === 0 ? "nenhum agora" : plural(noAr, "pacote", "pacotes")
  }), no máximo ${reais(maximo)}`;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span id={id} className="text-label">
          Campanha geral no automático
        </span>
        <span className="flex items-center gap-2.5">
          <span className="text-body-sm text-ink-muted" aria-hidden>
            {pendente ? (ligada ? "Desligando…" : "Ligando…") : ligada ? "Ligada" : "Desligada"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={ligada}
            aria-labelledby={id}
            aria-describedby={`${id}-texto`}
            disabled={pendente || (!ligada && !pronta)}
            onClick={() => rodar(() => ligarCampanhaGeral(!ligada))}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-pill border transition-colors disabled:opacity-50 ${
              ligada ? "border-transparent bg-cerrado" : "border-line-strong bg-surface-300"
            }`}
          >
            <span
              aria-hidden
              className={`inline-block size-5 rounded-pill bg-surface-100 shadow-card transition-transform ${
                ligada ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </span>
      </div>
      <p id={`${id}-texto`} className="max-w-3xl text-body-sm text-ink-muted">
        {!pronta
          ? "Falta dizer a conta do Google Ads e o número da campanha geral, em Regras › Pacote de candidatos."
          : ligada
            ? `Ligada: o robô deixa a campanha geral em ${alvo === null ? "—" : reais(alvo)} por dia agora, ${conta}. ` +
              (ultima.em
                ? `Acertou em ${formatarDataHora(ultima.em)} para ${reais(Number(ultima.valor ?? 0))} por dia.`
                : "Ele acerta em poucos minutos.")
            : `Desligada: o robô não mexe no orçamento da campanha geral${
                voltando ? `, só a devolve para ${reais(base)} por dia, a base, em poucos minutos` : ""
              }. Ligada, ela iria para ${alvo === null ? "—" : reais(alvo)} por dia agora, ${conta}.`}
      </p>
      {ultima.erro && (
        <p className="text-body-sm break-words text-danger">
          {ultima.erro_em ? `${formatarDataHora(ultima.erro_em)}: ` : ""}
          {ultima.erro}
        </p>
      )}
      {mensagem}
    </div>
  );
}
