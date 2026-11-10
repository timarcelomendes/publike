"use client";

import { useActionState } from "react";
import { Botao } from "@/components/ui/botao";
import { classesEntrada } from "@/components/ui/campo";
import { salvarGastoDivulgacao } from "@/lib/acoes/painel-admin";
import type { EstadoForm } from "@/lib/tipos";

/** O gasto com anúncios de um mês e canal (Painel › Dinheiro). O canal com o mesmo nome da origem dá o custo por conta. */
export function FormGasto({ mesAtual, canais }: { mesAtual: string; canais: string[] }) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(salvarGastoDivulgacao, { ok: false });
  return (
    <form action={acao} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-label">
        Mês
        <input type="month" name="mes" defaultValue={mesAtual} required className={`${classesEntrada} w-40`} />
      </label>
      <label className="flex flex-col gap-1 text-label">
        Canal (a origem das contas)
        <input
          name="canal"
          list="canais-gasto"
          required
          minLength={2}
          maxLength={40}
          className={`${classesEntrada} w-56`}
        />
        <datalist id="canais-gasto">
          {canais.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <label className="flex flex-col gap-1 text-label">
        Gasto (R$)
        <input name="valor" inputMode="decimal" required placeholder="0,00" className={`${classesEntrada} w-32`} />
      </label>
      <Botao type="submit" variante="secundario" disabled={salvando}>
        {salvando ? "Salvando…" : "Salvar"}
      </Botao>
      {(estado.erro || estado.mensagem) && (
        <p role="status" className={`w-full text-body-sm ${estado.erro ? "text-danger" : "text-cerrado-text"}`}>
          {estado.erro ?? estado.mensagem}
        </p>
      )}
    </form>
  );
}
