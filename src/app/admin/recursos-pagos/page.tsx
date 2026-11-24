import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, Gift, History, Rocket, Sparkles, Unlock } from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Numero, Secao } from "@/components/admin/ui";
import { Aviso, Selo } from "@/components/ui/basicos";
import { Botao, classesBotao } from "@/components/ui/botao";
import { classesEntrada } from "@/components/ui/campo";
import { agoraDaRequisicao } from "@/lib/tempo";
import {
  formatarDataCurta,
  formatarMoeda,
  formatarNumero,
  rotuloConta,
  primeiro,
} from "@/lib/formato";
import {
  ehProduto,
  NOME_CICLO,
  NOME_PRODUTO,
  type Ciclo,
} from "@/lib/pagamentos";
import { notFound } from "next/navigation";
import { LiberarPromocao, TirarPromocao } from "@/components/admin/promocao";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import { criarClienteAdmin, ehAdminLocal } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Recursos pagos" };

// Quem usa os recursos pagos (23/11/2026; Marcelo: "Quero ver quem usa as features pagas, que habilitaram"; migração
// 20270917120000): quem tem cada recurso liberado e como, as assinaturas, quem usa o grátis do mês e os impulsos.

type Como = "assinatura" | "15_dias" | "publike" | "promocao";

type Liberado = {
  recurso: string;
  conta_id: string;
  nome: string;
  tipo: string;
  desde: string;
  ate: string | null;
  ativo: boolean;
  como: Como;
  sandbox: boolean | null;
  valor: number | null;
  ciclo: Ciclo | null;
  situacao_assinatura: string | null;
  conta_de_teste: boolean;
  /** Triagem: os currículos lidos no mês; Entrevista em vídeo: os pedidos do mês; os outros, null */
  uso_no_mes: number | null;
};

type Assinatura = {
  conta_id: string;
  nome: string;
  recurso: string;
  ciclo: Ciclo;
  valor: number;
  forma: string;
  situacao: string;
  sandbox: boolean;
  criada_em: string;
  cancelada_em: string | null;
  conta_de_teste: boolean;
};

type Gratis = {
  conta_id: string;
  nome: string;
  tipo: string;
  /** null: a conta tem a Triagem paga (não conta no grátis) */
  lidos: number | null;
  /** null: a conta tem a Entrevista em vídeo paga */
  pedidas: number | null;
  enviadas: number;
  conta_de_teste: boolean;
};

type Impulsos = {
  conta_id: string;
  nome: string;
  tipo: string;
  total: number;
  compra: number;
  credito: number;
  cortesia: number;
  admin: number;
  automaticos: number;
  valor: number;
  gasto: number;
  ultimo: string;
};

type Dados = {
  mes_desde: string;
  limite_triagem: number;
  limite_gravadas: number;
  liberados: Liberado[];
  assinaturas: Assinatura[];
  gratis: Gratis[];
  impulsos: Impulsos[];
};

const OUTROS_RECURSOS: Record<string, string> = {
  contato_no_convite: "Contato no convite",
  visoes: "Visões das vagas",
};

function nomeDoRecurso(r: string) {
  return ehProduto(r) ? NOME_PRODUTO[r] : (OUTROS_RECURSOS[r] ?? r);
}

const NOME_COMO: Record<Como, string> = {
  assinatura: "Assinatura",
  "15_dias": "15 dias grátis",
  publike: "Liberado pelo Publike",
  promocao: "Promoção de lançamento",
};

const ABAS = [
  { id: "liberados", nome: "Liberados", icone: Unlock },
  { id: "promocao", nome: "Promoção de lançamento", icone: Gift },
  { id: "assinaturas", nome: "Assinaturas", icone: CreditCard },
  { id: "gratis", nome: "Grátis do mês", icone: Sparkles },
  { id: "impulsos", nome: "Impulsos", icone: Rocket },
  // o histórico de uso (migração 20270925120000)
  { id: "uso", nome: "Uso", icone: History },
] as const;
type Aba = (typeof ABAS)[number]["id"];

export default function RecursosPagos({
  searchParams,
}: PageProps<"/admin/recursos-pagos">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      {searchParams.then((sp) => {
        const pedida = primeiro(sp.aba);
        const f = (k: string) => primeiro(sp[k])?.trim() || "";
        return (
          <Conteudo
            aba={
              ABAS.some((a) => a.id === pedida) ? (pedida as Aba) : "liberados"
            }
            filtro={{
              q: f("q").slice(0, 80),
              recurso: f("recurso"),
              como: f("como"),
              situacao: f("situacao"),
              mostrar: f("mostrar"),
              origem: f("origem"),
            }}
          />
        );
      })}
    </Suspense>
  );
}

const linkDaAba = (id: Aba) =>
  id === "liberados"
    ? "/admin/recursos-pagos"
    : `/admin/recursos-pagos?aba=${id}`;

/** As sub-abas da tela, com o número de cada uma. */
function SubAbas({
  ativa,
  numeros,
}: {
  ativa: Aba;
  numeros: Partial<Record<Aba, number>>;
}) {
  return (
    <nav
      aria-label="Recursos pagos"
      className="sem-barra -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
    >
      {ABAS.map(({ id, nome, icone: Icone }) => {
        const atual = id === ativa;
        return (
          <Link
            key={id}
            href={linkDaAba(id)}
            scroll={false}
            aria-current={atual ? "page" : undefined}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-pill border px-3.5 text-label transition-colors ${
              atual
                ? "border-ink bg-ink text-surface-100"
                : "border-line bg-surface-300 text-ink hover:border-line-strong"
            }`}
          >
            <Icone aria-hidden className="size-4" />
            {nome}
            {numeros[id] !== undefined && <span className="tabular-nums opacity-70">{numeros[id]}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function Conta({
  id,
  nome,
  tipo,
  teste,
  admin,
}: {
  id: string;
  nome: string;
  tipo?: string;
  teste?: boolean;
  /** a ficha da conta só abre no computador do dono */
  admin: boolean;
}) {
  return (
    <span className="flex flex-col">
      {admin ? (
        <Link
          href={`/admin/usuarios/${id}`}
          className="font-semibold underline-offset-2 hover:underline"
        >
          {nome}
        </Link>
      ) : (
        <span className="font-semibold">{nome}</span>
      )}
      <span className="flex flex-wrap items-center gap-1 text-caption text-ink-muted">
        {tipo && rotuloConta(tipo)}
        {teste && <Selo variante="contorno">Conta de teste</Selo>}
      </span>
    </span>
  );
}

function Como({ l }: { l: Liberado }) {
  if (l.como !== "assinatura") return <span>{NOME_COMO[l.como]}</span>;
  return (
    <span className="flex flex-col">
      <span>
        Assinatura{l.valor !== null && `, ${formatarMoeda(l.valor)}`}
        {l.ciclo && ` ${NOME_CICLO[l.ciclo].toLowerCase()}`}
      </span>
      {(l.sandbox || l.situacao_assinatura === "cancelada") && (
        <span className="text-caption text-ink-muted">
          {[
            l.sandbox && "sandbox",
            l.situacao_assinatura === "cancelada" && "cancelada",
          ]
            .filter(Boolean)
            .join(", ")}
        </span>
      )}
    </span>
  );
}

function Tabela({
  cabecalho,
  children,
  min = 640,
}: {
  cabecalho: string[];
  children: ReactNode;
  min?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full text-left text-body-sm"
        style={{ minWidth: min }}
      >
        <thead className="text-caption text-ink-muted">
          <tr>
            {cabecalho.map((c, i) => (
              <th
                key={c}
                className={`px-2 py-2 font-semibold ${i > 0 && /^(Lidos|Gravadas|Total|Valor)/.test(c) ? "text-right" : ""}`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

function TabelaDeLiberados({
  linhas,
  admin,
}: {
  linhas: Liberado[];
  admin: boolean;
}) {
  return (
    <Tabela
      cabecalho={[
        "Empresa",
        "Recurso",
        "Como",
        "Desde",
        "Até",
        "Uso no mês",
        "",
      ]}
    >
      {linhas.map((l) => (
        <tr key={`${l.conta_id}-${l.recurso}`} className="align-top">
          <td className="px-2 py-2">
            <Conta
              admin={admin}
              id={l.conta_id}
              nome={l.nome}
              tipo={l.tipo}
              teste={l.conta_de_teste}
            />
          </td>
          <td className="px-2 py-2">{nomeDoRecurso(l.recurso)}</td>
          <td className="px-2 py-2">
            <Como l={l} />
          </td>
          <td className="px-2 py-2 whitespace-nowrap">
            {formatarDataCurta(l.desde)}
          </td>
          <td className="px-2 py-2 whitespace-nowrap">
            {l.ate ? formatarDataCurta(l.ate) : "Sem prazo"}
          </td>
          <td className="px-2 py-2">
            {l.uso_no_mes === null
              ? "—"
              : l.recurso === "copiloto"
                ? `${formatarNumero(l.uso_no_mes)} ${l.uso_no_mes === 1 ? "lido" : "lidos"}`
                : `${formatarNumero(l.uso_no_mes)} ${l.uso_no_mes === 1 ? "pedida" : "pedidas"}`}
          </td>
          <td className="px-2 py-2">
            {l.como === "promocao" && l.ativo && (
              <TirarPromocao contaId={l.conta_id} recurso={l.recurso} />
            )}
          </td>
        </tr>
      ))}
    </Tabela>
  );
}

type Filtro = {
  /** o nome da empresa */
  q: string;
  recurso: string;
  /** Liberados: assinatura, 15_dias, promocao, publike */
  como: string;
  /** Assinaturas: ativa, cancelada ou as outras */
  situacao: string;
  /** Liberados: agora (padrão), acabaram, todos; Promoção: acabam (em 7 dias); Grátis: limite; Assinaturas: testes */
  mostrar: string;
  /** Impulsos: compra, credito, cortesia, admin */
  origem: string;
};

type Campo = {
  nome: keyof Filtro;
  rotulo: string;
  opcoes: { valor: string; nome: string }[];
};

/** Os filtros de cada aba (no endereço da página): o nome da empresa e as escolhas da aba. */
function FiltrosDaAba({
  aba,
  filtro,
  campos,
  mostrando,
  total,
}: {
  aba: Aba;
  filtro: Filtro;
  campos: Campo[];
  mostrando: number;
  total: number;
}) {
  const filtrando = Boolean(
    filtro.q ||
    campos.some((c) => filtro[c.nome] && c.opcoes[0]?.valor !== filtro[c.nome]),
  );
  return (
    <div className="flex flex-col gap-2">
      <form
        // um formulário novo a cada filtro: o "Limpar" e o voltar do navegador refazem os campos
        key={JSON.stringify(filtro)}
        action="/admin/recursos-pagos"
        className="flex flex-wrap items-end gap-3"
        aria-label="Filtrar"
      >
        {aba !== "liberados" && <input type="hidden" name="aba" value={aba} />}
        <label className="flex min-w-48 flex-1 flex-col gap-1 sm:max-w-72">
          <span className="text-label">Empresa</span>
          <input
            type="search"
            name="q"
            defaultValue={filtro.q}
            placeholder="Nome da empresa"
            className={classesEntrada}
          />
        </label>
        {campos.map((c) => (
          <label key={c.nome} className="flex flex-col gap-1">
            <span className="text-label">{c.rotulo}</span>
            <select
              name={c.nome}
              defaultValue={filtro[c.nome]}
              className={`${classesEntrada} max-w-56`}
            >
              {c.opcoes.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.nome}
                </option>
              ))}
            </select>
          </label>
        ))}
        <Botao type="submit" variante="secundario">
          Filtrar
        </Botao>
        {filtrando && (
          <Link
            href={linkDaAba(aba)}
            scroll={false}
            className={classesBotao("fantasma", "md")}
          >
            Limpar
          </Link>
        )}
      </form>
      {filtrando && (
        <p className="text-body-sm text-ink-muted" role="status">
          {mostrando === total
            ? `${total} ${total === 1 ? "linha" : "linhas"}`
            : `Mostrando ${mostrando} de ${total}`}
        </p>
      )}
    </div>
  );
}

/** O nome da empresa sem acento e sem caixa, para a busca. */
function chave(t: string) {
  return t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const TODOS = { valor: "", nome: "Todos" };

async function Conteudo({ aba, filtro }: { aba: Aba; filtro: Filtro }) {
  // o admin do computador do dono ou, no site no ar, a equipe publike.org (migração 20270918120000; Admin › Quem vê
  // cada tela)
  const admin = await ehAdminLocal();
  if (!admin && !(await possoVerTela("/admin/recursos-pagos"))) notFound();
  const c = admin ? criarClienteAdmin() : await criarClienteServidor();
  const { data, error } = await c.rpc("admin_recursos_pagos");
  if (error || !data) {
    if (error && error.code !== "PGRST202")
      throw new Error(
        `Publike: falha ao ler os recursos pagos (${error.message}).`,
      );
    return (
      <Aviso tipo="alerta" titulo="Rode a migração dos recursos pagos">
        Falta a migração 20270917120000_admin_recursos_pagos.sql neste banco.
      </Aviso>
    );
  }
  const d = data as unknown as Dados;
  const ativos = d.liberados.filter((l) => l.ativo);
  const acabaram = d.liberados.filter((l) => !l.ativo);
  const reais = d.assinaturas.filter((a) => !a.sandbox && !a.conta_de_teste);
  const assinaturasAtivas = reais.filter((a) => a.situacao === "ativa");
  const porMes = assinaturasAtivas.reduce(
    (s, a) =>
      s +
      Number(a.valor) /
        (a.ciclo === "YEARLY" ? 12 : a.ciclo === "QUARTERLY" ? 3 : 1),
    0,
  );
  const deFora = (x: { conta_de_teste: boolean }) => !x.conta_de_teste;
  const contasLiberadas = new Set(ativos.filter(deFora).map((l) => l.conta_id))
    .size;
  const noLimite = (g: Gratis) =>
    (g.lidos !== null && d.limite_triagem > 0 && g.lidos >= d.limite_triagem) ||
    (g.pedidas !== null &&
      d.limite_gravadas > 0 &&
      g.pedidas >= d.limite_gravadas);
  const gratisDeFora = d.gratis.filter(deFora);
  const impulsosComprados = d.impulsos.reduce((s, i) => s + i.compra, 0);
  const valorImpulsos = d.impulsos.reduce((s, i) => s + Number(i.valor), 0);
  const naPromocao = ativos.filter((l) => l.como === "promocao");
  // o uso dos recursos (migração 20270925120000): só quando a aba está aberta
  const diasDoUso = ["7", "90"].includes(filtro.mostrar) ? Number(filtro.mostrar) : 30;
  const usoLido = aba === "uso" ? await c.rpc("admin_uso_recursos_pagos", { p_dias: diasDoUso }) : null;
  const uso = usoLido && !usoLido.error ? (usoLido.data as unknown as DadosDoUso) : null;
  const numeros: Partial<Record<Aba, number>> = {
    liberados: ativos.length,
    promocao: naPromocao.length,
    assinaturas: d.assinaturas.filter((a) => a.situacao === "ativa").length,
    gratis: d.gratis.length,
    impulsos: d.impulsos.length,
    ...(uso ? { uso: uso.eventos.filter((e) => !e.conta_de_teste).length } : {}),
  };
  // os filtros
  const daEmpresa = (x: { nome: string }) =>
    !filtro.q || chave(x.nome).includes(chave(filtro.q));
  const doRecurso = (x: { recurso: string }) =>
    !filtro.recurso || x.recurso === filtro.recurso;
  const recursosDe = (xs: { recurso: string }[]) =>
    [...new Set(xs.map((x) => x.recurso))]
      .map((r) => ({ valor: r, nome: nomeDoRecurso(r) }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const mostrarLib = ["acabaram", "todos"].includes(filtro.mostrar)
    ? filtro.mostrar
    : "agora";
  const baseLib =
    mostrarLib === "agora"
      ? ativos
      : mostrarLib === "acabaram"
        ? acabaram
        : d.liberados;
  const libFiltrados = baseLib.filter(
    (l) =>
      daEmpresa(l) && doRecurso(l) && (!filtro.como || l.como === filtro.como),
  );
  const daqui7 = (await agoraDaRequisicao()) + 7 * 24 * 3600 * 1000;
  const promoFiltrados = naPromocao.filter(
    (l) =>
      daEmpresa(l) &&
      doRecurso(l) &&
      (filtro.mostrar !== "acabam" ||
        (l.ate !== null && new Date(l.ate).getTime() <= daqui7)),
  );
  const assFiltradas = d.assinaturas.filter(
    (a) =>
      daEmpresa(a) &&
      doRecurso(a) &&
      (!filtro.situacao ||
        (filtro.situacao === "outras"
          ? !["ativa", "cancelada"].includes(a.situacao)
          : a.situacao === filtro.situacao)) &&
      (filtro.mostrar === "testes" || (!a.sandbox && !a.conta_de_teste)),
  );
  const assSemTestes = d.assinaturas.filter(
    (a) => !a.sandbox && !a.conta_de_teste,
  );
  const gratisFiltrados = d.gratis.filter(
    (g) => daEmpresa(g) && (filtro.mostrar !== "limite" || noLimite(g)),
  );
  const impFiltrados = d.impulsos.filter(
    (i) =>
      daEmpresa(i) &&
      (!["compra", "credito", "cortesia", "admin"].includes(filtro.origem) ||
        i[filtro.origem as "compra" | "credito" | "cortesia" | "admin"] > 0),
  );
  const mes = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(d.mes_desde));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero
          href={linkDaAba("assinaturas")}
          rotulo="Assinaturas ativas"
          valor={assinaturasAtivas.length}
          detalhe={`${formatarMoeda(porMes)} por mês, sem as de teste`}
        />
        <Numero
          href={linkDaAba("liberados")}
          rotulo="Recursos liberados agora"
          valor={ativos.filter(deFora).length}
          detalhe={`${contasLiberadas === 1 ? "em 1 conta" : `em ${contasLiberadas} contas`}, sem as de teste`}
        />
        <Numero
          href={linkDaAba("gratis")}
          rotulo={`Usam o grátis de ${mes}`}
          valor={gratisDeFora.length}
          detalhe={
            gratisDeFora.filter(noLimite).length === 1
              ? "1 já chegou ao limite"
              : `${gratisDeFora.filter(noLimite).length} já chegaram ao limite`
          }
          alerta={gratisDeFora.some(noLimite)}
        />
        <Numero
          href={linkDaAba("impulsos")}
          rotulo="Impulsos comprados (60 dias)"
          valor={impulsosComprados}
          detalhe={`${formatarMoeda(valorImpulsos)}; ${d.impulsos.reduce((s, i) => s + i.total, 0)} impulsos ao todo`}
        />
      </div>

      <SubAbas ativa={aba} numeros={numeros} />

      {aba === "liberados" && (
        <Secao
          titulo="Liberados"
          descricao="Quem tem cada recurso pago e como ganhou: pela assinatura, nos 15 dias grátis, na promoção de lançamento ou liberado pelo Publike sem prazo."
        >
          <FiltrosDaAba
            aba={aba}
            filtro={{ ...filtro, mostrar: mostrarLib }}
            mostrando={libFiltrados.length}
            total={baseLib.length}
            campos={[
              {
                nome: "mostrar",
                rotulo: "Quando",
                opcoes: [
                  { valor: "agora", nome: `Valendo agora (${ativos.length})` },
                  {
                    valor: "acabaram",
                    nome: `Já acabaram (${acabaram.length})`,
                  },
                  { valor: "todos", nome: "Todos" },
                ],
              },
              {
                nome: "recurso",
                rotulo: "Recurso",
                opcoes: [TODOS, ...recursosDe(d.liberados)],
              },
              {
                nome: "como",
                rotulo: "Como",
                opcoes: [
                  TODOS,
                  ...(
                    ["promocao", "assinatura", "15_dias", "publike"] as Como[]
                  ).map((c) => ({ valor: c, nome: NOME_COMO[c] })),
                ],
              },
            ]}
          />
          {libFiltrados.length ? (
            <TabelaDeLiberados linhas={libFiltrados} admin={admin} />
          ) : (
            <p className="text-body-sm text-ink-muted">
              {baseLib.length
                ? "Nada com esses filtros. Troque ou limpe os filtros acima."
                : "Nenhuma conta tem recurso pago ligado agora."}
            </p>
          )}
        </Secao>
      )}

      {aba === "promocao" && (
        <>
          <Secao
            titulo="Promoção de lançamento"
            descricao="Libere recursos pagos para uma conta, sem custo, até uma data. A empresa vê “Promoção de lançamento até…” em cada recurso, recebe o aviso no sino e, 3 dias antes do fim, outro aviso para assinar."
          >
            <LiberarPromocao />
          </Secao>

          <Secao
            titulo="Na promoção agora"
            descricao="As contas com a promoção valendo. “Acabar agora” tira só a promoção (a assinatura e os 15 dias ficam)."
          >
            {naPromocao.length > 0 && (
              <FiltrosDaAba
                aba={aba}
                filtro={filtro}
                mostrando={promoFiltrados.length}
                total={naPromocao.length}
                campos={[
                  {
                    nome: "recurso",
                    rotulo: "Recurso",
                    opcoes: [TODOS, ...recursosDe(naPromocao)],
                  },
                  {
                    nome: "mostrar",
                    rotulo: "Fim",
                    opcoes: [
                      TODOS,
                      { valor: "acabam", nome: "Acabam em até 7 dias" },
                    ],
                  },
                ]}
              />
            )}
            {promoFiltrados.length ? (
              <TabelaDeLiberados linhas={promoFiltrados} admin={admin} />
            ) : (
              <p className="text-body-sm text-ink-muted">
                {naPromocao.length
                  ? "Nada com esses filtros. Troque ou limpe os filtros acima."
                  : "Ninguém na promoção ainda."}
              </p>
            )}
          </Secao>
        </>
      )}

      {aba === "assinaturas" && (
        <Secao
          titulo="Assinaturas"
          descricao="As do sandbox e as das contas de teste ficam de fora; para vê-las, escolha “Com sandbox e contas de teste”."
        >
          {d.assinaturas.length > 0 && (
            <FiltrosDaAba
              aba={aba}
              filtro={filtro}
              mostrando={assFiltradas.length}
              total={
                filtro.mostrar === "testes"
                  ? d.assinaturas.length
                  : assSemTestes.length
              }
              campos={[
                {
                  nome: "situacao",
                  rotulo: "Situação",
                  opcoes: [
                    TODOS,
                    { valor: "ativa", nome: "Ativas" },
                    { valor: "cancelada", nome: "Canceladas" },
                    { valor: "outras", nome: "Outras (pendentes, vencidas)" },
                  ],
                },
                {
                  nome: "recurso",
                  rotulo: "Plano",
                  opcoes: [TODOS, ...recursosDe(d.assinaturas)],
                },
                {
                  nome: "mostrar",
                  rotulo: "Testes",
                  opcoes: [
                    { valor: "", nome: "Sem sandbox e contas de teste" },
                    { valor: "testes", nome: "Com sandbox e contas de teste" },
                  ],
                },
              ]}
            />
          )}
          {assFiltradas.length ? (
            <Tabela
              cabecalho={["Empresa", "Plano", "Valor", "Situação", "Desde"]}
            >
              {assFiltradas.map((a) => (
                <tr
                  key={`${a.conta_id}-${a.recurso}-${a.criada_em}`}
                  className="align-top"
                >
                  <td className="px-2 py-2">
                    <Conta
                      admin={admin}
                      id={a.conta_id}
                      nome={a.nome}
                      teste={a.conta_de_teste}
                    />
                  </td>
                  <td className="px-2 py-2">{nomeDoRecurso(a.recurso)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {formatarMoeda(Number(a.valor))}{" "}
                    {NOME_CICLO[a.ciclo]?.toLowerCase()},{" "}
                    {a.forma === "pix" ? "Pix" : "cartão"}
                  </td>
                  <td className="px-2 py-2">
                    <span className="flex flex-wrap gap-1">
                      <Selo
                        variante={a.situacao === "ativa" ? "match" : "contorno"}
                      >
                        {a.situacao}
                      </Selo>
                      {a.sandbox && <Selo variante="contorno">Sandbox</Selo>}
                    </span>
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {formatarDataCurta(a.criada_em)}
                    {a.cancelada_em && (
                      <span className="block text-caption text-ink-muted">
                        cancelada {formatarDataCurta(a.cancelada_em)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </Tabela>
          ) : (
            <p className="text-body-sm text-ink-muted">
              {d.assinaturas.length
                ? "Nada com esses filtros. Troque ou limpe os filtros acima."
                : "Ninguém assinou ainda."}
            </p>
          )}
        </Secao>
      )}

      {aba === "gratis" && (
        <Secao
          acoes={
            // Convites só abre no computador do dono
            admin ? (
              <Link
                href="/admin/convites?aba=divulgar&publico=limite"
                className={classesBotao("secundario", "sm")}
              >
                Mandar mensagem a quem chegou ao limite
              </Link>
            ) : undefined
          }
          titulo={`Grátis de ${mes}`}
          descricao={`Quem usa a parte grátis deste mês: a IA lê ${d.limite_triagem} candidatos e a empresa pede ${d.limite_gravadas} entrevistas gravadas. Quem chegou ao limite é quem mais precisa do plano.`}
        >
          {d.gratis.length > 0 && (
            <FiltrosDaAba
              aba={aba}
              filtro={filtro}
              mostrando={gratisFiltrados.length}
              total={d.gratis.length}
              campos={[
                {
                  nome: "mostrar",
                  rotulo: "Limite",
                  opcoes: [
                    TODOS,
                    {
                      valor: "limite",
                      nome: `Só no limite (${d.gratis.filter(noLimite).length})`,
                    },
                  ],
                },
              ]}
            />
          )}
          {gratisFiltrados.length ? (
            <Tabela
              cabecalho={["Empresa", "Lidos pela IA", "Gravadas pedidas", ""]}
              min={560}
            >
              {gratisFiltrados.map((g) => (
                <tr key={g.conta_id} className="align-top">
                  <td className="px-2 py-2">
                    <Conta
                      admin={admin}
                      id={g.conta_id}
                      nome={g.nome}
                      tipo={g.tipo}
                      teste={g.conta_de_teste}
                    />
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    {g.lidos === null
                      ? "Paga"
                      : `${g.lidos} de ${d.limite_triagem}`}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    {g.pedidas === null
                      ? "Paga"
                      : `${g.pedidas} de ${d.limite_gravadas}`}
                    {g.pedidas ? (
                      <span className="block text-caption text-ink-muted">
                        {g.enviadas} enviadas
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2">
                    {noLimite(g) && <Selo variante="aviso">No limite</Selo>}
                  </td>
                </tr>
              ))}
            </Tabela>
          ) : (
            <p className="text-body-sm text-ink-muted">
              {d.gratis.length
                ? "Nada com esses filtros. Troque ou limpe os filtros acima."
                : "Ninguém usou o grátis deste mês ainda."}
            </p>
          )}
        </Secao>
      )}

      {aba === "impulsos" && (
        <Secao
          titulo="Impulsos dos últimos 60 dias"
          descricao="Por conta: os comprados, os do crédito, as cortesias e os dados pela equipe (com os automáticos)."
        >
          {d.impulsos.length > 0 && (
            <FiltrosDaAba
              aba={aba}
              filtro={filtro}
              mostrando={impFiltrados.length}
              total={d.impulsos.length}
              campos={[
                {
                  nome: "origem",
                  rotulo: "Como",
                  opcoes: [
                    TODOS,
                    { valor: "compra", nome: "Comprados" },
                    { valor: "credito", nome: "Do crédito" },
                    { valor: "cortesia", nome: "Cortesias" },
                    { valor: "admin", nome: "Pela equipe" },
                  ],
                },
              ]}
            />
          )}
          {impFiltrados.length ? (
            <Tabela
              cabecalho={["Empresa", "Total", "Como", "Valor pago", "Último"]}
            >
              {impFiltrados.map((i) => (
                <tr key={i.conta_id} className="align-top">
                  <td className="px-2 py-2">
                    <Conta
                      admin={admin}
                      id={i.conta_id}
                      nome={i.nome}
                      tipo={i.tipo}
                    />
                  </td>
                  <td className="px-2 py-2 text-right">{i.total}</td>
                  <td className="px-2 py-2">
                    {[
                      i.compra &&
                        `${i.compra} comprado${i.compra > 1 ? "s" : ""}`,
                      i.credito && `${i.credito} do crédito`,
                      i.cortesia &&
                        `${i.cortesia} cortesia${i.cortesia > 1 ? "s" : ""}`,
                      i.admin &&
                        `${i.admin} pela equipe${i.automaticos ? ` (${i.automaticos} automático${i.automaticos > 1 ? "s" : ""})` : ""}`,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    {formatarMoeda(Number(i.valor))}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {formatarDataCurta(i.ultimo)}
                  </td>
                </tr>
              ))}
            </Tabela>
          ) : (
            <p className="text-body-sm text-ink-muted">
              {d.impulsos.length
                ? "Nada com esses filtros. Troque ou limpe os filtros acima."
                : "Nenhum impulso nos últimos 60 dias."}
            </p>
          )}
        </Secao>
      )}
      {aba === "uso" && (
        <UsoDosRecursos uso={uso} erro={usoLido?.error ?? null} filtro={filtro} dias={diasDoUso} admin={admin} agora={await agoraDaRequisicao()} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ o histórico de uso (migração 20270925120000)

type DadosDoUso = {
  dias: number;
  por_dia: { dia: string; recurso: string; usos: number }[];
  contas: {
    conta_id: string;
    nome: string;
    tipo: string;
    recurso: string;
    usos: number;
    vagas: number;
    primeiro: string;
    ultimo: string;
    conta_de_teste: boolean;
  }[];
  eventos: {
    quando: string;
    conta_id: string;
    nome: string;
    recurso: string;
    o_que: string;
    vaga: string | null;
    conta_de_teste: boolean;
  }[];
};

const RECURSOS_COM_USO = ["copiloto", "testes", "video", "automacoes", "salarios"];

function UsoDosRecursos({
  uso,
  erro,
  filtro,
  dias,
  admin,
  agora,
}: {
  agora: number;
  uso: DadosDoUso | null;
  erro: { code?: string; message: string } | null;
  filtro: Filtro;
  dias: number;
  admin: boolean;
}) {
  if (!uso) {
    if (erro && erro.code !== "PGRST202") throw new Error(`Publike: falha ao ler o uso dos recursos (${erro.message}).`);
    return (
      <Aviso tipo="alerta" titulo="Rode a migração do uso dos recursos">
        Falta a migração 20270925120000_uso_dos_recursos_pagos.sql neste banco.
      </Aviso>
    );
  }
  const comTestes = filtro.situacao === "testes";
  const serve = (x: { nome: string; recurso: string; conta_de_teste: boolean }) =>
    (!filtro.q || chave(x.nome).includes(chave(filtro.q))) &&
    (!filtro.recurso || x.recurso === filtro.recurso) &&
    (comTestes || !x.conta_de_teste);
  const contas = uso.contas.filter(serve);
  const eventos = uso.eventos.filter(serve);
  // o gráfico: os usos de cada dia (sem as contas de teste), do recurso escolhido ou de todos
  const porDia = new Map<string, number>();
  for (const d of uso.por_dia)
    if (!filtro.recurso || d.recurso === filtro.recurso) porDia.set(d.dia, (porDia.get(d.dia) ?? 0) + d.usos);
  const hoje = new Date(agora);
  const diasDoGrafico = Array.from({ length: dias }, (_, i) => {
    const x = new Date(hoje.getTime() - (dias - 1 - i) * 24 * 3600 * 1000);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(x);
  });
  const maior = Math.max(1, ...diasDoGrafico.map((d) => porDia.get(d) ?? 0));
  const totalPorRecurso = RECURSOS_COM_USO.map((r) => ({
    r,
    n: uso.por_dia.filter((d) => d.recurso === r).reduce((s, d) => s + d.usos, 0),
  }));
  const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const quando = (iso: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(iso));
  return (
    <Secao
      titulo={`Uso dos recursos pagos nos últimos ${dias} dias`}
      descricao="O que cada conta fez com cada recurso, de onde o uso fica registrado: candidatos avaliados na Triagem com IA, testes enviados, entrevistas em vídeo pedidas, o que as automações fizeram e as consultas de salário. Visões das vagas e Contato no convite não deixam registro de uso. O gráfico e os totais não contam as contas de teste."
    >
      <FiltrosDaAba
        aba="uso"
        filtro={filtro}
        mostrando={contas.length}
        total={uso.contas.length}
        campos={[
          {
            nome: "recurso",
            rotulo: "Recurso",
            opcoes: [TODOS, ...RECURSOS_COM_USO.map((r) => ({ valor: r, nome: nomeDoRecurso(r) }))],
          },
          {
            nome: "mostrar",
            rotulo: "Período",
            opcoes: [
              { valor: "", nome: "30 dias" },
              { valor: "7", nome: "7 dias" },
              { valor: "90", nome: "90 dias" },
            ],
          },
          {
            nome: "situacao",
            rotulo: "Contas de teste",
            opcoes: [
              { valor: "", nome: "Sem as de teste" },
              { valor: "testes", nome: "Com as de teste" },
            ],
          },
        ]}
      />

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-body-sm">
        {totalPorRecurso.map(({ r, n }) => (
          <span key={r}>
            <span className="text-ink-muted">{nomeDoRecurso(r)}:</span>{" "}
            <span className="font-semibold tabular-nums">{formatarNumero(n)}</span>
          </span>
        ))}
      </div>

      <figure className="flex flex-col gap-2">
        <div
          className="flex h-32 items-end gap-px rounded-md border border-line bg-surface-300/40 px-2 pt-2"
          role="img"
          aria-label={`Usos por dia nos últimos ${dias} dias${filtro.recurso ? `, ${nomeDoRecurso(filtro.recurso)}` : ""}`}
        >
          {diasDoGrafico.map((d) => {
            const n = porDia.get(d) ?? 0;
            return (
              <div
                key={d}
                title={`${ddmm(d)}: ${n} ${n === 1 ? "uso" : "usos"}`}
                className={`min-w-0 flex-1 rounded-t-sm ${n ? "bg-cerrado" : "bg-line"}`}
                style={{ height: `${Math.max(n ? 6 : 2, Math.round((n / maior) * 100))}%` }}
              />
            );
          })}
        </div>
        <figcaption className="flex justify-between text-caption text-ink-muted">
          <span>{ddmm(diasDoGrafico[0])}</span>
          <span>{porDia.size ? `o dia com mais: ${maior}` : "nenhum uso no período"}</span>
          <span>hoje</span>
        </figcaption>
      </figure>

      <h3 className="text-h3">Por conta</h3>
      {contas.length ? (
        <Tabela cabecalho={["Empresa", "Recurso", "Total", "Vagas", "Primeiro uso", "Último uso"]}>
          {contas.map((x) => (
            <tr key={`${x.conta_id}:${x.recurso}`} className="align-top">
              <td className="px-2 py-2">
                <Conta admin={admin} id={x.conta_id} nome={x.nome} tipo={x.tipo} teste={x.conta_de_teste} />
              </td>
              <td className="px-2 py-2">{nomeDoRecurso(x.recurso)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{x.usos}</td>
              <td className="px-2 py-2 tabular-nums">{x.vagas || "—"}</td>
              <td className="px-2 py-2 whitespace-nowrap">{formatarDataCurta(x.primeiro)}</td>
              <td className="px-2 py-2 whitespace-nowrap">{formatarDataCurta(x.ultimo)}</td>
            </tr>
          ))}
        </Tabela>
      ) : (
        <p className="text-body-sm text-ink-muted">Nenhum uso com esses filtros neste período.</p>
      )}

      <h3 className="text-h3">Os últimos usos</h3>
      {eventos.length ? (
        <Tabela cabecalho={["Quando", "Empresa", "Recurso", "O que", "Vaga"]}>
          {eventos.slice(0, 200).map((e, i) => (
            <tr key={`${e.quando}:${e.conta_id}:${i}`} className="align-top">
              <td className="px-2 py-2 whitespace-nowrap tabular-nums">{quando(e.quando)}</td>
              <td className="px-2 py-2">
                <Conta admin={admin} id={e.conta_id} nome={e.nome} teste={e.conta_de_teste} />
              </td>
              <td className="px-2 py-2">{nomeDoRecurso(e.recurso)}</td>
              <td className="px-2 py-2">{e.o_que}</td>
              <td className="px-2 py-2 text-ink-muted">{e.vaga ?? "—"}</td>
            </tr>
          ))}
        </Tabela>
      ) : (
        <p className="text-body-sm text-ink-muted">Nenhum uso com esses filtros neste período.</p>
      )}
    </Secao>
  );
}
