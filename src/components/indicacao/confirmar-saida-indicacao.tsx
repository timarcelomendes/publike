"use client";

import { MailCheck, MailX } from "lucide-react";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { sairDasIndicacoes } from "@/lib/acoes/indicacao-email";
import { Botao, BotaoLink } from "../ui/botao";

/** Confirma o "parar de receber indicações" (leitores de link abrem a página sozinhos: só o toque tira da lista). */
export function ConfirmarSaidaIndicacao({ codigo }: { codigo: string }) {
  const [pendente, iniciar] = useTransition();
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (pronto) {
    return (
      <section aria-live="polite" className="rounded-lg border border-line bg-surface-200 p-6 shadow-card">
        <MailCheck aria-hidden className="size-7 text-cerrado-text" />
        <h1 className="mt-3 text-h2">Pronto</h1>
        <p className="mt-2 text-body">Este e-mail não recebe mais indicações de vagas pelo Publike.</p>
        <div className="mt-5">
          <BotaoLink href="/?tipo=vaga" variante="secundario">
            Ver vagas mesmo assim
          </BotaoLink>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-line bg-surface-200 p-6 shadow-card">
      <MailX aria-hidden className="size-7 text-terra-text" />
      <h1 className="mt-3 text-h2">Parar de receber indicações?</h1>
      <p className="mt-2 text-body">
        Alguém com conta no Publike mandou uma vaga para o seu e-mail. Se não quiser receber mais, ninguém consegue
        indicar vagas para este e-mail de novo.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Botao
          disabled={pendente}
          onClick={() => {
            setErro(null);
            iniciar(async () => {
              const r = await chamarAcao(() => sairDasIndicacoes(codigo));
              if (r.ok) setPronto(true);
              else setErro(r.erro);
            });
          }}
        >
          {pendente ? "Tirando…" : "Parar de receber"}
        </Botao>
      </div>
      {erro && (
        <p role="alert" className="mt-3 text-body-sm text-danger">
          {erro}
        </p>
      )}
    </section>
  );
}
