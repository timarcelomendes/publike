import { CalendarClock, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  AcoesDoConvite,
  AprovarCandidatos,
  type CandidatoDaAgenda,
  EncerrarAgenda,
  FormNovaAgenda,
  MaisHorarios,
  TirarHorario,
} from "@/components/admin/entrevistas";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Secao } from "@/components/admin/ui";
import { Aviso, Selo, type VarianteSelo, Vazio } from "@/components/ui/basicos";
import { BotaoLink, classesBotao } from "@/components/ui/botao";
import { classesEntrada } from "@/components/ui/campo";
import {
  diaDoHorario,
  FORMATOS_DA_AGENDA,
  horaDoHorario,
  rotuloDoHorario,
} from "@/lib/agenda-horarios";
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
};

type ConviteDaAgenda = {
  id: number;
  perfil_id: string;
  nome: string | null;
  bairro: string | null;
  cidade: string | null;
  situacao: string;
  final: string | null;
  convidado_em: string | null;
  respondeu_em: string | null;
  marcado_em: string | null;
  quando: string | null;
  entrevista: string | null;
  entrevista_quando: string | null;
  confirmou_vespera_em: string | null;
  confirmou_hoje_em: string | null;
  lembrete_vespera_em: string | null;
  lembrete_hoje_em: string | null;
  falha: string | null;
};

type AgendaDetalhe = {
  id: string;
  formato: string;
  local: string | null;
  obs: string | null;
  duracao_min: number;
  criada_em: string;
  encerrada_em: string | null;
  anuncio_id: string;
  vaga: string;
  empresa: string | null;
  horarios: {
    id: number;
    quando: string;
    convite_id: number | null;
    nome: string | null;
  }[];
  convites: ConviteDaAgenda[];
  candidatos: CandidatoDaAgenda[];
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

const SITUACOES: Record<string, { nome: string; variante: VarianteSelo }> = {
  fila: { nome: "Na fila", variante: "contorno" },
  enviando: { nome: "Enviando", variante: "novo" },
  convidado: { nome: "Convidado", variante: "novo" },
  quer: { nome: "Escolhendo o horário", variante: "novo" },
  marcado: { nome: "Marcado", variante: "match" },
  espera: { nome: "Quis, sem horário", variante: "aviso" },
  recusou: { nome: "Sem interesse", variante: "neutro" },
  desistiu: { nome: "Desistiu", variante: "aviso" },
  sem_resposta: { nome: "Não respondeu", variante: "neutro" },
  sem_whatsapp: { nome: "Sem WhatsApp", variante: "aviso" },
  falhou: { nome: "Não saiu", variante: "perigo" },
  encerrado: { nome: "Encerrado", variante: "contorno" },
};

const ENTREVISTA: Record<string, string> = {
  confirmada: "confirmada",
  marcada: "marcada",
  remarcar: "trocando de horário",
  cancelada: "cancelada",
  realizada: "veio",
  faltou: "faltou",
};

const nomeDoFormato = (f: string) =>
  FORMATOS_DA_AGENDA.find((x) => x.valor === f)?.nome ?? f;

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
  const g = data as unknown as AgendaDetalhe;
  const agora = await agoraDaRequisicao();
  const aberta = !g.encerrada_em;
  const porDia = new Map<string, AgendaDetalhe["horarios"]>();
  for (const h of g.horarios)
    porDia.set(diaDoHorario(h.quando), [
      ...(porDia.get(diaDoHorario(h.quando)) ?? []),
      h,
    ]);
  const marcados = g.convites.filter((x) => x.situacao === "marcado");
  return (
    <div className="flex flex-col gap-6">
      <Secao
        titulo={g.vaga}
        descricao={
          <>
            {g.empresa} · {nomeDoFormato(g.formato)}
            {g.local ? ` · ${g.local}` : ""} · {g.duracao_min} min
            {g.obs ? ` · Recado: ${g.obs}` : ""}
            {g.encerrada_em
              ? ` · encerrada ${tempoRelativo(g.encerrada_em, agora)}`
              : ""}
          </>
        }
        acoes={
          <BotaoLink href="/admin/entrevistas" tamanho="sm" variante="fantasma">
            Todas as agendas
          </BotaoLink>
        }
      >
        <div className="flex flex-col gap-3">
          {[...porDia].map(([dia, horarios]) => (
            <div key={dia} className="flex flex-col gap-1.5">
              <p className="text-label">{dia}</p>
              <ul className="flex flex-wrap gap-2">
                {horarios.map((h) => {
                  const passou = Date.parse(h.quando) < agora;
                  return (
                    <li
                      key={h.id}
                      className={`flex items-center gap-1 rounded-sm border px-2 py-1 text-body-sm ${
                        h.convite_id
                          ? "border-cerrado bg-cerrado/10"
                          : "border-line"
                      } ${passou ? "opacity-60" : ""}`}
                    >
                      <span className="font-semibold">
                        {horaDoHorario(h.quando)}
                      </span>
                      <span className="text-ink-muted">
                        {h.nome ? h.nome.split(" ")[0] : "livre"}
                      </span>
                      {!h.convite_id && !passou && aberta && (
                        <TirarHorario agenda={g.id} horario={h.id} />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {aberta && <MaisHorarios agenda={g.id} duracao={g.duracao_min} />}
        </div>
      </Secao>

      <Secao
        titulo={`Chamados (${g.convites.length})`}
        descricao={`${marcados.length} marcados. O robô chama em ondas (até 1,5 pessoa por horário livre), das 8h às 20h, de segunda a sábado; quem não responde em 12 horas dá lugar ao próximo.`}
      >
        {g.convites.length === 0 ? (
          <p className="text-body-sm text-ink-muted">
            Ninguém na fila ainda: aprove abaixo quem chamar.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
            {g.convites.map((x) => {
              const s = SITUACOES[x.situacao] ?? {
                nome: x.situacao,
                variante: "neutro" as VarianteSelo,
              };
              const quando = x.entrevista_quando ?? x.quando;
              return (
                <li
                  key={x.id}
                  className="flex flex-wrap items-start justify-between gap-3 p-3"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">
                        {x.nome ?? "Sem nome"}
                      </span>
                      <Selo variante={s.variante}>{s.nome}</Selo>
                      {x.situacao === "marcado" && x.entrevista && (
                        <span className="text-body-sm text-ink-muted">
                          ({ENTREVISTA[x.entrevista] ?? x.entrevista})
                        </span>
                      )}
                    </span>
                    <span className="text-body-sm text-ink-muted">
                      {[x.bairro, x.cidade].filter(Boolean).join(", ") ||
                        "Sem bairro"}
                      {x.final ? ` · WhatsApp final ${x.final}` : ""}
                      {x.convidado_em
                        ? ` · chamado ${tempoRelativo(x.convidado_em, agora)}`
                        : ""}
                    </span>
                    {x.situacao === "marcado" && quando && (
                      <span className="text-body-sm">
                        {rotuloDoHorario(quando)}
                        {x.confirmou_vespera_em
                          ? " · confirmou na véspera"
                          : x.lembrete_vespera_em
                            ? " · véspera sem resposta"
                            : ""}
                        {x.confirmou_hoje_em
                          ? " · confirmou no dia"
                          : x.lembrete_hoje_em
                            ? " · lembrete do dia sem resposta"
                            : ""}
                      </span>
                    )}
                    {x.falha && (
                      <span className="text-body-sm text-danger">
                        {x.falha}
                      </span>
                    )}
                  </span>
                  <AcoesDoConvite
                    convite={x.id}
                    situacao={x.situacao}
                    entrevista={x.entrevista}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Secao>

      {aberta && (
        <Secao
          titulo={`Candidatos da vaga (${g.candidatos.length})`}
          descricao="Só quem se candidatou. Marque quem chamar: entram na fila na ordem da candidatura (a mais antiga primeiro). Sem o aceite do WhatsApp, não dá para chamar."
        >
          <AprovarCandidatos agenda={g.id} candidatos={g.candidatos} />
        </Secao>
      )}

      {aberta && (
        <div>
          <EncerrarAgenda agenda={g.id} />
        </div>
      )}
    </div>
  );
}
