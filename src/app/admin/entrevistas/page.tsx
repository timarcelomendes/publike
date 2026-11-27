import { CalendarClock, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FormNovaAgenda } from "@/components/agenda/acoes";
import {
  type AgendaDetalhe,
  DetalheDaAgenda,
  nomeDoFormato,
} from "@/components/agenda/detalhe";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Secao } from "@/components/admin/ui";
import { Aviso, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink, classesBotao } from "@/components/ui/botao";
import { classesEntrada } from "@/components/ui/campo";
import { rotuloDoHorario } from "@/lib/agenda-horarios";
import { primeiro, tempoRelativo } from "@/lib/formato";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import {
  criarClienteAdmin,
  ehAdminLocal,
  type ClienteBanco,
} from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Entrevistas" };

// A entrevista marcada pelo WhatsApp, fase 1 (migração 20271013120000; claude/plano-entrevista-marcada.md): a equipe
// monta a agenda da vaga com os horários que a empresa passou, aprova quem chamar e anota quem veio. O robô das filas
// convida pelo WhatsApp em ondas, a pessoa escolhe o horário na conversa e recebe os lembretes com botões.

type AgendaResumo = {
  id: string;
  criada_em: string;
  encerrada_em: string | null;
  formato: string;
  aberta: boolean;
  anuncio_id: string;
  vaga: string;
  empresa: string | null;
  horarios: number;
  livres: number;
  proximo: string | null;
  convites: Record<string, number> | null;
  vieram: number;
  faltaram: number;
  pela_equipe?: boolean;
};

type VagaParaAgenda = {
  id: string;
  titulo: string;
  empresa: string | null;
  bairro: string | null;
  cidade: string | null;
  endereco: string | null;
  candidatos: number;
  com_agenda: boolean;
};

export default function Entrevistas({
  searchParams,
}: PageProps<"/admin/entrevistas">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      {searchParams.then((sp) => (
        <Conteudo
          agenda={primeiro(sp.agenda) ?? null}
          nova={primeiro(sp.nova) === "1"}
          vaga={primeiro(sp.vaga) ?? null}
          busca={primeiro(sp.busca) ?? ""}
        />
      ))}
    </Suspense>
  );
}

async function Conteudo({
  agenda,
  nova,
  vaga,
  busca,
}: {
  agenda: string | null;
  nova: boolean;
  vaga: string | null;
  busca: string;
}) {
  // o admin do computador do dono ou, no site no ar, a equipe publike.org (Admin › Quem vê cada tela)
  const admin = await ehAdminLocal();
  if (!admin && !(await possoVerTela("/admin/entrevistas"))) notFound();
  const c = admin ? criarClienteAdmin() : await criarClienteServidor();
  if (agenda && UUID.test(agenda)) return <AgendaAberta c={c} id={agenda} />;
  if (nova)
    return (
      <NovaAgenda
        c={c}
        vaga={vaga && UUID.test(vaga) ? vaga : null}
        busca={busca}
      />
    );
  return <ListaDeAgendas c={c} />;
}

function SemAgenda({ erro }: { erro: { code?: string; message: string } }) {
  return erro.code === "PGRST202" ? (
    <Aviso tipo="alerta" titulo="Rode a migração das entrevistas">
      Falta a migração 20271013120000_entrevista_marcada.sql neste banco.
    </Aviso>
  ) : (
    <Aviso tipo="alerta" titulo="Não deu para ler as agendas">
      {erro.message}
    </Aviso>
  );
}

async function ListaDeAgendas({ c }: { c: ClienteBanco }) {
  const { data, error } = await c.rpc("admin_agendas");
  if (error) return <SemAgenda erro={error} />;
  const agendas = (data ?? []) as unknown as AgendaResumo[];
  const agora = await agoraDaRequisicao();
  return (
    <Secao
      titulo="Entrevistas marcadas pelo WhatsApp"
      descricao="A agenda da vaga com os horários que a empresa passou. O Publike chama quem você aprovar, a pessoa escolhe o horário na conversa e recebe os lembretes."
      acoes={
        <BotaoLink
          href="/admin/entrevistas?nova=1"
          variante="primario"
          tamanho="sm"
        >
          <Plus aria-hidden />
          Nova agenda
        </BotaoLink>
      }
    >
      {agendas.length === 0 ? (
        <Vazio icone={CalendarClock} titulo="Nenhuma agenda ainda">
          Comece pela vaga de uma empresa do teste: os horários que ela passou e
          quem chamar.
        </Vazio>
      ) : (
        <ul className="flex flex-col gap-3">
          {agendas.map((a) => {
            const cv = a.convites ?? {};
            const marcados = cv.marcado ?? 0;
            return (
              <li key={a.id}>
                <Link
                  href={`/admin/entrevistas?agenda=${a.id}`}
                  className="flex flex-col gap-1 rounded-md border border-line bg-surface-100 p-4 hover:border-line-strong"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{a.vaga}</span>
                    <span className="text-ink-muted">· {a.empresa}</span>
                    {!a.aberta && <Selo>Encerrada</Selo>}
                    {a.pela_equipe === false && (
                      <Selo variante="novo">Pela empresa</Selo>
                    )}
                  </span>
                  <span className="text-body-sm text-ink-muted">
                    {nomeDoFormato(a.formato)} · {a.livres} de {a.horarios}{" "}
                    horários livres
                    {a.proximo
                      ? ` · próximo ${rotuloDoHorario(a.proximo)}`
                      : ""}
                  </span>
                  <span className="text-body-sm">
                    {marcados} marcadas · {cv.fila ?? 0} na fila ·{" "}
                    {(cv.convidado ?? 0) + (cv.quer ?? 0)} escolhendo ·{" "}
                    {a.vieram} vieram · {a.faltaram} faltaram
                  </span>
                  <span className="text-caption text-ink-muted">
                    criada {tempoRelativo(a.criada_em, agora)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Secao>
  );
}

async function NovaAgenda({
  c,
  vaga,
  busca,
}: {
  c: ClienteBanco;
  vaga: string | null;
  busca: string;
}) {
  const { data, error } = await c.rpc("admin_agenda_vagas", {
    p_busca: busca || null,
  });
  if (error) return <SemAgenda erro={error} />;
  const vagas = (data ?? []) as unknown as VagaParaAgenda[];
  const escolhida = vaga ? vagas.find((v) => v.id === vaga) : null;
  if (vaga && escolhida) {
    return (
      <Secao
        titulo={`Agenda: ${escolhida.titulo}`}
        descricao={`${escolhida.empresa ?? ""} · ${escolhida.candidatos} candidatos esperando ou aceitos`}
        acoes={
          <BotaoLink
            href="/admin/entrevistas?nova=1"
            tamanho="sm"
            variante="fantasma"
          >
            Trocar a vaga
          </BotaoLink>
        }
      >
        <FormNovaAgenda
          anuncio={escolhida.id}
          localPadrao={
            escolhida.endereco ??
            [escolhida.bairro, escolhida.cidade].filter(Boolean).join(", ")
          }
        />
      </Secao>
    );
  }
  return (
    <Secao
      titulo="Nova agenda: escolha a vaga"
      descricao="As vagas no ar, das com mais candidatos para as com menos."
      acoes={
        <BotaoLink href="/admin/entrevistas" tamanho="sm" variante="fantasma">
          Voltar
        </BotaoLink>
      }
    >
      <form action="/admin/entrevistas" className="flex flex-wrap gap-2">
        <input type="hidden" name="nova" value="1" />
        <input
          name="busca"
          defaultValue={busca}
          placeholder="Vaga ou empresa"
          aria-label="Buscar a vaga ou a empresa"
          className={`${classesEntrada} max-w-sm`}
        />
        <button type="submit" className={classesBotao("secundario")}>
          Buscar
        </button>
      </form>
      {vagas.length === 0 ? (
        <p className="text-body-sm text-ink-muted">
          Nenhuma vaga no ar com essa busca.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
          {vagas.map((v) => (
            <li
              key={v.id}
              className="flex flex-wrap items-center justify-between gap-3 p-3"
            >
              <span className="flex min-w-0 flex-col">
                <span className="font-semibold">{v.titulo}</span>
                <span className="text-body-sm text-ink-muted">
                  {v.empresa} ·{" "}
                  {[v.bairro, v.cidade].filter(Boolean).join(", ")} ·{" "}
                  {v.candidatos} candidatos
                  {v.com_agenda ? " · já tem agenda aberta" : ""}
                </span>
              </span>
              <BotaoLink
                href={`/admin/entrevistas?nova=1&vaga=${v.id}`}
                tamanho="sm"
              >
                Montar a agenda
              </BotaoLink>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}

async function AgendaAberta({ c, id }: { c: ClienteBanco; id: string }) {
  const { data, error } = await c.rpc("admin_agenda", { p_agenda: id });
  if (error || !data) {
    return (
      <Aviso tipo="alerta" titulo="Não achei esta agenda">
        {error?.message ?? "Ela pode ter sido apagada."}{" "}
        <Link href="/admin/entrevistas">Ver as agendas</Link>
      </Aviso>
    );
  }
  return (
    <DetalheDaAgenda
      g={data as unknown as AgendaDetalhe}
      agora={await agoraDaRequisicao()}
      acoes={
        <BotaoLink href="/admin/entrevistas" tamanho="sm" variante="fantasma">
          Todas as agendas
        </BotaoLink>
      }
    />
  );
}
