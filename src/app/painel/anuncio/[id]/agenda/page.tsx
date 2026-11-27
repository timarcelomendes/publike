import { CalendarClock, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
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
  /** migração 20271015120000: a assinatura (ou um plano) libera sem limite; sem ela, as vagas grátis do mês */
  liberada?: boolean;
  gratis?: { limite: number; usados: number; esta_conta: boolean; renova_em: string } | null;
  pode_assinar?: boolean;
};

/** "1º de dezembro" */
function diaDaVirada(iso: string) {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000);
  const mes = d.toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });
  return `${d.getUTCDate() === 1 ? "1º" : d.getUTCDate()} de ${mes}`;
}

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
  // as vagas grátis do mês (migração 20271015120000): esta vaga já contou, ou ainda sobra; senão, a assinatura
  const g = v.liberada ? null : (v.gratis ?? null);
  const acabou = Boolean(g && !g.esta_conta && g.usados >= g.limite);
  const vagas = (n: number) => (n === 1 ? "1 vaga" : `${n} vagas`);
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
        {g && !acabou && (
          <p className="rounded-md bg-cerrado/10 px-3 py-2 text-body-sm text-cerrado-text">
            {g.esta_conta
              ? `Esta vaga já conta nas ${vagas(g.limite)} grátis deste mês: monte a agenda de novo à vontade.`
              : `Grátis: ${vagas(g.limite)} por mês, com todos os candidatos. Neste mês, ${g.usados === 0 ? "nenhuma usada" : `${g.usados} de ${g.limite} usada${g.usados === 1 ? "" : "s"}`}; esta vai ser a ${g.usados + 1}ª.`}
          </p>
        )}
        {acabou && g ? (
          <div className="flex flex-col gap-3 rounded-md border border-terra-text/40 bg-terra-soft/40 p-4">
            <p className="text-label">
              {g.limite === 0
                ? "As entrevistas pelo WhatsApp são da assinatura"
                : g.limite === 1
                  ? "A vaga grátis deste mês já foi usada"
                  : `As ${vagas(g.limite)} grátis deste mês já foram usadas`}
            </p>
            <p className="text-body-sm">
              Com a assinatura das Entrevistas pelo WhatsApp, você marca as entrevistas em todas as vagas, sem limite.
              {g.limite === 1
                ? ` Ou espere: a vaga grátis volta em ${diaDaVirada(g.renova_em)}.`
                : g.limite > 1
                  ? ` Ou espere: as ${vagas(g.limite)} grátis voltam em ${diaDaVirada(g.renova_em)}.`
                  : ""}
            </p>
            {v.pode_assinar ? (
              <div>
                <BotaoLink href="/painel/assinar?recurso=agenda" variante="primario" tamanho="sm">
                  Assinar as Entrevistas pelo WhatsApp
                </BotaoLink>
              </div>
            ) : (
              <p className="text-body-sm text-ink-muted">
                Os planos do Publike também liberam: <Link href="/painel/planos">veja os planos</Link>.
              </p>
            )}
          </div>
        ) : (
          <FormNovaAgenda anuncio={id} localPadrao={endereco} noPainel aoVivo={v.ao_vivo !== false} agora={agora} />
        )}
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
