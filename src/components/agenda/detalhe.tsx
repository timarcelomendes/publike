import type { ReactNode } from "react";
import { Secao } from "@/components/admin/ui";
import { Selo, type VarianteSelo } from "@/components/ui/basicos";
import {
  diaDoHorario,
  FORMATOS_DA_AGENDA,
  horaDoHorario,
  rotuloDoHorario,
} from "@/lib/agenda-horarios";
import { tempoRelativo } from "@/lib/formato";
import {
  AcoesDoConvite,
  AprovarCandidatos,
  type CandidatoDaAgenda,
  EncerrarAgenda,
  MaisHorarios,
  TirarHorario,
} from "./acoes";

// A agenda de uma vaga (migrações 20271013120000 e 20271014120000): os horários, quem foi chamado e os candidatos que
// ainda dá para chamar. A mesma no Admin › Entrevistas (a equipe) e no painel da vaga (a conta dona).

export type ConviteDaAgenda = {
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

export type AgendaDetalhe = {
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

export const nomeDoFormato = (f: string) =>
  FORMATOS_DA_AGENDA.find((x) => x.valor === f)?.nome ?? f;

export function DetalheDaAgenda({
  g,
  agora,
  acoes,
  noPainel = false,
}: {
  g: AgendaDetalhe;
  agora: number;
  acoes?: ReactNode;
  /** no painel da vaga, a conta dona vê o título sem o nome da empresa */
  noPainel?: boolean;
}) {
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
        titulo={noPainel ? "Agenda de entrevistas pelo WhatsApp" : g.vaga}
        descricao={
          <>
            {noPainel ? null : `${g.empresa} · `}
            {nomeDoFormato(g.formato)}
            {g.local ? ` · ${g.local}` : ""} · {g.duracao_min} min
            {g.obs ? ` · Recado: ${g.obs}` : ""}
            {g.encerrada_em
              ? ` · encerrada ${tempoRelativo(g.encerrada_em, agora)}`
              : ""}
          </>
        }
        acoes={acoes}
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
