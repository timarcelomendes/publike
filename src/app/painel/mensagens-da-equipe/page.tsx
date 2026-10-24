import { Mail, Megaphone } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { LerMensagensDaEquipe } from "@/components/painel/ler-mensagens-equipe";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Vazio } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { formatarDataHora } from "@/lib/formato";
import { EMAIL_DA_EQUIPE } from "@/lib/mensagem-equipe";
import { minhasMensagensDaEquipe } from "@/lib/servidor/mensagens-equipe";
import { exigirUsuario } from "@/lib/sessao";

export const metadata: Metadata = { title: "Mensagens da equipe", robots: { index: false } };

// As mensagens que a equipe do Publike escreveu para a conta (Admin › Conta › Mensagem da equipe), da
// mais nova para a mais antiga. O sino avisa ("Equipe Publike: …") e traz para cá; abrir marca como lidas.

export default function MensagensDaEquipe() {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/mensagens-da-equipe");
  const mensagens = (await minhasMensagensDaEquipe()) ?? [];

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      {mensagens.some((m) => !m.lida_em) && <LerMensagensDaEquipe />}
      <div>
        <h2 className="text-h2">Mensagens da equipe</h2>
        <p className="mt-1 text-body text-ink-muted">O que a equipe do Publike escreveu para você.</p>
      </div>

      {mensagens.length === 0 ? (
        <Vazio icone={Megaphone} titulo="Nenhuma mensagem da equipe">
          Quando a equipe do Publike precisar falar com você, a mensagem aparece aqui e no sino.
        </Vazio>
      ) : (
        <ul className="flex flex-col gap-3">
          {mensagens.map((m) => (
            <li key={m.id} className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-4 shadow-card">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 className="text-label">
                  {m.assunto}
                  {!m.lida_em && (
                    <span className="ml-2 rounded-pill bg-ipe px-2 py-0.5 text-body-sm font-normal text-on-ipe">
                      Nova
                    </span>
                  )}
                </h3>
                <time dateTime={m.criado_em} className="text-body-sm text-ink-muted">
                  {formatarDataHora(m.criado_em)}
                </time>
              </div>
              <p className="whitespace-pre-line text-body">{m.texto}</p>
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-start gap-2 text-body-sm text-ink-muted">
        <Mail aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          Quer responder? Escreva para{" "}
          <a href={`mailto:${EMAIL_DA_EQUIPE}`} className="font-semibold text-ink underline underline-offset-2">
            {EMAIL_DA_EQUIPE}
          </a>
          .
        </span>
      </p>
    </div>
  );
}
