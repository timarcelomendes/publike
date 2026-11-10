"use client";

import { useActionState } from "react";
import { Botao } from "@/components/ui/botao";
import { classesEntrada } from "@/components/ui/campo";
import { ligarNumerosDaSemana, salvarMeta } from "@/lib/acoes/painel-admin";
import type { EstadoForm } from "@/lib/tipos";

/** "Definir meta" no cartão da Visão geral (só no admin). Vazio tira a meta. */
export function FormMeta({ indicador, atual, porcento }: { indicador: string; atual?: number; porcento: boolean }) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(salvarMeta, { ok: false });
  return (
    <details className="text-body-sm">
      <summary className="cursor-pointer text-ink-muted underline underline-offset-2">
        {atual ? "Mudar a meta" : "Definir meta"}
      </summary>
      <form action={acao} className="mt-2 flex flex-wrap items-end gap-2">
        <input type="hidden" name="indicador" value={indicador} />
        <label className="flex flex-col gap-1 text-label">
          {porcento ? "Meta (%)" : "Meta por semana"}
          <input
            name="valor"
            inputMode="decimal"
            defaultValue={atual ?? ""}
            placeholder={porcento ? "50" : "20"}
            className={`${classesEntrada} w-28`}
          />
        </label>
        <Botao type="submit" tamanho="sm" variante="secundario" disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar"}
        </Botao>
        {(estado.erro || estado.mensagem) && (
          <p role="status" className={`w-full ${estado.erro ? "text-danger" : "text-cerrado-text"}`}>
            {estado.erro ?? estado.mensagem}
          </p>
        )}
      </form>
    </details>
  );
}

/** Liga e desliga os números da semana por e-mail. */
export function FormNumerosDaSemana({ ligado }: { ligado: boolean }) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(ligarNumerosDaSemana, { ok: false });
  return (
    <form action={acao} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="ligado" value={ligado ? "nao" : "sim"} />
      <Botao type="submit" variante="secundario" tamanho="sm" disabled={salvando}>
        {ligado ? "Desligar" : "Ligar"}
      </Botao>
      {(estado.erro || estado.mensagem) && (
        <p role="status" className={`text-body-sm ${estado.erro ? "text-danger" : "text-cerrado-text"}`}>
          {estado.erro ?? estado.mensagem}
        </p>
      )}
    </form>
  );
}
