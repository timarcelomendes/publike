import type { ReactNode } from "react";
import type { AbaDoPainel } from "./abas";
import { FormGasto } from "./form-gasto";
import { VisaoGeral } from "./visao-geral";
import { FunilDoPublicar } from "@/components/admin/funil-publicar";
import { FunilDoVisitante, PortasDeEntrada } from "@/components/admin/funil-visitante";
import {
  CadastroEAtivacao,
  ComoContamos,
  Indicador,
  LiquidezDasVagas,
  TempoNoSite,
  UsoDasContas,
} from "@/components/admin/metricas-produto";
import {
  CartoesDaOperacao,
  CartoesDeAgora,
  CategoriasEBairros,
  ContasPorTipo,
  PorQueEncerraram,
  SecaoAcessos,
  SecaoPresenca,
  UltimosTrintaDias,
} from "@/components/admin/numeros-do-painel";
import { NumerosDoTesteApp } from "@/components/admin/numeros-teste-app";
import { Secao } from "@/components/admin/ui";
import type { DadosDoPainel, Indicadores, LinhaOferta, OfertaProcura } from "@/lib/admin/painel";
import { formatarMoeda, formatarNumero, plural } from "@/lib/formato";
import { NOME_PRODUTO, type Produto } from "@/lib/pagamentos";
import { categoria } from "@/lib/constantes";

// O conteúdo de cada aba do Painel, só de leitura: o admin e Equipe › Números passam os dados (o que não veio, não
// aparece). `admin` liga os links para as listas; `extra` é o que só o admin tem (as contas no app).

const NOMES_DAS_ORIGENS: Record<string, string> = { direto: "Direto (sem campanha)" };

export function ConteudoDaAba({
  aba,
  d,
  admin,
  extra,
}: {
  aba: AbaDoPainel;
  d: DadosDoPainel;
  admin: boolean;
  extra?: ReactNode;
}) {
  const dias = d.filtro?.dias ?? 7;
  switch (aba) {
    case "visao":
      return (
        <VisaoGeral
          indicadores={d.indicadores}
          historico={d.historico}
          metas={d.metas}
          numerosSemana={d.numerosSemana}
          m={d.metricas}
          acessos={d.acessos}
          receita={d.receita}
          admin={admin}
        />
      );

    case "chegada":
      return (
        <>
          {d.presenca && <SecaoPresenca presenca={d.presenca} />}
          <SecaoAcessos acessos={d.acessos ?? null} />
          {d.portas && <PortasDeEntrada portas={d.portas} dias={dias} />}
          {d.origens && d.origens.length > 0 && (
            <Secao
              titulo={`De onde vêm as contas (${dias} dias)`}
              descricao={`As contas criadas nos últimos ${dias} dias, pela origem do primeiro acesso. O detalhe fica em Admin › Campanhas.`}
            >
              <div className="-mx-1 overflow-x-auto px-1">
                <table className="w-full min-w-[30rem] text-body-sm tabular-nums">
                  <thead>
                    <tr className="border-b border-line text-left text-ink-muted">
                      <th scope="col" className="py-2 pr-2 font-normal">
                        Origem
                      </th>
                      <th scope="col" className="py-2 text-right font-normal">
                        Contas
                      </th>
                      <th scope="col" className="py-2 text-right font-normal">
                        Publicaram vaga
                      </th>
                      <th scope="col" className="py-2 text-right font-normal">
                        Anúncios no ar
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.origens.map((o) => (
                      <tr key={o.origem} className="border-b border-line last:border-0">
                        <th scope="row" className="py-2 pr-2 text-left font-normal">
                          {NOMES_DAS_ORIGENS[o.origem] ?? o.origem}
                        </th>
                        <td className="py-2 text-right">{formatarNumero(o.contas)}</td>
                        <td className="py-2 text-right">{formatarNumero(o.publicaram_vaga)}</td>
                        <td className="py-2 text-right">{formatarNumero(o.anuncios_no_ar)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Secao>
          )}
          {d.funilVisitante && <FunilDoVisitante funil={d.funilVisitante} dias={dias} />}
        </>
      );

    case "cadastro":
      return (
        <>
          {d.metricas && <CadastroEAtivacao m={d.metricas} />}
          {d.funilPublicar && <FunilDoPublicar funil={d.funilPublicar} dias={dias} />}
          {d.n && <ContasPorTipo n={d.n} />}
          <ComoContamos />
        </>
      );

    case "vagas":
      return (
        <>
          {d.n && d.hoje && <CartoesDeAgora n={d.n} hoje={d.hoje} links={admin} />}
          {d.metricas && <LiquidezDasVagas m={d.metricas} />}
          {d.n && <UltimosTrintaDias n={d.n} />}
          {d.indicadores && <RespostasEMatches i={d.indicadores} />}
          {d.oferta ? <OfertaEProcura o={d.oferta} /> : d.n && <CategoriasEBairros n={d.n} />}
          {d.encerramentos && <PorQueEncerraram encerramentos={d.encerramentos} dias={dias} />}
          <ComoContamos />
        </>
      );

    case "volta":
      return (
        <>
          {d.metricas && <UsoDasContas m={d.metricas} />}
          {d.testeApp && <NumerosDoTesteApp linhas={d.testeApp} />}
          {extra}
          <ComoContamos />
        </>
      );

    case "dinheiro":
      return <AbaDinheiro d={d} />;

    case "site":
      return (
        <>
          {d.n && <CartoesDaOperacao n={d.n} links={admin} />}
          {d.tempo && d.metricas && <TempoNoSite tempo={d.tempo} hoje={d.metricas.hoje} />}
        </>
      );
  }
}

/** O que acontece com as candidaturas no período: as respostas e os matches (gente × automático), os encontros, as
 * entrevistas e as contratações. */
function RespostasEMatches({ i }: { i: Indicadores }) {
  const a = i.atual;
  const b = i.antes;
  const linhas: [string, number, number][] = [
    ["Candidaturas", a.candidaturas, b.candidaturas],
    ["Respondidas por alguém", a.respondidas_gente, b.respondidas_gente],
    ["Respondidas sozinhas", a.respondidas_auto, b.respondidas_auto],
    ["Matches aceitos por alguém", a.matches_gente, b.matches_gente],
    ["Matches automáticos", a.matches_auto, b.matches_auto],
    ["Encontros", a.encontros, b.encontros],
    ["Entrevistas marcadas", a.entrevistas, b.entrevistas],
    ["Contratações", a.contratacoes, b.contratacoes],
  ];
  return (
    <Secao
      titulo={`Candidaturas, respostas e encontros (${i.dias} dias)`}
      descricao="Sozinhas: o contato direto, uma automação, uma regra da empresa ou o Publike depois de 48 h sem resposta. Encontro: o match com contato de verdade."
    >
      <dl className="grid grid-cols-2 gap-3 text-body-sm sm:grid-cols-4">
        {linhas.map(([rotulo, agora, antes]) => (
          <div key={rotulo} className="flex flex-col">
            <dt className="text-ink-muted">{rotulo}</dt>
            <dd className="font-display text-h3 tabular-nums">{formatarNumero(agora)}</dd>
            <dd className="text-ink-muted">antes: {formatarNumero(antes)}</dd>
          </div>
        ))}
      </dl>
    </Secao>
  );
}

const horasEscritas = (h: number | null) =>
  h == null ? "—" : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} dias`;

function TabelaOferta({
  titulo,
  coluna,
  linhas,
  nome,
}: {
  titulo: string;
  coluna: string;
  linhas: LinhaOferta[];
  nome: (k: string) => string;
}) {
  if (!linhas.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-label">{titulo}</h3>
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[36rem] text-body-sm tabular-nums">
          <thead>
            <tr className="border-b border-line text-left text-ink-muted">
              <th scope="col" className="py-2 pr-2 font-normal">
                {coluna}
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                No ar
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                Novas
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                Candidaturas
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                Por vaga nova
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                Sem candidato
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                1º candidato
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.chave} className="border-b border-line last:border-0">
                <th scope="row" className="py-2 pr-2 text-left font-normal">
                  {nome(l.chave)}
                </th>
                <td className="py-2 text-right">{formatarNumero(l.no_ar)}</td>
                <td className="py-2 text-right">{formatarNumero(l.novas)}</td>
                <td className="py-2 text-right">{formatarNumero(l.candidaturas)}</td>
                <td className="py-2 text-right">
                  {l.novas ? formatarNumero(Math.round((10 * l.candidaturas) / l.novas) / 10) : "—"}
                </td>
                <td className={`py-2 text-right ${l.sem_candidato ? "text-terra-text" : ""}`}>
                  {formatarNumero(l.sem_candidato)}
                </td>
                <td className="py-2 text-right">{horasEscritas(l.horas_primeiro)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Oferta e procura: onde sobra vaga e onde sobra gente. */
function OfertaEProcura({ o }: { o: OfertaProcura }) {
  return (
    <Secao
      titulo={`Oferta e procura (${o.dias} dias)`}
      descricao="No ar e sem candidato (no ar há mais de 24 h, sem ninguém) são de agora; as vagas novas, as candidaturas e o tempo até o primeiro candidato (mediana) são do período."
    >
      <TabelaOferta titulo="Por área" coluna="Área" linhas={o.areas} nome={(k) => categoria(k).nome} />
      <TabelaOferta titulo="Por cidade" coluna="Cidade" linhas={o.cidades} nome={(k) => k} />
      <TabelaOferta titulo="Por bairro (Goiânia)" coluna="Bairro" linhas={o.bairros} nome={(k) => k} />
    </Secao>
  );
}

const brl = (n: number) => formatarMoeda(Number(n) || 0);

/** Painel › Dinheiro (só no admin): a receita, as assinaturas, os 15 dias grátis, o uso dos recursos pagos e os custos. */
function AbaDinheiro({ d }: { d: DadosDoPainel }) {
  const r = d.receita;
  const x = d.dinheiro;
  if (!r && !x) return <p className="text-body-sm text-ink-muted">Falta a migração dos pagamentos neste banco.</p>;
  const ia = d.custos?.ia;
  const mesAtual = new Date().toISOString().slice(0, 7);
  return (
    <>
      <Secao
        titulo="Receita e assinaturas"
        descricao="Sem as do sandbox. O trimestral entra dividido por 3. Os detalhes, os preços e as notas ficam em Admin › Pagamentos."
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicador rotulo="Receita por mês" valor={brl(x?.por_mes ?? r?.porMes ?? 0)} />
          <Indicador
            rotulo="Assinaturas ativas"
            valor={formatarNumero(x?.ativas ?? r?.ativas ?? 0)}
            detalhe={
              x
                ? `+${plural(x.novas, "nova", "novas")} · ${plural(x.canceladas, "cancelada", "canceladas")} em ${x.dias} dias`
                : undefined
            }
          />
          <Indicador
            rotulo={x ? `Recebido em ${x.dias} dias` : "Recebido"}
            valor={x ? brl(x.recebido) : "—"}
            detalhe={x ? plural(x.cobrancas_pagas, "cobrança paga", "cobranças pagas") : undefined}
          />
          <Indicador
            rotulo="Cobranças em atraso"
            valor={formatarNumero(x?.em_atraso ?? r?.atrasadas ?? 0)}
            nota={(x?.em_atraso ?? r?.atrasadas) ? "Com cobrança vencida" : "Nenhuma"}
          />
        </div>
        {(x?.por_recurso.length ?? 0) > 0 && (
          <ul className="flex flex-col divide-y divide-line text-body-sm">
            {x!.por_recurso.map((p) => (
              <li key={p.recurso} className="flex justify-between gap-3 py-2">
                <span>{NOME_PRODUTO[p.recurso as Produto] ?? p.recurso}</span>
                <span className="tabular-nums">
                  {plural(p.ativas, "assinatura", "assinaturas")} · {brl(p.por_mes)} por mês
                </span>
              </li>
            ))}
          </ul>
        )}
      </Secao>
      {x && (
        <Secao
          titulo={`15 dias grátis e uso dos recursos pagos (${x.dias} dias)`}
          descricao="Assinou: a conta assinou algum recurso entre o começo dos 15 dias e 30 dias depois do fim."
        >
          <dl className="grid grid-cols-2 gap-3 text-body-sm sm:grid-cols-3 lg:grid-cols-4">
            {(
              [
                ["15 dias grátis começados", formatarNumero(x.gratis_comecados)],
                [
                  "Viraram assinatura",
                  x.gratis_acabados
                    ? `${formatarNumero(x.gratis_assinaram)} de ${formatarNumero(x.gratis_acabados)} que acabaram`
                    : "—",
                ],
                ["Leituras da Triagem com IA", formatarNumero(x.uso.leituras_triagem)],
                ["Testes Práticos feitos", formatarNumero(x.uso.testes_feitos)],
                ["Entrevistas em vídeo enviadas", formatarNumero(x.uso.videos_enviados)],
                ["Entrevistas ao vivo marcadas", formatarNumero(x.uso.ao_vivo)],
                ["Regras ligadas agora", formatarNumero(x.uso.regras_ligadas)],
              ] as const
            ).map(([rotulo, valor]) => (
              <div key={rotulo} className="flex flex-col">
                <dt className="text-ink-muted">{rotulo}</dt>
                <dd className="font-display text-h3 tabular-nums">{valor}</dd>
              </div>
            ))}
          </dl>
        </Secao>
      )}
      <Secao
        titulo="Custos que mudam com o uso"
        descricao="A IA pela mesma conta de Admin › IA, em dólar. O vídeo ao vivo: a Daily cobra por minuto depois dos 10.000 minutos grátis do mês."
      >
        <dl className="grid grid-cols-2 gap-3 text-body-sm sm:grid-cols-3">
          <div className="flex flex-col">
            <dt className="text-ink-muted">IA em {d.filtro?.dias ?? 7} dias</dt>
            <dd className="font-display text-h3 tabular-nums">
              {ia ? `US$ ${ia.dolares.toFixed(2).replace(".", ",")}` : "—"}
            </dd>
            {ia && (
              <dd className="text-ink-muted">
                {plural(ia.chamadas, "chamada", "chamadas")}
                {ia.semPreco ? " · algum modelo sem preço" : ""}
              </dd>
            )}
          </div>
          <div className="flex flex-col">
            <dt className="text-ink-muted">Entrevistas ao vivo</dt>
            <dd className="font-display text-h3 tabular-nums">{x ? formatarNumero(x.uso.ao_vivo) : "—"}</dd>
            <dd className="text-ink-muted">cerca de 160 de 30 min cabem no grátis do mês</dd>
          </div>
        </dl>
      </Secao>
      <Secao
        titulo="Gasto com anúncios"
        descricao="Digite o gasto de cada mês e canal. Com o nome igual ao da origem das contas (Admin › Campanhas), o Painel mostra o custo por conta nova. Zero apaga."
      >
        <FormGasto mesAtual={mesAtual} canais={d.canais ?? []} />
        {x && x.gastos.length > 0 && (
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[28rem] text-body-sm tabular-nums">
              <thead>
                <tr className="border-b border-line text-left text-ink-muted">
                  <th scope="col" className="py-2 pr-2 font-normal">
                    Mês
                  </th>
                  <th scope="col" className="py-2 pr-2 font-normal">
                    Canal
                  </th>
                  <th scope="col" className="py-2 text-right font-normal">
                    Gasto
                  </th>
                  <th scope="col" className="py-2 text-right font-normal">
                    Contas novas
                  </th>
                  <th scope="col" className="py-2 text-right font-normal">
                    Por conta
                  </th>
                </tr>
              </thead>
              <tbody>
                {x.gastos.map((g) => {
                  const mes = g.mes.slice(0, 7);
                  const contas = d.custos?.contasPorOrigemNoMes[`${mes}|${g.canal}`] ?? 0;
                  return (
                    <tr key={`${g.mes}-${g.canal}`} className="border-b border-line last:border-0">
                      <td className="py-2 pr-2">{`${mes.slice(5)}/${mes.slice(0, 4)}`}</td>
                      <td className="py-2 pr-2">{g.canal}</td>
                      <td className="py-2 text-right">{brl(g.valor)}</td>
                      <td className="py-2 text-right">{formatarNumero(contas)}</td>
                      <td className="py-2 text-right">{contas ? brl(Number(g.valor) / contas) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </>
  );
}
