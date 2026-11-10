import { CalendarClock, CalendarDays, Video } from "lucide-react";
import { Selo } from "@/components/ui/basicos";
import { formatarDataHora } from "@/lib/formato";
import { conversasNaAgenda, type ConversaNaAgenda } from "@/lib/servidor/google-meet";
import { agoraDaRequisicao } from "@/lib/tempo";

// Admin › E-mails › Agendar conversa: as conversas com prospects que estão na Google Agenda, as próximas e as que já
// aconteceram (últimos 60 dias), com a resposta de quem foi convidado. Lê direto da agenda (não guarda nada no banco).

const RESPOSTA: Record<ConversaNaAgenda["convidados"][number]["resposta"], { nome: string; tom: "match" | "perigo" | "aviso" | "contorno" }> = {
  aceitou: { nome: "Aceitou", tom: "match" },
  recusou: { nome: "Recusou", tom: "perigo" },
  talvez: { nome: "Talvez", tom: "aviso" },
  sem_resposta: { nome: "Sem resposta", tom: "contorno" },
};

export async function ConversasNaAgenda() {
  const agora = await agoraDaRequisicao();
  const lista = await conversasNaAgenda(agora);
  if (lista === null) return null;
  const agendadas = lista.filter((c) => new Date(c.fim).getTime() >= agora);
  const realizadas = lista.filter((c) => new Date(c.fim).getTime() < agora).reverse();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Lista titulo="Agendadas" icone={CalendarClock} vazio="Nenhuma conversa marcada." itens={agendadas} proxima />
      <Lista titulo="Realizadas" icone={CalendarDays} vazio="Nenhuma conversa nos últimos 60 dias." itens={realizadas} />
    </div>
  );
}

function Lista({
  titulo,
  icone: Icone,
  vazio,
  itens,
  proxima = false,
}: {
  titulo: string;
  icone: typeof CalendarClock;
  vazio: string;
  itens: ConversaNaAgenda[];
  proxima?: boolean;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-label">
        <Icone aria-hidden className="size-4 text-ink-muted" />
        {titulo} <span className="font-normal text-ink-muted">({itens.length})</span>
      </h3>
      {itens.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-strong p-4 text-body-sm text-ink-muted">{vazio}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface-100">
          {itens.map((c) => (
            <li key={c.id} className="flex flex-col gap-1.5 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-label">{c.titulo}</p>
                <p className="text-body-sm text-ink-muted tabular-nums">{formatarDataHora(c.inicio)}</p>
              </div>
              {c.convidados.length > 0 && (
                <ul className="flex flex-wrap gap-x-3 gap-y-1 text-body-sm">
                  {c.convidados.map((p) => (
                    <li key={p.email} className="flex items-center gap-1.5">
                      <span className="break-all text-ink-muted">{p.email}</span>
                      <Selo variante={RESPOSTA[p.resposta].tom}>{RESPOSTA[p.resposta].nome}</Selo>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm">
                {proxima && c.meet && (
                  <a href={c.meet} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-label underline underline-offset-2">
                    <Video aria-hidden className="size-4" />
                    Entrar no Meet
                  </a>
                )}
                {c.evento && (
                  <a href={c.evento} target="_blank" rel="noopener noreferrer" className="text-ink-muted underline underline-offset-2">
                    Abrir na Google Agenda
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
