"use client";

import { useState } from "react";
import { ligarConviteAutomatico } from "@/lib/acoes/convite-automatico";
import { Botao, BotaoLink } from "../ui/botao";
import { classesEntrada } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

export type VagaComConvite = {
  id: string;
  titulo: string;
  ligado: boolean;
  recado: string | null;
  enviados: number;
  curtiram: number;
};

/** Uma vaga: o liga e desliga do convite automático, o recado e quantos convites foram e quantos curtiram. */
export function ConviteDaVaga({ v, liberado }: { v: VagaComConvite; liberado: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [recado, setRecado] = useState(v.recado ?? "");
  const mudouRecado = (v.recado ?? "") !== recado.trim();
  // sem plano, o liga fica à mão: o toque pede para assinar, em vez de não fazer nada (11/11/2026)
  const [pedirPlano, setPedirPlano] = useState(false);
  return (
    <li className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-label">{v.titulo}</p>
          <p className="text-body-sm text-ink-muted">
            {v.enviados === 0
              ? "Nenhum convite automático ainda"
              : `Convites automáticos: ${v.enviados} ${v.enviados === 1 ? "enviado" : "enviados"}, ${v.curtiram} ${v.curtiram === 1 ? "curtiu" : "curtiram"}`}
          </p>
        </div>
        <label className="flex min-h-10 items-center gap-2 text-label">
          <input
            type="checkbox"
            role="switch"
            checked={v.ligado}
            aria-describedby={pedirPlano ? `plano-${v.id}` : undefined}
            disabled={pendente}
            onChange={(e) => {
              if (!liberado && e.target.checked) {
                setPedirPlano(true);
                return;
              }
              rodar(() => ligarConviteAutomatico(v.id, e.target.checked, recado));
            }}
            className="size-5 accent-terra"
          />
          {v.ligado ? "Ligado" : "Desligado"}
        </label>
      </div>
      {pedirPlano && (
        <div
          id={`plano-${v.id}`}
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-300 px-4 py-3"
        >
          <p className="max-w-2xl text-body-sm">
            <strong>Para ligar, assine um plano.</strong> Com ele, quem combina com esta vaga recebe o convite na hora,
            com o seu recado.
          </p>
          <span className="flex flex-wrap items-center gap-2">
            <BotaoLink href="/painel/planos" variante="primario" tamanho="sm">
              Assinar um plano
            </BotaoLink>
            <Botao tamanho="sm" variante="secundario" onClick={() => setPedirPlano(false)}>
              Agora não
            </Botao>
          </span>
        </div>
      )}
      {(v.ligado || liberado) && (
        // o recado numa largura de ler bem (a lista usa a largura toda do painel)
        <div className="flex max-w-2xl flex-col gap-2">
          <label htmlFor={`recado-${v.id}`} className="text-body-sm text-ink-muted">
            Recado que vai junto (opcional, sem telefone nem link)
          </label>
          <textarea
            id={`recado-${v.id}`}
            value={recado}
            onChange={(e) => setRecado(e.target.value)}
            maxLength={300}
            rows={2}
            placeholder="Ex.: Vimos o seu currículo e achamos que você combina com a vaga. Curta para conversarmos."
            className={classesEntrada}
          />
          {mudouRecado && (
            <Botao
              tamanho="sm"
              variante="secundario"
              className="self-start"
              disabled={pendente}
              onClick={() => rodar(() => ligarConviteAutomatico(v.id, v.ligado, recado))}
            >
              Salvar o recado
            </Botao>
          )}
        </div>
      )}
      {mensagem}
    </li>
  );
}
