import type { ReactNode } from "react";
import { Secao } from "./ui";
import type { MetricasProduto } from "@/lib/admin/dados";
import { formatarNumero, plural } from "@/lib/formato";

// As métricas de produto do Painel (Admin › Painel e /equipe; migração 20261207120000_metricas_de_produto.sql):
// a estrela-guia, os ativos, o crescimento, a ativação, a retenção, o churn, os funis e a liquidez das vagas.
// Só números. Os gráficos são SVG simples, como os outros do admin, e cada um tem a tabela ao lado (ou
// escondida para o leitor de tela).

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((100 * n) / d)}%` : "—");

function horas(h: number | null | undefined) {
  if (h == null) return "—";
  if (h < 1) return "menos de 1 h";
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} dias`;
}

/** "12% a mais que a semana anterior"; sem nada nas duas, nada. */
function variacao(atual: number, antes: number, quando: "semana" | "mes") {
  const de = quando === "semana" ? "a semana anterior" : "os 30 dias antes";
  if (antes <= 0) return atual > 0 ? (quando === "semana" ? "na semana anterior: 0" : "nos 30 dias antes: 0") : null;
  const v = Math.round(((atual - antes) / antes) * 100);
  if (v === 0) return quando === "semana" ? "igual à semana anterior" : "igual aos 30 dias antes";
  return `${Math.abs(v)}% a ${v > 0 ? "mais" : "menos"} que ${de}`;
}

function diaMes(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** Um cartão de número: o nome, o valor e uma linha embaixo (o mesmo jeito dos cartões do Painel). */
function Indicador({
  rotulo,
  valor,
  detalhe,
  nota,
}: {
  rotulo: string;
  valor: string;
  detalhe?: ReactNode;
  nota?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface-200 p-4">
      <span className="text-label text-ink-muted">{rotulo}</span>
      <span className="font-display text-h1 text-ink">{valor}</span>
      {detalhe && <span className="text-body-sm text-ink">{detalhe}</span>}
      {nota && <span className="text-body-sm text-ink-muted">{nota}</span>}
    </div>
  );
}

/** Barras das 8 semanas (a última é a semana até hoje), com a tabela para o leitor de tela. */
function BarrasDaSemana({
  titulo,
  semanas,
  valor,
}: {
  titulo: string;
  semanas: MetricasProduto["semanas"];
  valor: (s: MetricasProduto["semanas"][number]) => number;
}) {
  const valores = semanas.map(valor);
  const maior = Math.max(...valores, 0);
  const altura = 64;
  const largura = semanas.length * 24;
  const atual = valores.at(-1) ?? 0;
  const antes = valores.at(-2) ?? 0;
  const mudou = variacao(atual, antes, "semana");
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-label">{titulo}</span>
        <span className="text-body-sm text-ink-muted">
          {formatarNumero(atual)} nesta semana{mudou ? ` · ${mudou}` : ""}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${largura} ${altura}`} preserveAspectRatio="none" aria-hidden className="h-16 w-full">
        {valores.map((v, i) => {
          const h = maior ? Math.max(v > 0 ? 3 : 1, (v / maior) * (altura - 2)) : 1;
          return (
            <rect
              key={semanas[i].inicio}
              x={i * 24 + 2}
              y={altura - h}
              width={20}
              height={h}
              rx={2}
              className={v > 0 ? (i === valores.length - 1 ? "fill-ink" : "fill-ink-muted") : "fill-line"}
            >
              <title>{`${diaMes(semanas[i].inicio)} a ${diaMes(semanas[i].fim)}: ${formatarNumero(v)}`}</title>
            </rect>
          );
        })}
      </svg>
      <div aria-hidden className="flex justify-between text-caption font-normal text-ink-muted">
        <span>{semanas[0] ? diaMes(semanas[0].inicio) : ""}</span>
        <span>esta semana</span>
      </div>
      <table className="sr-only">
        <caption>{titulo} por semana</caption>
        <tbody>
          {semanas.map((s, i) => (
            <tr key={s.inicio}>
              <th scope="row">{`${diaMes(s.inicio)} a ${diaMes(s.fim)}`}</th>
              <td>{valores[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Uma etapa do funil: o número, a parte da primeira etapa e a barra do mesmo tamanho. */
function Funil({ titulo, etapas }: { titulo: string; etapas: { nome: string; n: number }[] }) {
  const base = etapas[0]?.n ?? 0;
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-label">{titulo}</h3>
      <ol className="flex flex-col gap-2.5">
        {etapas.map((e, i) => (
          <li key={e.nome} className="flex flex-col gap-1">
            <span className="flex items-baseline justify-between gap-3 text-body-sm">
              <span>{e.nome}</span>
              <span className="tabular-nums">
                {formatarNumero(e.n)}
                {i > 0 && <span className="text-ink-muted"> · {pct(e.n, base)}</span>}
              </span>
            </span>
            <span className="h-2 rounded-pill bg-surface-300">
              <span
                className="block h-2 rounded-pill bg-ink"
                style={{ width: base ? `${Math.max(e.n > 0 ? 2 : 0, (e.n / base) * 100)}%` : "0%" }}
              />
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * O tom da célula: uma cor só (a tinta), mais forte quanto maior o %. Vai de 4% a 38% de tinta, para o
 * texto em tinta ler bem nos dois temas (contraste de 4,5 ou mais).
 */
const tomDaCelula = (p: number) => `color-mix(in oklab, var(--pk-ink) ${Math.round(4 + (34 * p) / 100)}%, transparent)`;

/** A tabela de retenção: cada linha é uma semana de cadastro; o tom acompanha o %. */
function TabelaDeRetencao({ linhas }: { linhas: MetricasProduto["retencao"] }) {
  const comContas = linhas.filter((l) => l.tamanho > 0);
  if (!comContas.length) return <p className="text-body-sm text-ink-muted">Sem contas novas nas últimas 8 semanas.</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="min-w-max border-separate border-spacing-0.5 text-body-sm">
          <caption className="sr-only">
            Retenção por semana de cadastro: a parte de cada turma que usou o Publike em cada semana depois do cadastro
          </caption>
          <thead>
            <tr className="text-ink-muted">
              <th scope="col" className="py-1 pr-3 text-left font-normal">
                Cadastro
              </th>
              <th scope="col" className="py-1 pr-3 text-right font-normal">
                Contas
              </th>
              {[1, 2, 3, 4].map((w) => (
                <th key={w} scope="col" className="w-20 px-1 py-1 text-center font-normal">
                  Semana {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.inicio} className={l.tamanho === 0 ? "text-ink-muted" : undefined}>
                <th scope="row" className="py-1 pr-4 text-left font-normal whitespace-nowrap">
                  {diaMes(l.inicio)} a {diaMes(l.fim)}
                </th>
                <td className="py-1 pr-3 text-right tabular-nums">{formatarNumero(l.tamanho)}</td>
                {l.semanas.map((n, i) => {
                  // sem contas na turma, a linha fica vazia; a semana que não terminou, o traço
                  if (l.tamanho === 0) return <td key={i} />;
                  if (n === null) {
                    return (
                      <td key={i} className="rounded-sm py-1 text-center text-ink-muted">
                        —
                      </td>
                    );
                  }
                  const p = Math.round((100 * n) / l.tamanho);
                  return (
                    <td
                      key={i}
                      title={`${formatarNumero(n)} de ${formatarNumero(l.tamanho)}`}
                      className="rounded-sm py-1 text-center text-ink tabular-nums"
                      style={{ backgroundColor: tomDaCelula(p) }}
                    >
                      {p}%
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 text-caption text-ink-muted" aria-hidden>
        <span>0%</span>
        <span
          className="h-2 w-28 rounded-pill"
          style={{
            backgroundImage: `linear-gradient(to right, ${tomDaCelula(0)}, ${tomDaCelula(100)})`,
          }}
        />
        <span>100%</span>
        <span className="ml-2">— a semana ainda não terminou para todos</span>
      </div>
    </div>
  );
}

export function MetricasDeProduto({ m }: { m: MetricasProduto }) {
  const s = m.semanas;
  const estaSemana = s.at(-1);
  const semanaAntes = s.at(-2);
  const a = m.ativos;
  const at = m.ativacao;
  const v = m.voltaram;
  const f = m.funil;
  const l = m.liquidez;
  const aderencia = a.mau > 0 && a.dau_media != null ? `${Math.round((100 * a.dau_media) / a.mau)}%` : "—";
  const pessoasPorVaga = l.vagas_no_ar > 0 ? (a.mau_pessoas / l.vagas_no_ar).toFixed(1).replace(".", ",") : "—";

  return (
    <Secao
      titulo="Métricas de produto"
      descricao={
        <>
          As mais usadas em produto digital. Conta ativa é a que entrou no site ou fez alguma coisa no dia (curtir,
          publicar, responder, mandar mensagem, salvar o currículo).
          {m.desde && ` Entrar no site conta desde ${diaMes(m.desde)}; antes, só as ações.`}
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          rotulo="Estrela-guia: matches na semana"
          valor={formatarNumero(estaSemana?.matches ?? 0)}
          detalhe={variacao(estaSemana?.matches ?? 0, semanaAntes?.matches ?? 0, "semana") ?? undefined}
          nota="Quem procura e quem contrata se acharam"
        />
        <Indicador
          rotulo="Ativos no mês (MAU)"
          valor={formatarNumero(a.mau)}
          detalhe={variacao(a.mau, a.mau_antes, "mes") ?? undefined}
          nota={`${formatarNumero(a.mau_pessoas)} procuram · ${formatarNumero(a.mau_empresas)} contratam`}
        />
        <Indicador
          rotulo="Ativos na semana (WAU)"
          valor={formatarNumero(a.wau)}
          detalhe={`${formatarNumero(a.dau_hoje)} hoje`}
          nota={`Por dia (DAU), na média: ${a.dau_media == null ? "—" : formatarNumero(a.dau_media)}`}
        />
        <Indicador
          rotulo="Aderência (DAU ÷ MAU)"
          valor={aderencia}
          detalhe={
            a.dias_por_conta == null ? undefined : `${formatarNumero(a.dias_por_conta)} dias de uso por conta no mês`
          }
          nota="Quanto do mês as contas ativas voltam"
        />
        <Indicador
          rotulo="Ativação em 7 dias"
          valor={pct(at.ativadas, at.contas)}
          detalhe={`Pessoas ${pct(at.pessoas_ativadas, at.pessoas)} · empresas ${pct(at.empresas_ativadas, at.empresas)}`}
          nota={`Contas de 8 a 37 dias: ${formatarNumero(at.contas)} · mediana de ${horas(at.mediana_horas)}`}
        />
        <Indicador
          rotulo="Voltaram em até 7 dias"
          valor={pct(v["7"].voltaram, v["7"].base)}
          detalhe={`No dia seguinte ${pct(v["1"].voltaram, v["1"].base)} · em 30 dias ${pct(v["30"].voltaram, v["30"].base)}`}
          nota={`Contas dos últimos 90 dias: ${formatarNumero(v["7"].base)}`}
        />
        <Indicador
          rotulo="Churn do mês"
          valor={pct(m.churn.sairam, m.churn.base)}
          detalhe={`${formatarNumero(m.churn.sairam)} de ${plural(m.churn.base, "conta", "contas")} pararam`}
          nota="Usavam nos 30 dias antes e não voltaram nestes 30"
        />
        <Indicador
          rotulo="Vagas com candidato em 7 dias"
          valor={pct(l.com_candidato_7d, l.vagas)}
          detalhe={`O primeiro chega em ${horas(l.mediana_horas_primeiro)} (mediana)`}
          nota={`Vagas de 8 a 37 dias: ${formatarNumero(l.vagas)}`}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <BarrasDaSemana titulo="Matches por semana" semanas={s} valor={(x) => x.matches} />
        <BarrasDaSemana titulo="Contas novas por semana" semanas={s} valor={(x) => x.contas} />
        <BarrasDaSemana titulo="Ativos por semana" semanas={s} valor={(x) => x.ativos} />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-label">Retenção por semana de cadastro</h3>
        <p className="text-body-sm text-ink-muted">
          De cada turma de contas novas, quantas usaram o Publike em cada semana depois do cadastro.
        </p>
        <TabelaDeRetencao linhas={m.retencao} />
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-body-sm text-ink-muted">
          Funis das contas criadas nos últimos 30 dias: {formatarNumero(f.contas)} contas,{" "}
          {formatarNumero(f.contas - f.com_perfil)} sem perfil.{" "}
          {f.visitas > 0 &&
            `${formatarNumero(f.visitas)} visitas de quem não entrou na conta: ${formatarNumero(
              Math.round((1000 * f.contas) / f.visitas) / 10,
            )} contas novas a cada 100 visitas.`}
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          <Funil
            titulo="Quem procura trabalho"
            etapas={[
              { nome: "Perfil de pessoa", n: f.pessoas },
              { nome: "Fez o currículo", n: f.curriculo },
              { nome: "Curtiu uma vaga", n: f.curtiu },
              { nome: "Deu match", n: f.match },
            ]}
          />
          <Funil
            titulo="Quem contrata"
            etapas={[
              { nome: "Perfil de empresa, comércio ou agência", n: f.empresas },
              { nome: "Publicou uma vaga", n: f.vaga },
              { nome: "Recebeu candidato", n: f.candidato },
              { nome: "Aceitou alguém", n: f.aceitou },
            ]}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-label">Liquidez das vagas</h3>
        <dl className="grid grid-cols-2 gap-3 text-body-sm sm:grid-cols-3 lg:grid-cols-4">
          {[
            ["Candidatos por vaga", l.candidatos_media == null ? "—" : formatarNumero(l.candidatos_media)],
            ["Curtidas respondidas em 7 dias", pct(l.respondidas_7d, l.curtidas)],
            ["Tempo de resposta (mediana)", horas(l.mediana_horas_resposta)],
            ["Curtidas que viraram match", pct(l.matches, l.curtidas)],
            [
              "Preenchidas pelo Publike (30 dias)",
              `${formatarNumero(l.preenchidas_publike)} de ${formatarNumero(l.encerradas_com_motivo)}`,
            ],
            ["Vagas no ar", formatarNumero(l.vagas_no_ar)],
            ["Pessoas ativas por vaga no ar", pessoasPorVaga],
            ["Mensagens em 7 dias", formatarNumero(m.engajamento.mensagens_7d)],
          ].map(([rotulo, valor]) => (
            <div key={rotulo} className="flex flex-col">
              <dt className="text-ink-muted">{rotulo}</dt>
              <dd className="font-display text-h3">{valor}</dd>
            </div>
          ))}
        </dl>
        <p className="text-body-sm text-ink-muted">
          As vagas publicadas e as curtidas feitas de 8 a 37 dias atrás (os 7 dias delas já passaram). Preenchidas: quem
          encerrou a vaga dizendo &ldquo;Contratei alguém pelo Publike&rdquo;, de todas que disseram o motivo.
        </p>
      </div>

      <details className="rounded-md bg-surface-300 p-4 text-body-sm">
        <summary className="cursor-pointer text-label">O que é cada número</summary>
        <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5">
          <li>
            <strong>Estrela-guia</strong>: o número que mostra se o Publike entrega o que promete. Aqui, os matches:
            quem procura e quem contrata se acharam.
          </li>
          <li>
            <strong>DAU, WAU e MAU</strong>: contas ativas no dia, nos últimos 7 dias e nos últimos 30 dias.
          </li>
          <li>
            <strong>Aderência</strong>: o DAU médio dividido pelo MAU. Perto de 20% já é bom para um site que a pessoa
            usa quando procura ou oferece trabalho.
          </li>
          <li>
            <strong>Ativação</strong>: a conta nova que fez a primeira coisa de valor em até 7 dias. Para quem procura,
            o currículo ou a primeira curtida; para quem contrata ou presta serviço, o primeiro anúncio.
          </li>
          <li>
            <strong>Retenção</strong>: de quem criou a conta numa semana, a parte que voltou nas semanas seguintes. Os
            &ldquo;voltaram em até 7 dias&rdquo; contam qualquer uso do dia seguinte ao 7º.
          </li>
          <li>
            <strong>Churn</strong>: de quem usou nos 30 dias antes destes, a parte que não usou mais.
          </li>
          <li>
            <strong>Liquidez</strong>: o quanto o encontro acontece rápido. Vaga sem candidato e curtida sem resposta
            fazem as duas pontas desistirem.
          </li>
          <li>
            <strong>Mediana</strong>: o valor do meio. Metade levou menos que isso e metade mais, sem ser puxada por um
            caso muito demorado.
          </li>
          <li>
            <strong>De 8 a 37 dias</strong>: as contas, as vagas e as curtidas que já tiveram os 7 dias para acontecer
            (a ativação, o primeiro candidato, a resposta).
          </li>
          <li>
            Ficam de fora porque o site não guarda: tempo no site e sessões, NPS (a nota de satisfação, que ainda não
            perguntamos), receita, CAC e LTV (sem cobrança ainda).
          </li>
        </ul>
      </details>
    </Secao>
  );
}
