"use client";

import { CircleCheck, MessageCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { aceitarWhatsappPeloLink } from "@/lib/acoes/whatsapp";
import { chamarAcao } from "@/lib/acao-segura";
import { Botao, BotaoLink } from "../ui/botao";

/**
 * O pedido do WhatsApp para quem contrata (migração 20270726120000): o link do sino e do e-mail abre aqui, e o aceite
 * é o toque no botão (leitores de link abrem o endereço sozinhos). O texto diz que é pelo WhatsApp e quem manda, como
 * a Meta pede.
 */
export function AceitarWhatsapp({
  token,
  empresa,
  numero,
  jaRecebe,
}: {
  token: string;
  empresa: string;
  numero: string | null;
  jaRecebe: boolean;
}) {
  const [pendente, iniciar] = useTransition();
  const [ligado, setLigado] = useState<string | null>(jaRecebe ? (numero ?? "") : null);
  const [erro, setErro] = useState<{ texto: string; ir?: string } | null>(null);

  function aceitar() {
    setErro(null);
    iniciar(async () => {
      const r = await chamarAcao(() => aceitarWhatsappPeloLink(token));
      if (r.ok) setLigado(r.numero ?? numero ?? "");
      else setErro({ texto: r.erro, ir: "ir" in r ? r.ir : undefined });
    });
  }

  if (ligado !== null) {
    return (
      <section aria-live="polite" className="rounded-lg border border-line bg-surface-200 p-6 shadow-card">
        <CircleCheck aria-hidden className="size-7 text-cerrado-text" />
        <h1 className="mt-3 text-h2">Pronto, está ligado</h1>
        <p className="mt-2 text-body">
          Os avisos dos candidatos da <strong>{empresa}</strong> chegam no WhatsApp
          {ligado ? (
            <>
              {" "}
              <span className="whitespace-nowrap">{ligado}</span>
            </>
          ) : null}
          , pelo número oficial do Publike.
        </p>
        <p className="mt-2 text-body-sm text-ink-muted">
          Para escolher quais avisos chegam, entre no Publike e vá em Preferências. Para parar, responda PARAR no
          WhatsApp.
        </p>
        <div className="mt-5">
          <BotaoLink href="/perfil/preferencias#avisos" variante="secundario">
            Escolher os avisos
          </BotaoLink>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-line bg-surface-200 p-6 shadow-card">
      <MessageCircle aria-hidden className="size-7 text-terra-text" />
      <h1 className="mt-3 text-h2">Receber os candidatos no WhatsApp?</h1>
      <p className="mt-2 text-body">
        Quando alguém curtir as vagas da <strong>{empresa}</strong>, o Publike avisa na hora pelo WhatsApp
        {numero ? (
          <>
            , no número <span className="whitespace-nowrap">{numero}</span>
          </>
        ) : null}
        . Assim vocês respondem antes de o candidato procurar outra vaga.
      </p>
      <p className="mt-3 text-body-sm text-ink-muted">
        Ao tocar em “Sim, quero receber”, vocês aceitam receber mensagens do Publike pelo WhatsApp sobre os candidatos e
        as conversas das vagas. Para parar, é só responder PARAR no WhatsApp ou desligar em Preferências.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Botao variante="primario" disabled={pendente} onClick={aceitar}>
          {pendente ? "Ligando…" : "Sim, quero receber"}
        </Botao>
      </div>
      <p className="mt-3 text-body-sm text-ink-muted">Se não quiser, é só fechar esta página: nada muda.</p>
      {erro && (
        <div role="alert" className="mt-3 flex flex-col gap-2">
          <p className="text-body-sm text-danger">{erro.texto}</p>
          {erro.ir && (
            <div>
              <BotaoLink href={erro.ir} variante="secundario" tamanho="sm">
                Entrar e pôr o número
              </BotaoLink>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
