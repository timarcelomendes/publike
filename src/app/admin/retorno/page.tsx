import { MessageCircleQuestion } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { PerguntarNosMatches } from "@/components/admin/matches-sem-contato";
import { Filtros, linkCom, Secao } from "@/components/admin/ui";
import { Aviso, Selo, Vazio } from "@/components/ui/basicos";
import { formatarNumero, plural, primeiro, rotuloConta, tempoRelativo } from "@/lib/formato";
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
  // as três perguntas (migração 20270526120000; sem ela, a seção não aparece)
  const dias = periodo === "tudo" ? 365 : Number(periodo);
  const tres = (await c.rpc("admin_respostas_do_retorno", { p_dias: dias })).data as unknown as Tres | null;
  // a lista de "A empresa te respondeu?" (migração 20270530120000; sem ela, a seção não aparece)
  const respostas = (await c.rpc("admin_lista_te_respondeu", { p_dias: dias })).data as unknown as
    | RespostaDoCandidato[]
    | null;
  const filtroPedido = primeiro(sp.resposta);
  const filtro = FILTROS_RESPOSTA.some((f) => f.valor === filtroPedido) ? filtroPedido! : "todas";

  return (
    <div className="flex flex-col gap-6">
      {respostas && (
        <EmpresaRespondeu
          linhas={respostas}
          periodo={periodo}
          nomePeriodo={nomePeriodo}
          filtro={filtro}
          conta={conta}
          agora={agora}
        />
      )}
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

      {tres && <TresPerguntas t={tres} periodo={nomePeriodo} />}

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
  // da migração 20270207120000 (sem ela, a tela fica como antes)
  aceitos?: number;
  contas_aceitos?: number;
  direto?: number;
  nunca_entraram?: number;
  mandadas?: number;
  responderam?: number;
  na_fila?: number;
  exemplos: {
    nome: string;
    quantos: number;
    perguntaveis: number;
    avisada_em: string | null;
    direto?: number;
    responderam?: number;
    nunca_entrou?: boolean;
  }[];
};

/** O número que veio do banco (0 se não veio: a tela nunca mostra NaN). */
function num(x: unknown) {
  return typeof x === "number" && Number.isFinite(x) ? x : 0;
}

/**
 * Os aceitos sem contato em vaga no ar, com o botão que pergunta no chat e avisa as empresas. Os de vaga de contato
 * direto (curtir já é o match e o WhatsApp é liberado) ficam à parte; as perguntas mostram o que já foi mandado.
 */
function MatchesSemContato({ s, agora }: { s: SemContato; agora: number }) {
  const novo = typeof s.aceitos === "number";
  const aceitos = novo ? num(s.aceitos) : num(s.matches);
  const contas = novo ? num(s.contas_aceitos) : num(s.contas);
  const direto = num(s.direto);
  const paraMandar = num(s.perguntas);
  const detalhePerguntas = [
    `${formatarNumero(num(s.responderam))} responderam`,
    num(s.na_fila) ? `${formatarNumero(num(s.na_fila))} na fila` : "",
    paraMandar ? `${formatarNumero(paraMandar)} para mandar` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Secao
      id="sem-contato"
      titulo="Matches sem contato"
      descricao="Aceitos em vaga no ar nos últimos 60 dias, sem mensagem nem contato da empresa pelo Publike. Nas vagas de contato direto, curtir já é o match e o WhatsApp é liberado: o contato pode ter sido por lá. O botão faz no chat as perguntas do match a quem ainda não recebeu (“Ainda tem interesse em…?”; as respostas ficam na conversa e na ficha do candidato) e avisa cada empresa, no máximo uma vez a cada 7 dias."
      acoes={<PerguntarNosMatches perguntas={paraMandar} prontas={num(s.prontas)} />}
    >
      {num(s.matches) === 0 ? (
        <p className="text-body-sm text-ink-muted">Nenhum match esperando contato agora.</p>
      ) : (
        <>
          <dl className={`grid grid-cols-2 gap-3 ${novo ? "lg:grid-cols-4" : "sm:grid-cols-3"}`}>
            <Numero
              rotulo="Matches sem contato"
              valor={formatarNumero(aceitos)}
              detalhe={
                novo
                  ? `a empresa aceitou e não chamou${contas ? ` (${contas === 1 ? "1 empresa" : `${formatarNumero(contas)} empresas`})` : ""}`
                  : contas === 1
                    ? "de 1 empresa"
                    : `de ${formatarNumero(contas)} empresas`
              }
              alerta={aceitos > 0}
            />
            {novo && (
              <Numero
                rotulo="Contato direto"
                valor={formatarNumero(direto)}
                detalhe="o WhatsApp já foi liberado no match"
              />
            )}
            {novo ? (
              <Numero rotulo="Perguntas mandadas" valor={formatarNumero(num(s.mandadas))} detalhe={detalhePerguntas} />
            ) : (
              <Numero
                rotulo="Recebem as perguntas"
                valor={formatarNumero(paraMandar)}
                detalhe="ainda não receberam no chat"
              />
            )}
            <Numero
              rotulo="Empresas para avisar"
              valor={formatarNumero(num(s.prontas))}
              detalhe="sem aviso nos últimos 7 dias"
            />
          </dl>
          {novo && num(s.nunca_entraram) > 0 && (
            <p className="text-body-sm text-ink-muted">
              {num(s.nunca_entraram) === 1
                ? "1 empresa nunca entrou no Publike: o aviso e as respostas ficam esperando ela entrar."
                : `${formatarNumero(num(s.nunca_entraram))} empresas nunca entraram no Publike: o aviso e as respostas ficam esperando elas entrarem.`}
            </p>
          )}
          <ul
            aria-label="As empresas com mais gente esperando"
            className="flex flex-col divide-y divide-line text-body-sm"
          >
            {s.exemplos.map((e) => (
              <li key={e.nome} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{e.nome}</span>
                  {e.nunca_entrou && <Selo title="A conta nunca entrou no Publike">Nunca entrou</Selo>}
                </span>
                <span className="text-ink-muted">
                  {num(e.quantos) === 1 ? "1 esperando" : `${formatarNumero(num(e.quantos))} esperando`}
                  {num(e.direto) ? ` · ${formatarNumero(num(e.direto))} de contato direto` : ""}
                  {novo
                    ? num(e.responderam)
                      ? ` · ${num(e.responderam) === 1 ? "1 respondeu" : `${formatarNumero(num(e.responderam))} responderam`}`
                      : ""
                    : num(e.perguntaveis)
                      ? ` · ${formatarNumero(num(e.perguntaveis))} recebem as perguntas`
                      : ""}
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

type Tres = {
  te_respondeu: { perguntadas: number; sim: number; ainda_nao: number; desisti: number; sem_resposta: number };
  quem_contratou: { respostas: number; daqui: number; pessoas: number; ninguem: number };
  comecou: {
    pessoa_comecei: number;
    pessoa_nao_deu: number;
    empresa_confirmou: number;
    empresa_negou: number;
    chamaria_sim: number;
    chamaria_nao: number;
  };
};

/** O que as três perguntas contam sobre o que aconteceu fora do Publike (no WhatsApp). */
function TresPerguntas({ t, periodo }: { t: Tres; periodo: string }) {
  const r = t.te_respondeu;
  const respondidas = r.sim + r.ainda_nao + r.desisti;
  const q = t.quem_contratou;
  const k = t.comecou;
  return (
    <Secao
      titulo="O que os candidatos e as empresas contaram"
      descricao={`As três perguntas dos últimos ${periodo}: “A empresa te respondeu?” (2 dias depois do contato), “Quem você contratou?” (ao encerrar a vaga ou marcar como preenchida) e, 7 dias depois, “Começou a trabalhar?” e “Chamaria de novo?”.`}
    >
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero
          rotulo="A empresa respondeu"
          valor={pct(r.sim, respondidas)}
          detalhe={`${formatarNumero(r.sim)} sim, ${formatarNumero(r.ainda_nao)} ainda não, ${formatarNumero(r.desisti)} desistiram (${formatarNumero(r.perguntadas)} perguntados)`}
          alerta={r.ainda_nao > r.sim}
        />
        <Numero
          rotulo="Contrataram pelo Publike"
          valor={formatarNumero(q.daqui)}
          detalhe={`${formatarNumero(q.pessoas)} pessoas; ${formatarNumero(q.ninguem)} disseram ninguém daqui`}
        />
        <Numero
          rotulo="Começaram a trabalhar"
          valor={formatarNumero(Math.max(k.pessoa_comecei, k.empresa_confirmou))}
          detalhe={`${formatarNumero(k.pessoa_comecei)} pela pessoa, ${formatarNumero(k.empresa_confirmou)} pela empresa`}
        />
        <Numero
          rotulo="Chamariam de novo"
          valor={pct(k.chamaria_sim, k.chamaria_sim + k.chamaria_nao)}
          detalhe={`${formatarNumero(k.chamaria_sim)} sim, ${formatarNumero(k.chamaria_nao)} não`}
        />
      </dl>
    </Secao>
  );
}

// "A empresa te respondeu?" (migração 20270530120000; 15/11/2026, Marcelo: "quero uma visao compreensível disso"):
// a frase do período, a barra das respostas e as empresas (a que deixa mais gente esperando primeiro), cada uma com os
// candidatos perguntados.

type RespostaDoCandidato = {
  anuncio_id: string;
  perfil_id: string;
  titulo: string;
  empresa_id: string;
  empresa: string | null;
  pessoa: string;
  perguntas: number;
  perguntada_em: string;
  resposta: "sim" | "ainda_nao" | "desisti" | null;
  respondida_em: string | null;
  empresa_avisada_em: string | null;
};

const FILTROS_RESPOSTA = [
  { valor: "todas", nome: "Todas" },
  { valor: "ainda_nao", nome: "Ainda esperam" },
  { valor: "sim", nome: "Responderam" },
  { valor: "desisti", nome: "Desistiram" },
  { valor: "sem", nome: "Sem resposta" },
];

const RESPOSTAS = {
  sim: { nome: "A empresa respondeu", curto: "Respondeu", cor: "bg-cerrado", selo: "match" as const },
  ainda_nao: { nome: "Ainda esperam", curto: "Ainda espera", cor: "bg-terra", selo: "aviso" as const },
  desisti: { nome: "Desistiram", curto: "Desistiu", cor: "bg-ink-muted", selo: "contorno" as const },
  sem: { nome: "Não responderam a pergunta", curto: "Sem resposta", cor: "bg-surface-300", selo: "neutro" as const },
};
type ChaveResposta = keyof typeof RESPOSTAS;
const chaveDa = (l: RespostaDoCandidato): ChaveResposta => l.resposta ?? "sem";
const ORDEM_RESPOSTA: Record<ChaveResposta, number> = { ainda_nao: 0, sim: 1, desisti: 2, sem: 3 };

function contar(linhas: RespostaDoCandidato[]) {
  const c: Record<ChaveResposta, number> = { sim: 0, ainda_nao: 0, desisti: 0, sem: 0 };
  for (const l of linhas) c[chaveDa(l)]++;
  return c;
}

function EmpresaRespondeu({
  linhas,
  periodo,
  nomePeriodo,
  filtro,
  conta,
  agora,
}: {
  linhas: RespostaDoCandidato[];
  periodo: string;
  nomePeriodo: string;
  filtro: string;
  conta: string | null;
  agora: number;
}) {
  const total = linhas.length;
  const c = contar(linhas);
  const responderam = c.sim + c.ainda_nao + c.desisti;
  const visiveis = filtro === "todas" ? linhas : linhas.filter((l) => chaveDa(l) === filtro);
  // por empresa: quem deixa mais gente esperando primeiro, depois quem tem mais perguntas
  const porEmpresa = new Map<string, { nome: string; linhas: RespostaDoCandidato[] }>();
  for (const l of visiveis) {
    const e = porEmpresa.get(l.empresa_id) ?? { nome: l.empresa ?? "Empresa sem nome", linhas: [] };
    e.linhas.push(l);
    porEmpresa.set(l.empresa_id, e);
  }
  const empresas = [...porEmpresa.entries()]
    // dentro da empresa: quem ainda espera primeiro
    .map(([id, e]) => ({
      id,
      ...e,
      linhas: [...e.linhas].sort((a, b) => ORDEM_RESPOSTA[chaveDa(a)] - ORDEM_RESPOSTA[chaveDa(b)]),
      n: contar(e.linhas),
    }))
    .sort((a, b) => b.n.ainda_nao - a.n.ainda_nao || b.linhas.length - a.linhas.length || a.nome.localeCompare(b.nome));

  return (
    <Secao
      id="empresa-respondeu"
      titulo="A empresa respondeu o candidato?"
      descricao="Dois dias depois do contato numa vaga, o Publike pergunta ao candidato se a empresa respondeu. Quem diz “Ainda não” faz a empresa receber o aviso de que a pessoa espera."
    >
      {total === 0 ? (
        <Vazio icone={MessageCircleQuestion} titulo={`Ninguém foi perguntado nos últimos ${nomePeriodo}`} />
      ) : (
        <div className="flex flex-col gap-5">
          <p className="max-w-3xl text-body">
            Nos últimos {nomePeriodo}, {plural(total, "candidato foi perguntado", "candidatos foram perguntados")}.{" "}
            {responderam === 0
              ? "Ninguém respondeu a pergunta ainda."
              : `${plural(responderam, "respondeu", "responderam")}: ${formatarNumero(c.sim)} ${c.sim === 1 ? "disse" : "disseram"} que a empresa respondeu, ${formatarNumero(c.ainda_nao)} ainda ${c.ainda_nao === 1 ? "espera" : "esperam"} e ${formatarNumero(c.desisti)} ${c.desisti === 1 ? "desistiu" : "desistiram"}.`}
          </p>

          <div className="flex flex-col gap-2">
            <div className="flex h-3 w-full overflow-hidden rounded-pill bg-surface-300" aria-hidden>
              {(["sim", "ainda_nao", "desisti", "sem"] as const).map((k) =>
                c[k] > 0 ? <span key={k} className={RESPOSTAS[k].cor} style={{ width: `${(100 * c[k]) / total}%` }} /> : null,
              )}
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-body-sm">
              {(["sim", "ainda_nao", "desisti", "sem"] as const).map((k) => (
                <li key={k} className="inline-flex items-center gap-1.5">
                  <span aria-hidden className={`size-2.5 rounded-full ${RESPOSTAS[k].cor}`} />
                  {RESPOSTAS[k].nome}: <span className="text-label tabular-nums">{formatarNumero(c[k])}</span>
                </li>
              ))}
            </ul>
          </div>

          <Filtros
            rotulo="Mostrar"
            opcoes={FILTROS_RESPOSTA.map((f) => ({
              ...f,
              numero: f.valor === "todas" ? total : c[f.valor as ChaveResposta],
            }))}
            atual={filtro}
            link={(v) =>
              linkCom(BASE, { periodo: periodo === "30" ? null : periodo, conta }, { resposta: v === "todas" ? null : v }) +
              "#empresa-respondeu"
            }
          />

          {empresas.length === 0 ? (
            <p className="text-body-sm text-ink-muted">Nenhuma pergunta com essa resposta no período.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
              {empresas.map((e) => (
                <li key={e.id}>
                  <details className="group" open={e.n.ainda_nao > 0 && empresas.length <= 5}>
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-4 gap-y-1 p-3 hover:bg-surface-300 [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0">
                        <span className="text-label">{e.nome}</span>
                        <span className="text-body-sm text-ink-muted">
                          {" "}
                          · {plural(e.linhas.length, "candidato perguntado", "candidatos perguntados")}
                        </span>
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        {(["ainda_nao", "sim", "desisti", "sem"] as const).map((k) =>
                          e.n[k] > 0 ? (
                            <Selo key={k} variante={RESPOSTAS[k].selo}>
                              {e.n[k]} {RESPOSTAS[k].curto.toLowerCase()}
                            </Selo>
                          ) : null,
                        )}
                      </span>
                    </summary>
                    <ul className="flex flex-col gap-2 px-3 pb-3">
                      {e.linhas.map((l) => (
                        <li
                          key={`${l.anuncio_id}:${l.perfil_id}`}
                          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md bg-surface-200 px-3 py-2 text-body-sm"
                        >
                          <span className="min-w-0">
                            <span className="font-semibold">{l.pessoa}</span>
                            <span className="text-ink-muted"> · </span>
                            <Link href={`/anuncio/${l.anuncio_id}`} className="underline-offset-2 hover:underline">
                              {l.titulo}
                            </Link>
                            <span className="block text-caption text-ink-muted">
                              Perguntado {tempoRelativo(l.perguntada_em, agora)}
                              {l.perguntas > 1 ? " (2ª vez)" : ""}
                              {l.respondida_em ? `, respondeu ${tempoRelativo(l.respondida_em, agora)}` : ""}
                              {l.empresa_avisada_em ? `; a empresa foi avisada ${tempoRelativo(l.empresa_avisada_em, agora)}` : ""}
                            </span>
                          </span>
                          <Selo variante={RESPOSTAS[chaveDa(l)].selo}>{RESPOSTAS[chaveDa(l)].curto}</Selo>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Secao>
  );
}
