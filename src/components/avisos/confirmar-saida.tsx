"use client";

import { MailCheck, MailX } from "lucide-react";
import { useState, useTransition } from "react";
import { sairDosAvisos } from "@/lib/acoes/avisos";
import { chamarAcao } from "@/lib/acao-segura";
import { nomeDoQueSai } from "@/lib/avisos";
import { Botao, BotaoLink } from "../ui/botao";

/** Confirma o "parar de receber" do e-mail; depois, conta o que saiu e leva para escolher os avisos. */
export function ConfirmarSaida({ chave, grupo, nome }: { chave: string; grupo: string; nome: string }) {
  const [pendente, iniciar] = useTransition();
  const [saiu, setSaiu] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function sair(qual: string) {
    setErro(null);
    iniciar(async () => {
      const r = await chamarAcao(() => sairDosAvisos(chave, qual));
      if (r.ok) setSaiu(r.saiu);
      else setErro(r.erro);
    });
  }

  if (saiu) {
    return (
      <section aria-live="polite" className="rounded-lg border border-line bg-surface-200 p-6 shadow-card">
        <MailCheck aria-hidden className="size-7 text-cerrado-text" />
        <h1 className="mt-3 text-h2">Pronto</h1>
        <p className="mt-2 text-body">
          Não chega mais por e-mail: <strong>{nomeDoQueSai(saiu) ?? nome}</strong>.
        </p>
        <p className="mt-2 text-body-sm text-ink-muted">
          Os avisos continuam no sino do Publike. Mudou de ideia? Ligue de novo em Avisos e notificações.
        </p>
        <div className="mt-5">
          <BotaoLink href="/perfil/avisos" variante="secundario">
            Escolher os avisos
          </BotaoLink>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-line bg-surface-200 p-6 shadow-card">
      <MailX aria-hidden className="size-7 text-terra-text" />
      <h1 className="mt-3 text-h2">Parar de receber por e-mail?</h1>
      <p className="mt-2 text-body">{nome}</p>
      <p className="mt-2 text-body-sm text-ink-muted">
        Os avisos continuam no sino do Publike. Os da sua conta e da moderação chegam sempre.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Botao variante="primario" disabled={pendente} onClick={() => sair(grupo)}>
          {pendente ? "Parando…" : "Parar de receber"}
        </Botao>
        {grupo !== "todos" && (
          <Botao variante="fantasma" disabled={pendente} onClick={() => sair("todos")}>
            Parar todos os avisos por e-mail
          </Botao>
        )}
      </div>
      {erro && (
        <p role="alert" className="mt-3 text-body-sm text-danger">
          {erro}
        </p>
      )}
    </section>
  );
}
