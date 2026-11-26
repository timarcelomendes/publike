import { CircleCheck, Handshake, MessageCircleReply, Star, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { oQueFalta, type ChaveDoSelo, type SituacaoDosSelos } from "@/lib/selos";

// "Seus selos", no Hoje de quem contrata (migração 20271004120000; src/lib/selos.ts): cada selo, se a conta já tem e,
// se não, o que falta, com os números dela. A conta é ao vivo (public.meus_selos); o cartão e a lista mudam quando o
// robô refaz (a cada meia hora).

const ICONES: Record<ChaveDoSelo, LucideIcon> = {
  responde: MessageCircleReply,
  avaliada: Star,
  contratou: Handshake,
};

export function SeusSelos({ situacao }: { situacao: SituacaoDosSelos }) {
  const itens = oQueFalta(situacao);
  const ganhos = itens.filter((i) => i.ganho).length;
  return (
    <section aria-labelledby="seus-selos" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 id="seus-selos" className="text-h2">
          Seus selos
        </h2>
        <p className="text-body-sm text-ink-muted">
          {ganhos > 0
            ? "Aparecem nas suas vagas, e quem procura trabalho vê. Com selo, a vaga também sobe na lista."
            : "Com selo, a vaga aparece com ele para quem procura trabalho e sobe na lista."}
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card">
        {itens.map((i) => {
          const Icone = ICONES[i.chave];
          return (
            <li key={i.chave} className="flex gap-3 px-4 py-3.5 sm:px-5">
              <span
                className={`mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-pill ${
                  i.ganho ? "bg-cerrado/10 text-cerrado-text" : "bg-surface-300 text-ink-muted"
                }`}
              >
                <Icone aria-hidden className="size-4" />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-label">
                  {i.titulo}
                  {i.ganho ? (
                    <span className="inline-flex items-center gap-1 text-body-sm font-semibold text-cerrado-text">
                      <CircleCheck aria-hidden className="size-4" />
                      Você tem
                    </span>
                  ) : (
                    <span className="text-body-sm text-ink-muted">Ainda não</span>
                  )}
                </p>
                <p className="text-body-sm text-ink-muted">{i.texto}</p>
                {i.link && (
                  <Link href={i.link.href} className="text-body-sm font-semibold text-ink underline underline-offset-2">
                    {i.link.texto}
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
