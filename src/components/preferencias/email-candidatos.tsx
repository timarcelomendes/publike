"use client";

import { useState } from "react";
import { mudarEmailCandidatos } from "@/lib/acoes/email-candidatos";
import { useAcao } from "../ui/usar-acao";

// Preferências › Avisos, para quem publica vaga (migração 20270923120000): quando os candidatos novos chegam no e-mail.

const OPCOES = [
  {
    valor: "tres",
    nome: "Quando juntarem 3 candidatos novos",
    ajuda: "Um e-mail com quantos são e as vagas. Recomendado: menos e-mails, nada fica para trás.",
  },
  { valor: "cada", nome: "A cada candidato novo", ajuda: "No máximo um e-mail a cada 30 minutos." },
  {
    valor: "nenhum",
    nome: "Não receber por e-mail",
    ajuda: "Os candidatos continuam no sino, no celular e no WhatsApp, se estiverem ligados.",
  },
] as const;

export function PreferenciaEmailCandidatos({ inicial, pode }: { inicial: string; pode: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [jeito, setJeito] = useState(inicial);
  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-4">
      <legend className="sr-only">Candidatos novos no e-mail</legend>
      <p className="text-label">Candidatos novos no e-mail</p>
      <p className="text-body-sm text-ink-muted">
        Quem tem 1 ou 2 candidatos esperando recebe um lembrete depois de 24 horas, em qualquer opção que mande e-mail.
      </p>
      <div className="mt-1 flex flex-col gap-1">
        {OPCOES.map((o) => (
          <label key={o.valor} className="flex min-h-10 items-start gap-3 py-1">
            <input
              type="radio"
              name="email-candidatos"
              value={o.valor}
              checked={jeito === o.valor}
              disabled={pendente || !pode}
              onChange={() => {
                const antes = jeito;
                setJeito(o.valor);
                rodar(
                  () => mudarEmailCandidatos(o.valor),
                  (r) => {
                    if (!r.ok) setJeito(antes);
                  },
                );
              }}
              className="mt-1 size-4 accent-terra"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-body-sm font-semibold">{o.nome}</span>
              <span className="text-body-sm text-ink-muted">{o.ajuda}</span>
            </span>
          </label>
        ))}
      </div>
      {!pode && <p className="text-body-sm text-ink-muted">Só quem administra a conta muda isso.</p>}
      {mensagem}
    </fieldset>
  );
}
