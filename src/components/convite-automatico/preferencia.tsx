"use client";

import { receberConvitesAutomaticos } from "@/lib/acoes/convite-automatico";
import { useAcao } from "../ui/usar-acao";

/** Para quem procura: receber ou não os convites que as empresas mandam automaticamente (migração 20270418120000). */
export function PreferenciaConviteAutomatico({ recebe }: { recebe: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-200 p-4">
      <label className="flex min-h-10 items-start gap-3">
        <input
          type="checkbox"
          checked={recebe}
          disabled={pendente}
          onChange={(e) => rodar(() => receberConvitesAutomaticos(e.target.checked))}
          className="mt-1 size-4 accent-terra"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-label">Convites automáticos de empresas</span>
          <span className="text-body-sm text-ink-muted">
            Quando o seu currículo combina com uma vaga, a empresa pode ter o convite ligado. São no máximo 2 por
            semana. Os convites que a empresa manda à mão continuam chegando.
          </span>
        </span>
      </label>
      {mensagem}
    </div>
  );
}
