import { CalendarClock, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FormNovaAgenda } from "@/components/agenda/acoes";
import { type AgendaDetalhe, DetalheDaAgenda } from "@/components/agenda/detalhe";
import { CabecalhoDaVaga } from "@/components/painel/cabecalho-da-vaga";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { obterAnuncio } from "@/lib/dados";
import { formatarLugar } from "@/lib/formato";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Entrevistas pelo WhatsApp" };

// A agenda de entrevistas da vaga, no painel da conta dona (migração 20271014120000; claude/plano-entrevista-marcada.md):
// a empresa ou a agência põe os horários, escolhe quem chamar e o Publike convida pelo WhatsApp, a pessoa escolhe o
// horário na conversa e recebe os lembretes. A equipe vê e mexe nas mesmas agendas no Admin › Entrevistas.

type DaVaga = {
  aberta: string | null;
  antes: { id: string; criada_em: string; encerrada_em: string }[];
  com_whatsapp: number;
  candidatos: number;
  ao_vivo: boolean | null;
};

export default function AgendaDaVaga({ params }: PageProps<"/painel/anuncio/[id]/agenda">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      {params.then(({ id }) => (
        <Conteudo id={id} />
      ))}
    </Suspense>
  );
}

async function Conteudo({ id }: { id: string }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const usuario = await exigirUsuario(`/painel/anuncio/${id}/agenda`);
  const anuncio = await obterAnuncio(id);
  if (!anuncio || anuncio.autor_id !== usuario.id || anuncio.tipo !== "vaga") notFound();
  const c = await criarClienteServidor();
  const { data, error } = await c.rpc("agenda_da_vaga", { p_anuncio: id });
  const cabecalho = <CabecalhoDaVaga anuncio={anuncio} aba="candidatos" />;
  if (error || !data) {
    return (
      <div className="flex flex-col gap-5">
        {cabecalho}
        <Aviso tipo="alerta" titulo="A agenda não abriu agora">
          {error?.code === "PGRST202" ? "Esta parte do Publike ainda está chegando. Tente daqui a pouco." : error?.message}
        </Aviso>
      </div>
    );
  }
  const v = data as unknown as DaVaga;
  const agora = await agoraDaRequisicao();
  const voltar = (
    <BotaoLink href={`/painel/anuncio/${id}/quadro`} tamanho="sm" variante="fantasma">
      Voltar aos candidatos
    </BotaoLink>
  );

  if (v.aberta) {
    const { data: g, error: e2 } = await c.rpc("admin_agenda", { p_agenda: v.aberta });
    return (
      <div className="flex flex-col gap-5">
        {cabecalho}
        {e2 || !g ? (
          <Aviso tipo="alerta" titulo="A agenda não abriu agora">
            {e2?.message ?? "Tente de novo daqui a pouco."}
          </Aviso>
        ) : (
          <DetalheDaAgenda g={g as unknown as AgendaDetalhe} agora={agora} acoes={voltar} noPainel />
        )}
      </div>
    );
  }

  const endereco = [anuncio.endereco, formatarLugar(anuncio.bairro, anuncio.cidade)].filter(Boolean).join(", ");
  const semWhats = v.candidatos - v.com_whatsapp;
  return (
    <div className="flex flex-col gap-5">
      {cabecalho}
      <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface-100 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex max-w-prose flex-col gap-1">
            <h2 className="flex items-center gap-2 text-h3">
              <CalendarClock aria-hidden className="size-5 text-terra-text" />
              Marque as entrevistas pelo WhatsApp
            </h2>
            <p className="text-body-sm text-ink-muted">
              Passe os horários que você tem livres. Depois você escolhe quem chamar: o Publike convida cada pessoa no
              WhatsApp, ela escolhe o horário ali mesmo e recebe o lembrete na véspera e no dia, com o botão para
              confirmar ou desmarcar. Você acompanha tudo aqui.
            </p>
          </div>
          {voltar}
        </div>
        <p className="flex items-center gap-2 text-body-sm">
          <MessageCircle aria-hidden className="size-4 text-cerrado-text" />
          {v.candidatos === 0
            ? "Ninguém se candidatou ainda. Monte a agenda agora e chame as pessoas quando elas chegarem."
            : `${v.com_whatsapp} de ${v.candidatos} ${v.candidatos === 1 ? "candidato aceita" : "candidatos aceitam"} receber pelo WhatsApp${semWhats > 0 ? `; ${semWhats === 1 ? "o outro você chama" : "os outros você chama"} pelo quadro` : ""}.`}
        </p>
        <FormNovaAgenda anuncio={id} localPadrao={endereco} noPainel aoVivo={v.ao_vivo !== false} agora={agora} />
      </section>
      {v.antes.length > 0 && (
        <p className="text-body-sm text-ink-muted">
          {v.antes.length === 1 ? "Esta vaga já teve 1 agenda" : `Esta vaga já teve ${v.antes.length} agendas`},
          encerrada{v.antes.length === 1 ? "" : "s"}.
        </p>
      )}
    </div>
  );
}
