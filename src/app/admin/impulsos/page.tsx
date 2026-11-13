import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import {
  AtualizarImpulsos,
  ConfigImpulsos,
  PararImpulso,
  TestarGoogleAds,
} from "@/components/admin/impulsos";
import { CorrendoAgora, type Cliente } from "@/components/admin/impulsos-correndo";
import { VisaoGlobal } from "@/components/admin/impulsos-global";
import { ListaDeAjustes, type AjusteDoAdmin } from "@/components/admin/impulsos-ajustes";
import { HistoricoDeImpulsos } from "@/components/admin/impulsos-historico";
import { ehCorrendo, quemPediu } from "@/components/admin/impulsos-nomes";
import { NovoImpulso } from "@/components/admin/impulsos-novo";
import { TiposDeVaga } from "@/components/admin/impulsos-tipos";
import { Numero, Secao, Situacao } from "@/components/admin/ui";
import { Aviso } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import type {
  CampanhaDoAdmin,
  ConfigImpulso,
  ImpulsoDoAdmin,
  PrecoImpulso,
  ResultadoPorTipo,
  TipoDeVaga,
  VagaParaImpulso,
} from "@/lib/acoes/admin-impulsos";
import { formatarMoeda, formatarNumero, plural, primeiro, tempoRelativo } from "@/lib/formato";
import { contaDeAnuncios, situacaoGoogleAds } from "@/lib/servidor/google-ads-api";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import { criarClienteAdmin, ehAdminLocal } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Impulsos" };
// o "Atualizar" roda uma volta do robô dentro da ação (até uns 35 segundos)
export const maxDuration = 60;

// O impulso da vaga no Google (claude/plano-impulsionar-vaga.md; por cliente e por tipo de vaga desde 12/11/2026,
// claude/plano-impulsos-por-cliente.md). A tela em abas, na ordem do uso: Agora (o que precisa de atenção, os números
// do mês e o que corre, por cliente), Novo impulso (as vagas de um cliente numa campanha só), Histórico (com o
// resultado por tipo de vaga) e Regras (os tipos de vaga, os preços, o grátis, o automático e o raio). O robô
// (lib/servidor/impulsos.ts) faz o resto sozinho, pela fila.

type Dados = {
  precos: PrecoImpulso[];
  config: ConfigImpulso;
  mes: {
    entrou: number;
    verba: number;
    gasto: number;
    cliques?: number;
    curtidas?: number;
    impulsos: number;
    automatico_verba?: number;
    automaticos?: number;
    automaticos_no_ar?: number;
  };
  tipos?: { id: string; nome: string; dias: number | null; verba: number | null; raio: number | null }[];
  campanhas?: CampanhaDoAdmin[];
  impulsos: ImpulsoDoAdmin[];
  por_tipo?: ResultadoPorTipo[];
};

const ABAS = [
  { valor: "agora", nome: "Agora" },
  { valor: "global", nome: "Visão global" },
  { valor: "novo", nome: "Novo impulso" },
  { valor: "historico", nome: "Histórico" },
  { valor: "regras", nome: "Regras" },
] as const;
type Aba = (typeof ABAS)[number]["valor"];

export default function Impulsos({ searchParams }: PageProps<"/admin/impulsos">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      {searchParams.then((sp) => {
        const pedida = primeiro(sp.aba);
        const aba: Aba = ABAS.some((a) => a.valor === pedida) ? (pedida as Aba) : "agora";
        const conta = primeiro(sp.conta);
        return <Conteudo aba={aba} conta={conta && UUID.test(conta) ? conta : null} />;
      })}
    </Suspense>
  );
}

const comTracos = (c: string) => c.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
const reais = (v: number) => formatarMoeda(Math.round(v * 100) / 100);

function clientesCorrendo(d: Dados): Cliente[] {
  const m = new Map<string, Cliente>();
  const doCliente = (conta_id: string, nome: string) => {
    let c = m.get(conta_id);
    if (!c) {
      c = { conta_id, nome, campanha: null, vagas: [], avulsos: [], problema: false, recente: "" };
      m.set(conta_id, c);
    }
    return c;
  };
  for (const k of d.campanhas ?? []) {
    if (!ehCorrendo(k.situacao)) continue;
    const c = doCliente(k.conta_id, k.nome);
    c.campanha = k;
    c.problema ||= Boolean(k.erro);
    if (k.criado_em > c.recente) c.recente = k.criado_em;
  }
  for (const i of d.impulsos) {
    const daCampanha = i.campanha_cliente_id && m.get(i.conta_id)?.campanha?.id === i.campanha_cliente_id;
    if (!daCampanha && !ehCorrendo(i.situacao)) continue;
    const c = doCliente(i.conta_id, i.conta);
    if (daCampanha) c.vagas.push(i);
    else c.avulsos.push(i);
    c.problema ||= Boolean(i.erro) && ehCorrendo(i.situacao);
    if (i.criado_em > c.recente) c.recente = i.criado_em;
  }
  return [...m.values()].sort((a, b) => Number(b.problema) - Number(a.problema) || b.recente.localeCompare(a.recente));
}

async function Conteudo({ aba, conta }: { aba: Aba; conta: string | null }) {
  // o admin do computador do dono ou, no site no ar, a equipe publike.org (Admin › Quem vê cada tela)
  const admin = await ehAdminLocal();
  if (!admin && !(await possoVerTela("/admin/impulsos"))) notFound();
  const c = admin ? criarClienteAdmin() : await criarClienteServidor();
  const { data, error } = await c.rpc("admin_impulsos");
  if (error || !data) {
    return (
      <Aviso tipo="alerta" titulo="Rode a migração do impulso">
        Falta rodar no Supabase as migrações do impulso (de 20270423120000 a 20270430120000).
      </Aviso>
    );
  }
  const d = data as unknown as Dados;
  const agora = await agoraDaRequisicao();
  const g = situacaoGoogleAds();
  const contaGoogle = contaDeAnuncios();
  const algumAVenda = d.precos.some((p) => p.ligado);
  const correndo = d.impulsos.filter((i) => ehCorrendo(i.situacao));
  const travados = [
    ...correndo.filter((i) => i.erro),
    ...(d.campanhas ?? []).filter((k) => ehCorrendo(k.situacao) && k.erro),
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-h2">Impulsos no Google</h1>
            <p className="mt-1 max-w-2xl text-body-sm text-ink-muted">
              A vaga vira anúncio na busca do Google, perto do bairro dela. O robô cria, acompanha a revisão, mede e
              encerra sozinho.
            </p>
          </div>
          {g.ligado && <TestarGoogleAds />}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <Situacao ok={g.ligado}>
            {g.ligado ? `Google Ads ligado na conta ${comTracos(contaGoogle)}` : `Falta no servidor: ${g.falta.join(", ")}`}
          </Situacao>
          <Situacao ok={algumAVenda}>{algumAVenda ? "Impulso à venda" : "Nenhum impulso à venda"}</Situacao>
          <Situacao ok={Boolean(d.config.auto_ligado)}>
            {d.config.auto_ligado
              ? `Automático: ${reais(Number(d.mes.automatico_verba ?? 0))} de ${reais(Number(d.config.auto_verba_mes))} no mês`
              : "Automático desligado"}
          </Situacao>
          <Situacao ok={travados.length === 0}>
            {travados.length === 0 ? "Nenhum travado" : plural(travados.length, "travado", "travados")}
          </Situacao>
        </div>
        {!g.ligado && (
          <ol className="flex max-w-2xl list-decimal flex-col gap-1 pl-5 text-body-sm text-ink-muted">
            <li>No Google Cloud do Publike, ative a Google Ads API e peça o acesso Explorer (vem na hora).</li>
            <li>
              Gere o refresh token com o escopo https://www.googleapis.com/auth/adwords, entrando com a conta dona do Google
              Ads.
            </li>
            <li>Na Vercel, ponha GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN e GOOGLE_ADS_CONTA.</li>
          </ol>
        )}
      </header>

      <nav aria-label="Partes da tela de impulsos" className="sem-barra -mx-4 -mt-2 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        {ABAS.map((a) => {
          const atual = a.valor === aba;
          return (
            <Link
              key={a.valor}
              href={a.valor === "agora" ? "/admin/impulsos" : `/admin/impulsos?aba=${a.valor}`}
              scroll={false}
              aria-current={atual ? "page" : undefined}
              className={`-mb-px inline-flex min-h-12 shrink-0 items-center gap-1.5 border-b-2 px-3 text-label transition-colors ${
                atual ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {a.nome}
              {a.valor === "agora" && correndo.length > 0 && (
                <span className="min-w-6 rounded-pill bg-surface-300 px-1.5 text-center text-caption leading-6 text-ink tabular-nums">
                  {correndo.length}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {aba === "agora" && (
        <>
          <Agora d={d} agora={agora} ligado={g.ligado} />
          <AjustesDiarios ligado={d.config.motor_ligado} />
          <CaminhoDoAnuncio cliques={new Map(d.impulsos.map((i) => [i.id, i.totais.cliques]))} />
        </>
      )}
      {aba === "global" && (
        <Secao
          titulo="Visão global"
          descricao="Cada cliente com impulso correndo: quanto gastou da verba, quantas vagas estão no ar e o que trouxe. Toque no nome da coluna para ordenar."
        >
          <VisaoGlobal clientes={clientesCorrendo(d)} />
        </Secao>
      )}
      {aba === "novo" && <Novo d={d} conta={conta} ligado={g.ligado} />}
      {aba === "historico" && (
        <>
          <ResultadoPorTipoDeVaga linhas={d.por_tipo ?? []} />
          <Secao titulo="Todos os impulsos" descricao="Os 200 mais novos e os que estão correndo.">
            {d.impulsos.length === 0 ? (
              <p className="text-body-sm text-ink-muted">Nenhum impulso ainda.</p>
            ) : (
              <HistoricoDeImpulsos impulsos={d.impulsos} tipos={(d.tipos ?? []).map((t) => t.nome)} agora={agora} />
            )}
          </Secao>
        </>
      )}
      {aba === "regras" && <Regras d={d} />}
    </div>
  );
}

function Agora({ d, agora, ligado }: { d: Dados; agora: number; ligado: boolean }) {
  const clientes = clientesCorrendo(d);
  const correndo = d.impulsos.filter((i) => ehCorrendo(i.situacao));
  // o que precisa do admin: o que travou (o robô tenta de novo sozinho, mas é bom olhar) e o que o Google recusou
  const semana = agora - 7 * 86_400_000;
  const recusados = d.impulsos.filter(
    (i) => i.situacao === "devolvido" && i.motivo?.startsWith("O Google não aprovou") && Date.parse(i.criado_em) > semana,
  );
  const travados = correndo.filter((i) => i.erro);
  const campanhasTravadas = (d.campanhas ?? []).filter((k) => ehCorrendo(k.situacao) && k.erro);
  const gasto = Number(d.mes.gasto);
  const curtidas = Number(d.mes.curtidas ?? 0);
  const cliques = Number(d.mes.cliques ?? 0);

  return (
    <>
      {(travados.length > 0 || campanhasTravadas.length > 0 || recusados.length > 0) && (
        <Secao
          titulo="Precisa de você"
          descricao="O robô tenta de novo sozinho, com espera crescente. Se o erro continua, veja o motivo ou pare o impulso."
        >
          <ul className="flex flex-col divide-y divide-line">
            {campanhasTravadas.map((k) => (
              <li key={k.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <span className="min-w-0">
                  <span className="text-label">Campanha de {k.nome}</span>
                  <span className="mt-0.5 block max-w-2xl text-body-sm break-words text-danger">
                    {k.erro}
                    {k.erro_desde && ` (desde ${tempoRelativo(k.erro_desde, agora)})`}
                  </span>
                </span>
              </li>
            ))}
            {travados.map((i) => (
              <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <span className="min-w-0">
                  <span className="text-label">{i.titulo}</span>
                  <span className="text-body-sm text-ink-muted">, de {i.conta}</span>
                  <span className="mt-0.5 block max-w-2xl text-body-sm break-words text-danger">
                    {i.erro}
                    {i.erro_desde && ` (desde ${tempoRelativo(i.erro_desde, agora)})`}
                  </span>
                </span>
                {!i.pausar && <PararImpulso id={i.id} noAr={i.situacao === "no_ar"} />}
              </li>
            ))}
            {recusados.map((i) => (
              <li key={i.id} className="py-3 first:pt-0 last:pb-0">
                <span className="text-label">{i.titulo}</span>
                <span className="text-body-sm text-ink-muted">, de {i.conta}</span>
                <span className="mt-0.5 block max-w-2xl text-body-sm text-ink-muted">{i.motivo}</span>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      <div className="-mb-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <p className="max-w-xl pt-1.5 text-body-sm text-ink-muted">
          Os números vêm do Google a cada 2 horas. Para ver os de agora, atualize.
        </p>
        {ligado && <AtualizarImpulsos />}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Numero
          rotulo="Correndo agora"
          valor={correndo.length}
          detalhe={
            clientes.length
              ? `${quemPediu(correndo)}, de ${plural(clientes.length, "cliente", "clientes")}`
              : "Nenhum impulso correndo"
          }
        />
        <Numero
          rotulo="Gasto no mês"
          valor={Math.round(gasto * 100) / 100}
          moeda
          detalhe={`no Google, de ${reais(Number(d.mes.verba))} separados`}
        />
        <Numero
          rotulo="Curtidas no mês"
          valor={curtidas}
          detalhe={
            curtidas > 0
              ? `${reais(gasto / curtidas)} por curtida, ${plural(cliques, "clique", "cliques")}`
              : plural(cliques, "clique", "cliques")
          }
        />
        <Numero
          rotulo="Vendido no mês"
          valor={Math.round(Number(d.mes.entrou) * 100) / 100}
          moeda
          detalhe="Impulsos pagos pelos clientes"
        />
      </div>

      <Secao
        titulo="Correndo agora"
        descricao="Por cliente: no ar, em revisão ou nascendo no Google."
        acoes={
          ligado ? (
            <BotaoLink href="/admin/impulsos?aba=novo" tamanho="sm" variante="primario">
              <Plus aria-hidden />
              Novo impulso
            </BotaoLink>
          ) : null
        }
      >
        {clientes.length === 0 ? (
          <p className="text-body-sm text-ink-muted">
            Nenhum impulso correndo agora. Em Novo impulso, escolha as vagas de um cliente.
          </p>
        ) : (
          <CorrendoAgora clientes={clientes} agora={agora} />
        )}
      </Secao>
    </>
  );
}

async function Novo({ d, conta, ligado }: { d: Dados; conta: string | null; ligado: boolean }) {
  if (!ligado) {
    return (
      <Secao titulo="Novo impulso">
        <p className="text-body-sm text-ink-muted">Ligue o Google Ads primeiro (veja o alto da página).</p>
      </Secao>
    );
  }
  // aberto pelo "Mais vagas" de um cliente: as vagas dele já vêm prontas
  let vagasIniciais: VagaParaImpulso[] | null = null;
  if (conta) {
    const admin = await ehAdminLocal();
    const c = admin ? criarClienteAdmin() : await criarClienteServidor();
    const { data } = await c.rpc("admin_vagas_para_impulso", { p_busca: "", p_tipo: null, p_conta: conta });
    vagasIniciais = (data ?? []) as unknown as VagaParaImpulso[];
  }
  return (
    <Secao
      titulo="Novo impulso"
      descricao="Procure o cliente, o título ou o tipo de vaga e marque as vagas de um cliente. Elas entram numa campanha só no Google, com uma verba para todas: o Google põe o dinheiro nas vagas que mais aparecem na busca. A verba é do Publike; o cliente não paga nada e não gasta o impulso grátis dele."
    >
      <NovoImpulso
        key={conta ?? "busca"}
        tipos={(d.tipos ?? []).map((t) => ({ id: t.id, nome: t.nome }))}
        contaInicial={conta}
        vagasIniciais={vagasIniciais}
      />
    </Secao>
  );
}

function ResultadoPorTipoDeVaga({ linhas }: { linhas: ResultadoPorTipo[] }) {
  const porClique = (l: ResultadoPorTipo) => (l.cliques > 0 ? reais(l.gasto / l.cliques) : "—");
  const porCurtida = (l: ResultadoPorTipo) => (l.curtidas > 0 ? reais(l.gasto / l.curtidas) : "—");
  return (
    <Secao
      titulo="Resultado por tipo de vaga"
      descricao="Os impulsos dos últimos 90 dias, pelo tipo de cada vaga hoje. O custo por curtida mostra onde a verba rende mais."
    >
      {linhas.length === 0 ? (
        <p className="text-body-sm text-ink-muted">Nenhum impulso nos últimos 90 dias.</p>
      ) : (
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[44rem] text-left text-body-sm">
            <thead className="text-ink-muted">
              <tr className="border-b border-line">
                <th className="px-5 py-2 font-normal sm:pl-6">Tipo</th>
                <th className="px-3 py-2 text-right font-normal">Impulsos</th>
                <th className="px-3 py-2 text-right font-normal">Gasto</th>
                <th className="px-3 py-2 text-right font-normal">Vistas</th>
                <th className="px-3 py-2 text-right font-normal">Cliques</th>
                <th className="px-3 py-2 text-right font-normal">Curtidas</th>
                <th className="px-3 py-2 text-right font-normal">Por clique</th>
                <th className="px-5 py-2 text-right font-normal sm:pr-6">Por curtida</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {linhas.map((l) => (
                <tr key={l.tipo} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5 text-label sm:pl-6">{l.tipo}</td>
                  <td className="px-3 py-2.5 text-right">{l.impulsos}</td>
                  <td className="px-3 py-2.5 text-right">{reais(Number(l.gasto))}</td>
                  <td className="px-3 py-2.5 text-right">{formatarNumero(Number(l.impressoes))}</td>
                  <td className="px-3 py-2.5 text-right">{formatarNumero(Number(l.cliques))}</td>
                  <td className="px-3 py-2.5 text-right">{formatarNumero(Number(l.curtidas))}</td>
                  <td className="px-3 py-2.5 text-right">{porClique(l)}</td>
                  <td className="px-5 py-2.5 text-right sm:pr-6">{porCurtida(l)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Secao>
  );
}

// o ajuste diário, em beta (src/lib/servidor/impulso-ajuste.ts): o que o robô mudou em cada manhã, campanha por campanha
async function AjustesDiarios({ ligado }: { ligado?: boolean }) {
  if (ligado === undefined) return null;
  const admin = await ehAdminLocal();
  const c = admin ? criarClienteAdmin() : await criarClienteServidor();
  const { data, error } = await c.rpc("admin_impulso_ajustes");
  const linhas = ((data ?? []) as unknown as AjusteDoAdmin[]).slice(0, 40);
  const mudaram = linhas.filter((l) => l.mudancas.some((m) => m.tipo !== "nada")).length;
  return (
    <Secao
      titulo="O ajuste diário (beta)"
      descricao={
        ligado
          ? `Toda manhã, para cada campanha no ar, pelos números do dia anterior: a verba do dia, o lance, as buscas que não são da vaga (com a IA) e o raio. O cliente vê o mesmo na página do impulso. Nos últimos 14 dias, ${plural(mudaram, "manhã mudou", "manhãs mudaram")} alguma coisa. Liga, desliga e muda os limites em Regras.`
          : "Desligado em Regras: os impulsos seguem com a verba, o lance, as buscas e o raio com que nasceram."
      }
    >
      {error ? (
        <p className="text-body-sm text-ink-muted">Rode a migração 20270509120000_impulso_ajuste_diario.sql para ver o ajuste.</p>
      ) : (
        <ListaDeAjustes linhas={linhas} />
      )}
    </Secao>
  );
}

type Caminho = {
  id: string;
  codigo: string;
  titulo: string;
  situacao: string;
  conta: string;
  abriu: number;
  tocou: number;
  entrou: number;
  pedido: number;
  respondeu: number;
  curtiu: number;
};

type Passo = keyof Caminho | "cliques";

// a porcentagem de cada passo é sobre o passo de onde a pessoa vem (as perguntas e o WhatsApp só em algumas vagas: a
// curtida conta sobre quem entrou)
const PASSOS: { chave: Passo; nome: string; sobre?: Passo }[] = [
  { chave: "cliques", nome: "Clicou no Google" },
  { chave: "abriu", nome: "Abriu a vaga", sobre: "cliques" },
  { chave: "tocou", nome: "Tocou em Curtir", sobre: "abriu" },
  { chave: "entrou", nome: "Entrou ou criou a conta", sobre: "tocou" },
  { chave: "pedido", nome: "Viu perguntas ou WhatsApp" },
  { chave: "respondeu", nome: "Respondeu", sobre: "pedido" },
  { chave: "curtiu", nome: "Curtiu", sobre: "entrou" },
];

// o caminho de quem chega pelo anúncio (src/lib/impulso-passos.ts): onde a pessoa para entre o clique e a curtida
async function CaminhoDoAnuncio({ cliques }: { cliques: Map<string, number> }) {
  const admin = await ehAdminLocal();
  const c = admin ? criarClienteAdmin() : await criarClienteServidor();
  const { data, error } = await c.rpc("admin_impulso_caminho");
  const linhas = (data ?? []) as unknown as Caminho[];
  const valor = (l: Caminho, chave: Passo) =>
    chave === "cliques" ? Number(cliques.get(l.id) ?? 0) : Number(l[chave] ?? 0);
  return (
    <Secao
      titulo="O caminho de quem chega pelo anúncio"
      descricao="Quantas pessoas chegaram a cada passo, uma vez cada (os impulsos correndo e os dos últimos 30 dias). O passo com a queda maior é onde a pessoa desiste. As perguntas e o WhatsApp só aparecem nas vagas que pedem. O meio do caminho conta desde 12/11/2026."
    >
      {error ? (
        <p className="text-body-sm text-ink-muted">Rode a migração 20270505120000_impulso_caminho.sql para ver o caminho.</p>
      ) : linhas.length === 0 ? (
        <p className="text-body-sm text-ink-muted">Nenhum impulso nos últimos 30 dias.</p>
      ) : (
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[52rem] text-left text-body-sm">
            <thead className="text-ink-muted">
              <tr className="border-b border-line">
                <th className="px-5 py-2 font-normal sm:pl-6">Vaga</th>
                {PASSOS.map((p, n) => (
                  <th key={p.chave} className={`py-2 text-right font-normal ${n === PASSOS.length - 1 ? "px-5 sm:pr-6" : "px-3"}`}>
                    {p.nome}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {linhas.map((l) => (
                <tr key={l.id} className="border-b border-line align-top last:border-0">
                  <td className="px-5 py-2.5 sm:pl-6">
                    <span className="block text-label">{l.titulo}</span>
                    <span className="block text-caption text-ink-muted">
                      {l.conta}
                      {ehCorrendo(l.situacao) ? ", correndo" : ", encerrado"}
                    </span>
                  </td>
                  {PASSOS.map((p, n) => {
                    const v = valor(l, p.chave);
                    const antes = p.sobre ? valor(l, p.sobre) : 0;
                    const parte = antes > 0 ? Math.min(100, Math.round((100 * v) / antes)) : null;
                    return (
                      <td key={p.chave} className={`py-2.5 text-right ${n === PASSOS.length - 1 ? "px-5 sm:pr-6" : "px-3"}`}>
                        <span className={p.chave === "curtiu" ? "text-label" : undefined}>{formatarNumero(v)}</span>
                        {parte !== null && <span className="block text-caption text-ink-muted">{parte}%</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Secao>
  );
}

async function Regras({ d }: { d: Dados }) {
  const admin = await ehAdminLocal();
  const c = admin ? criarClienteAdmin() : await criarClienteServidor();
  const { data } = await c.rpc("admin_tipos_de_vaga");
  const t = (data ?? null) as { tipos: TipoDeVaga[]; outros: number } | null;
  return (
    <>
      <Secao
        titulo="Tipos de vaga"
        descricao="Cada vaga entra no primeiro tipo da lista que tiver uma das palavras no título (pelo começo da palavra e sem acento: “contab” pega contábil e contabilidade). Os dias e a verba do tipo são o ponto de partida do impulso pelo admin e do automático; o raio vale para todo impulso daquele tipo, também os que já estão no ar. Vazio segue a regra geral, logo abaixo."
      >
        {t ? (
          <TiposDeVaga tipos={t.tipos} outros={Number(t.outros)} />
        ) : (
          <p className="text-body-sm text-ink-muted">Rode a migração 20270430120000_impulso_por_cliente.sql para ver os tipos.</p>
        )}
      </Secao>
      <Secao
        titulo="Preços e regras gerais"
        descricao="Os preços valem para as próximas compras; quem já pagou fica como comprou."
      >
        <ConfigImpulsos precos={d.precos} config={d.config} />
      </Secao>
    </>
  );
}
