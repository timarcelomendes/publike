import { MessageCircleQuestion } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { PerguntarNosMatches } from "@/components/admin/matches-sem-contato";
import { Filtros, linkCom, Secao } from "@/components/admin/ui";
import { Aviso, Selo, Vazio } from "@/components/ui/basicos";
import { formatarNumero, primeiro, rotuloConta, tempoRelativo } from "@/lib/formato";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Retorno" };

// Quem deu retorno aos candidatos (migração 20270127120000): por empresa, o que recebeu, viu, respondeu, deixou sem
// resposta e se houve contato depois (mensagem no Publike ou o WhatsApp aberto pelo botão); de uma empresa, cada
// candidatura. Só no admin, no computador do dono.

const PERIODOS = [
  { valor: "7", nome: "7 dias" },
  { valor: "30", nome: "30 dias" },
  { valor: "90", nome: "90 dias" },
  { valor: "tudo", nome: "Tudo" },
];
const DIA = 24 * 60 * 60 * 1000;
const BASE = "/admin/retorno";

type Empresa = {
  conta_id: string;
  nome: string;
  tipo: string;
  candidaturas: number;
  vistas: number;
  respondidas: number;
  aceitas: number;
  dispensadas: number;
  sem_resposta: number;
  atrasadas: number;
  com_contato: number;
  aceitas_sem_contato: number;
  horas_resposta: number | null;
  ultima_acao: string | null;
};
type Total = Pick<
  Empresa,
  "candidaturas" | "respondidas" | "sem_resposta" | "atrasadas" | "com_contato" | "aceitas" | "aceitas_sem_contato"
> & { empresas: number };
type Candidatura = {
  anuncio_id: string;
  vaga: string;
  perfil_id: string;
  nome: string | null;
  status: string;
  etapa: string | null;
  criado_em: string;
  respondida_em: string | null;
  vista_em: string | null;
  mensagens: number;
  ultima_mensagem: string | null;
  contato_em: string | null;
  avisada: boolean;
  respondida: boolean;
  com_contato: boolean;
};

export default function Retorno({ searchParams }: PageProps<"/admin/retorno">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

const pct = (parte: number, todo: number) => (todo ? `${Math.round((parte / todo) * 100)}%` : "—");

function tempo(horas: number | null) {
  if (horas == null) return "—";
  if (horas < 1) return "menos de 1 h";
  if (horas < 48) return `${Math.round(horas)} h`;
  return `${Math.round(horas / 24)} dias`;
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/admin/retorno">["searchParams"] }) {
  const c = await exigirAdminLocal();
  const sp = await searchParams;
  const pedido = primeiro(sp.periodo) ?? "30";
  const periodo = PERIODOS.some((p) => p.valor === pedido) ? pedido : "30";
  const contaPedida = primeiro(sp.conta);
  const conta = contaPedida && UUID.test(contaPedida) ? contaPedida : null;
  const agora = await agoraDaRequisicao();
  const desde = periodo === "tudo" ? null : new Date(agora - Number(periodo) * DIA).toISOString();

  const { data, error } = await c.rpc("admin_retorno_empresas", { p_desde: desde });
  if (error) {
    return (
      <Aviso tipo="alerta" titulo="Rode a migração do retorno">
        Falta a migração 20270127120000_retorno_das_empresas.sql neste banco.
      </Aviso>
    );
  }
  const { total, empresas } = data as unknown as { total: Total; empresas: Empresa[] };
  const escolhida = conta ? empresas.find((e) => e.conta_id === conta) : null;
  const linhas = conta
    ? (((await c.rpc("admin_retorno_da_empresa", { p_conta: conta, p_desde: desde })).data ??
        []) as unknown as Candidatura[])
    : [];
  const nomePeriodo = PERIODOS.find((p) => p.valor === periodo)!.nome.toLowerCase();
  // os matches sem contato, para o botão das perguntas (migração 20270202120000; sem ela, a seção não aparece)
  const semContato = (await c.rpc("admin_matches_sem_contato")).data as unknown as SemContato | null;

  return (
    <div className="flex flex-col gap-6">
      <Secao
        titulo="Retorno aos candidatos"
        descricao="Quem publica vagas respondeu quem se candidatou? Respondeu: aceitou, dispensou, mudou de etapa ou mandou mensagem. Contato: mensagem no Publike ou o WhatsApp, telefone ou e-mail aberto pelo botão do Publike (o que a empresa fala fora do Publike não aparece). As que deixam mais gente sem resposta há mais de 3 dias vêm primeiro."
      >
        <Filtros
          rotulo="Candidaturas dos últimos"
          opcoes={PERIODOS}
          atual={periodo}
          link={(v) => linkCom(BASE, { conta }, { periodo: v === "30" ? null : v })}
        />
        {total.candidaturas === 0 ? (
          <Vazio icone={MessageCircleQuestion} titulo="Nenhuma candidatura neste período" />
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Numero rotulo="Candidaturas" valor={formatarNumero(total.candidaturas)} />
              <Numero
                rotulo="Responderam"
                valor={pct(total.respondidas, total.candidaturas)}
                detalhe={`${formatarNumero(total.respondidas)} de ${formatarNumero(total.candidaturas)}`}
              />
              <Numero
                rotulo="Sem resposta há +3 dias"
                valor={formatarNumero(total.atrasadas)}
                detalhe={`${formatarNumero(total.sem_resposta)} sem resposta ao todo`}
                alerta={total.atrasadas > 0}
              />
              <Numero
                rotulo="Aceitos sem contato"
                valor={formatarNumero(total.aceitas_sem_contato)}
                detalhe={`de ${formatarNumero(total.aceitas)} aceitos`}
                alerta={total.aceitas_sem_contato > 0}
              />
            </dl>
            <TabelaEmpresas empresas={empresas} periodo={periodo} conta={conta} agora={agora} />
          </>
        )}
      </Secao>

      {semContato && <MatchesSemContato s={semContato} agora={agora} />}

      {conta && (
        <Secao
          id="candidaturas"
          titulo={escolhida ? `Candidaturas: ${escolhida.nome}` : "Candidaturas"}
          descricao={`As candidaturas dos últimos ${nomePeriodo}, a mais nova primeiro (até 300).`}
          acoes={
            <Link
              href={linkCom(BASE, { periodo: periodo === "30" ? null : periodo }, {})}
              className="text-body-sm underline"
            >
              Fechar
            </Link>
          }
        >
          {linhas.length === 0 ? (
            <p className="text-body-sm text-ink-muted">Nenhuma candidatura desta empresa no período.</p>
          ) : (
            <TabelaCandidaturas linhas={linhas} agora={agora} />
          )}
        </Secao>
      )}
    </div>
  );
}

type SemContato = {
  contas: number;
  matches: number;
  perguntas: number;
  prontas: number;
  exemplos: { nome: string; quantos: number; perguntaveis: number; avisada_em: string | null }[];
};

/** Os aceitos sem contato em vaga no ar, com o botão que pergunta no chat e avisa as empresas. */
function MatchesSemContato({ s, agora }: { s: SemContato; agora: number }) {
  return (
    <Secao
      id="sem-contato"
      titulo="Matches sem contato"
      descricao="Aceitos em vaga no ar nos últimos 60 dias, sem mensagem nem contato da empresa. O botão faz no chat as perguntas do match a quem ainda não recebeu (“Ainda tem interesse em…?”; as respostas chegam para a empresa) e avisa cada empresa, no máximo uma vez a cada 7 dias."
      acoes={<PerguntarNosMatches perguntas={s.perguntas} prontas={s.prontas} />}
    >
      {s.matches === 0 ? (
        <p className="text-body-sm text-ink-muted">Nenhum match esperando contato agora.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Numero
              rotulo="Matches sem contato"
              valor={formatarNumero(s.matches)}
              detalhe={s.contas === 1 ? "de 1 empresa" : `de ${formatarNumero(s.contas)} empresas`}
              alerta
            />
            <Numero
              rotulo="Recebem as perguntas"
              valor={formatarNumero(s.perguntas)}
              detalhe="ainda não receberam no chat"
            />
            <Numero
              rotulo="Empresas para avisar"
              valor={formatarNumero(s.prontas)}
              detalhe="sem aviso nos últimos 7 dias"
            />
          </dl>
          <ul
            aria-label="As empresas com mais gente esperando"
            className="flex flex-col divide-y divide-line text-body-sm"
          >
            {s.exemplos.map((e) => (
              <li key={e.nome} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
                <span className="font-semibold">{e.nome}</span>
                <span className="text-ink-muted">
                  {e.quantos === 1 ? "1 esperando" : `${e.quantos} esperando`}
                  {e.perguntaveis ? ` · ${e.perguntaveis} recebem as perguntas` : ""}
                  {e.avisada_em ? ` · avisada ${tempoRelativo(e.avisada_em, agora)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Secao>
  );
}

function Numero({
  rotulo,
  valor,
  detalhe,
  alerta = false,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  alerta?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-line bg-surface-100 px-4 py-3">
      <dt className="text-body-sm text-ink-muted">{rotulo}</dt>
      <dd className={`text-h3 tabular-nums ${alerta ? "text-danger" : ""}`}>{valor}</dd>
      {detalhe && <dd className="text-caption text-ink-muted">{detalhe}</dd>}
    </div>
  );
}

function TabelaEmpresas({
  empresas,
  periodo,
  conta,
  agora,
}: {
  empresas: Empresa[];
  periodo: string;
  conta: string | null;
  agora: number;
}) {
  const th = "py-2 pr-3 font-medium";
  return (
    <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[52rem] text-left text-body-sm">
        <thead className="text-label text-ink-muted">
          <tr className="border-b border-line">
            <th scope="col" className={th}>
              Empresa
            </th>
            <th scope="col" className={`${th} text-right`}>
              Candidaturas
            </th>
            <th scope="col" className={`${th} text-right`}>
              Viu
            </th>
            <th scope="col" className={`${th} text-right`}>
              Respondeu
            </th>
            <th scope="col" className={`${th} text-right`}>
              Sem resposta
            </th>
            <th scope="col" className={`${th} text-right`}>
              Contato
            </th>
            <th scope="col" className={`${th} text-right`}>
              Responde em
            </th>
            <th scope="col" className="py-2 font-medium">
              Última ação
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {empresas.map((e) => (
            <tr key={e.conta_id} className={`align-top ${conta === e.conta_id ? "bg-surface-300" : ""}`}>
              <td className="py-2 pr-3">
                <span className="flex min-w-0 flex-col">
                  <Link
                    href={`${linkCom(BASE, { periodo: periodo === "30" ? null : periodo }, { conta: e.conta_id })}#candidaturas`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {e.nome}
                  </Link>
                  <span className="text-caption text-ink-muted">
                    {rotuloConta(e.tipo)} ·{" "}
                    <Link href={`/admin/usuarios/${e.conta_id}`} className="underline-offset-2 hover:underline">
                      ficha
                    </Link>
                  </span>
                </span>
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatarNumero(e.candidaturas)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{pct(e.vistas, e.candidaturas)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {pct(e.respondidas, e.candidaturas)}
                <span className="block text-caption text-ink-muted">
                  {e.aceitas} aceitos · {e.dispensadas} dispensados
                </span>
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {e.sem_resposta}
                {e.atrasadas > 0 && (
                  <span className="block">
                    <Selo variante="perigo">{e.atrasadas} há +3 dias</Selo>
                  </span>
                )}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {e.com_contato}
                {e.aceitas_sem_contato > 0 && (
                  <span className="block text-caption text-danger">{e.aceitas_sem_contato} aceitos sem contato</span>
                )}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{tempo(e.horas_resposta)}</td>
              <td className="py-2 whitespace-nowrap text-ink-muted">
                {e.ultima_acao ? tempoRelativo(e.ultima_acao, agora) : "nenhuma"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ETAPA: Record<string, string> = {
  novo: "Novo",
  analise: "Em análise",
  entrevista: "Entrevista",
  contratado: "Contratado",
  nao_seguiu: "Não seguiu",
};

function situacao(l: Candidatura, agora: number): { texto: string; ruim: boolean } {
  if (!l.respondida) {
    const dias = Math.floor((agora - new Date(l.criado_em).getTime()) / DIA);
    return { texto: dias >= 3 ? `Sem resposta há ${dias} dias` : "Sem resposta ainda", ruim: dias >= 3 };
  }
  if (l.status === "dispensada" || l.etapa === "nao_seguiu") return { texto: "Dispensado", ruim: false };
  if (l.status === "desfeito") return { texto: "Aceito, depois desfeito", ruim: false };
  if (l.status === "match")
    return { texto: `Aceito${l.etapa && l.etapa !== "novo" ? ` · ${ETAPA[l.etapa] ?? l.etapa}` : ""}`, ruim: false };
  return { texto: l.etapa ? (ETAPA[l.etapa] ?? l.etapa) : "Respondido por mensagem", ruim: false };
}

function TabelaCandidaturas({ linhas, agora }: { linhas: Candidatura[]; agora: number }) {
  const th = "py-2 pr-3 font-medium";
  return (
    <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[48rem] text-left text-body-sm">
        <thead className="text-label text-ink-muted">
          <tr className="border-b border-line">
            <th scope="col" className={th}>
              Candidato
            </th>
            <th scope="col" className={th}>
              Vaga
            </th>
            <th scope="col" className={th}>
              Situação
            </th>
            <th scope="col" className={th}>
              Contato
            </th>
            <th scope="col" className="py-2 font-medium">
              Avisado
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {linhas.map((l) => {
            const s = situacao(l, agora);
            const aceito = l.status === "match" || l.status === "desfeito";
            return (
              <tr key={`${l.anuncio_id}-${l.perfil_id}`} className="align-top">
                <td className="py-2 pr-3">
                  <span className="flex min-w-0 flex-col">
                    <Link
                      href={`/admin/usuarios/${l.perfil_id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {l.nome ?? "Conta excluída"}
                    </Link>
                    <span className="text-caption text-ink-muted">
                      candidatou-se {tempoRelativo(l.criado_em, agora)}
                      {l.vista_em ? " · empresa viu" : " · empresa não viu"}
                    </span>
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <Link href={`/admin/anuncios/${l.anuncio_id}`} className="underline-offset-2 hover:underline">
                    {l.vaga}
                  </Link>
                </td>
                <td className={`py-2 pr-3 ${s.ruim ? "text-danger" : ""}`}>
                  {s.texto}
                  {l.respondida_em && (
                    <span className="block text-caption text-ink-muted">
                      respondeu {tempoRelativo(l.respondida_em, agora)}
                    </span>
                  )}
                </td>
                <td className={`py-2 pr-3 ${aceito && !l.com_contato ? "text-danger" : ""}`}>
                  {l.mensagens > 0 && (
                    <span className="block">
                      {l.mensagens} {l.mensagens === 1 ? "mensagem" : "mensagens"}
                      {l.ultima_mensagem ? `, a última ${tempoRelativo(l.ultima_mensagem, agora)}` : ""}
                    </span>
                  )}
                  {l.contato_em && (
                    <span className="block">
                      Abriu o contato (WhatsApp, telefone ou e-mail) {tempoRelativo(l.contato_em, agora)}
                    </span>
                  )}
                  {!l.com_contato && (aceito ? "Aceito, mas sem contato registrado" : "—")}
                </td>
                <td className="py-2 text-ink-muted">{l.avisada ? "Sim, pelo Publike" : "Não"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
