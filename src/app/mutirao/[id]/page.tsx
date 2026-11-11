import { CalendarClock, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EscolherHorarioDoMutirao } from "@/components/mutirao/escolher";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Container, Selo } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { diaDoMutirao, horaCurta, horaDoHorario } from "@/lib/mutirao";
import { meuMutirao } from "@/lib/servidor/mutirao";
import { exigirUsuario } from "@/lib/sessao";

export const metadata: Metadata = { title: "Dia de entrevistas", robots: { index: false } };

// Para quem foi chamado para um mutirão (migração 20270417120000): o dia, o endereço, o que levar e os horários
// que ainda têm lugar. O link vem no aviso.

export default function PaginaMeuMutirao({ params }: PageProps<"/mutirao/[id]">) {
  return (
    <Container className="py-6">
      <Suspense fallback={null}>
        <Conteudo params={params} />
      </Suspense>
    </Container>
  );
}

async function Conteudo({ params }: { params: PageProps<"/mutirao/[id]">["params"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const { id } = await params;
  await exigirUsuario(`/mutirao/${id}`);
  const m = await meuMutirao(id);
  if (!m) notFound();
  const comHorario = m.situacao === "confirmada" || m.situacao === "marcada";
  const aberta = !m.cancelado && (m.situacao === "escolher" || comHorario);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="text-body-sm text-ink-muted">{m.empresa ?? "A empresa"} chamou você para um dia de entrevistas</p>
        <h1 className="text-h2">
          <Link href={`/anuncio/${m.anuncio}`} className="hover:underline">
            {m.vaga}
          </Link>
        </h1>
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-4">
        <p className="flex items-start gap-2 text-body">
          <CalendarClock aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
          <span>
            {diaDoMutirao(m.dia)}, das {horaCurta(m.inicio)} às {horaCurta(m.fim)}
          </span>
        </p>
        <p className="flex items-start gap-2 text-body">
          <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
          <span>{m.local}</span>
        </p>
        {m.trazer && <p className="text-body-sm text-ink-muted">Leve: {m.trazer}</p>}
      </div>

      {m.cancelado ? (
        <Aviso tipo="info" titulo="Este dia de entrevistas foi cancelado" />
      ) : m.situacao === "cancelada" ? (
        <Aviso tipo="info" titulo="Você avisou que não pode ir" />
      ) : m.situacao === "realizada" ? (
        <Aviso tipo="sucesso" titulo="Você foi à entrevista" />
      ) : m.situacao === "faltou" ? (
        <Aviso tipo="info" titulo="A empresa marcou que você não foi" />
      ) : null}

      {aberta && (
        <section aria-labelledby="horario" className="flex flex-col gap-3">
          <h2 id="horario" className="flex flex-wrap items-center gap-2 text-h3">
            {comHorario ? (
              <>
                Seu horário: {horaDoHorario(m.quando)}
                <Selo variante="match">Confirmado</Selo>
              </>
            ) : (
              "Escolha o seu horário"
            )}
          </h2>
          <p className="text-body-sm text-ink-muted">
            {comHorario
              ? "Você recebe o lembrete na véspera. Para trocar, toque em outro horário."
              : "Só aparecem os horários que ainda têm lugar. Ao escolher, a entrevista já fica confirmada."}
          </p>
          <EscolherHorarioDoMutirao entrevista={m.entrevista} horarios={m.horarios} atual={comHorario ? m.quando : null} />
        </section>
      )}
    </div>
  );
}
