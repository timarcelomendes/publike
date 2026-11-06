import {
  ArrowLeft,
  Building2,
  HandCoins,
  Lock,
  MapPinned,
  Search,
  Target,
  UsersRound,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { BotaoConsultar } from "@/components/salarios/botao-consultar";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Selo } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { classesEntrada } from "@/components/ui/campo";
import { buscarOcupacoes, ocupacao } from "@/lib/cbo";
import { MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil, recursosPagos } from "@/lib/dados";
import { formatarMoeda, formatarNumero, plural, primeiro } from "@/lib/formato";
import { codigoCbo, funcaoPeloTitulo } from "@/lib/funcao-cbo";
import { PRACAS, pracaDaCidade } from "@/lib/pracas";
import {
  chaveDaPraca,
  faixaDoBanco,
  fonteDaFaixa,
  nomeDaRegiao,
  reaisDaFaixa,
  type FaixaSalarial,
  type RegiaoSalario,
} from "@/lib/salarios";
import {
  consultaCompleta,
  salariosDaConta,
  talentosDaFuncao,
} from "@/lib/servidor/consulta-salarios";
import { pagamentosDaConta } from "@/lib/servidor/faturas";
import { exigirUsuario } from "@/lib/sessao";
import { criarClientePublico } from "@/lib/supabase/servidor";

export const metadata: Metadata = {
  title: "Salários",
  robots: { index: false },
};

// A consulta de salários de quem contrata (claude/plano-consulta-de-salarios.md, parte 1; migração 20270218120000):
// buscar a função, ver a faixa da praça (sempre grátis) e abrir a consulta completa com uma das consultas (5 de
// boas-vindas e mais 2 a cada 5 vagas novas) ou sem limite, para quem assina.

const ORDEM_DAS_REGIOES: RegiaoSalario[] = ["goiania", "anapolis", "go"];

export default function Salarios({
  searchParams,
}: PageProps<"/painel/salarios">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({
  searchParams,
}: {
  searchParams: PageProps<"/painel/salarios">["searchParams"];
}) {
  if (MODO_DEMO) return <SoComSupabase />;
  const sp = await searchParams;
  const q = (primeiro(sp.q) ?? "").trim().slice(0, 80);
  const pedido = primeiro(sp.cbo) ?? "";
  const cbo = /^\d{6}$/.test(pedido) && ocupacao(pedido) ? pedido : null;
  await exigirUsuario("/painel/salarios");
  const [perfil, conta, recursos, pag] = await Promise.all([
    obterMeuPerfil(),
    salariosDaConta(),
    recursosPagos(),
    pagamentosDaConta(),
  ]);
  if (!perfil || perfil.tipo === "pessoa") {
    return (
      <Aviso tipo="info" titulo="A consulta de salários é para quem contrata">
        Quem procura trabalho vê quanto o mercado paga para o que faz em Seu
        currículo.
      </Aviso>
    );
  }
  if (!conta) {
    return (
      <Aviso
        tipo="alerta"
        titulo="A consulta de salários ainda não está pronta"
      >
        Tente de novo em instantes.
      </Aviso>
    );
  }
  // a praça da conta (fora delas, Goiânia e região)
  const praca = pracaDaCidade(perfil.cidade) ?? PRACAS[0];
  const regiao = chaveDaPraca(praca.cidade) ?? "goiania";
  const precoMensal =
    pag?.planos.find((p) => p.recurso === "salarios" && p.ciclo === "MONTHLY")
      ?.valor ?? null;
  const podeAssinar = Boolean(recursos?.salarios.pode_assinar);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h2 className="flex flex-wrap items-center gap-2 text-h2">
          Salários do mercado
          <Selo variante="novo">Novo</Selo>
        </h2>
        <p className="mt-1 text-body text-ink-muted">
          Quanto se paga para cada função com carteira assinada, pelo Novo Caged
          do Ministério do Trabalho, e o que as vagas do Publike oferecem.
        </p>
      </div>
      <Saldo
        conta={conta}
        precoMensal={precoMensal}
        podeAssinar={podeAssinar}
      />
      <form
        action="/painel/salarios"
        className="flex flex-col gap-2"
        role="search"
      >
        <label htmlFor="funcao" className="text-label">
          Qual função?
        </label>
        <span className="flex gap-2">
          <input
            id="funcao"
            name="q"
            defaultValue={q}
            maxLength={80}
            placeholder="Auxiliar de cozinha, vendedor, recepcionista…"
            className={`${classesEntrada} flex-1`}
          />
          <button
            type="submit"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-line-strong px-4 text-label hover:bg-surface-300"
          >
            <Search aria-hidden className="size-4" />
            Buscar
          </button>
        </span>
      </form>
      {cbo ? (
        <Funcao
          cbo={cbo}
          q={q}
          regiao={regiao}
          cidades={praca.cidades}
          conta={conta}
          precoMensal={precoMensal}
          podeAssinar={podeAssinar}
        />
      ) : q ? (
        <Achadas q={q} regiao={regiao} consultadas={conta.consultadas} />
      ) : (
        <ComoFunciona />
      )}
      {!cbo && !conta.assinante && (
        <SuasConsultas consultadas={conta.consultadas} />
      )}
    </div>
  );
}

// a consulta fica salva por 30 dias: abrir a mesma função de novo não gasta
const DIAS_SALVA = 30;

/** Até quando a consulta aberta em `em` fica salva ("12/12"). */
function salvaAte(em: string) {
  return new Date(Date.parse(em) + DIAS_SALVA * 24 * 3600e3).toLocaleDateString(
    "pt-BR",
    { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" },
  );
}

/** O que é grátis e o que gasta, em três passos (claude/plano-salarios-mais-claro.md). */
function ComoFunciona() {
  const passos = [
    {
      titulo: "Busque a função",
      texto:
        "Escreva como você chama no dia a dia; o Publike acha o nome da carteira (a CBO).",
      preco: "Grátis",
    },
    {
      titulo: "Veja quanto a maioria paga",
      texto: "A faixa da sua região aparece ao lado de cada função.",
      preco: "Grátis",
    },
    {
      titulo: "Abra a consulta completa",
      texto:
        "Quanto oferecer, as regiões, o que as vagas do Publike pagam e os talentos. Fica salva por 30 dias.",
      preco: "1 consulta",
    },
  ];
  return (
    <section aria-labelledby="como-funciona" className="flex flex-col gap-3">
      <h3 id="como-funciona" className="text-label">
        Como funciona
      </h3>
      <ol className="flex flex-col gap-3">
        {passos.map((p, i) => (
          <li key={p.titulo} className="flex items-start gap-3">
            <span
              aria-hidden
              className="flex size-7 shrink-0 items-center justify-center rounded-pill bg-surface-300 text-label tabular-nums"
            >
              {i + 1}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-label">{p.titulo}</span>
                <span className="text-body-sm text-ink-muted">{p.preco}</span>
              </span>
              <span className="text-body-sm text-ink-muted">{p.texto}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** As funções abertas nos últimos 30 dias: reabrem sem gastar. */
function SuasConsultas({ consultadas }: { consultadas: Map<string, string> }) {
  const lista = [...consultadas.entries()]
    .map(([cbo, em]) => ({ o: ocupacao(cbo), cbo, em }))
    .filter((x) => x.o !== null)
    .sort((a, b) => b.em.localeCompare(a.em));
  if (!lista.length) return null;
  return (
    <section aria-labelledby="suas-consultas" className="flex flex-col gap-2">
      <h3 id="suas-consultas" className="text-label">
        Suas consultas
      </h3>
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
        {lista.map(({ o, cbo, em }) => (
          <li key={cbo}>
            <Link
              href={`/painel/salarios?cbo=${cbo}`}
              className="flex flex-col gap-0.5 px-4 py-3 hover:bg-surface-300 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <span className="text-label">{o!.nome}</span>
              <span className="shrink-0 text-body-sm text-ink-muted">
                Salva até {salvaAte(em)}: abrir não gasta
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Saldo({
  conta,
  precoMensal,
  podeAssinar,
}: {
  conta: NonNullable<Awaited<ReturnType<typeof salariosDaConta>>>;
  precoMensal: number | null;
  podeAssinar: boolean;
}) {
  if (conta.assinante) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-line bg-surface-200 px-4 py-3 text-body-sm text-cerrado-text">
        <HandCoins aria-hidden className="size-5 shrink-0" />
        Consultas sem limite com a sua assinatura.
      </p>
    );
  }
  return (
    <section
      aria-label="Suas consultas"
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center gap-3">
        <span className="font-display text-[34px] leading-none font-bold tabular-nums">
          {conta.saldo}
        </span>
        <p className="text-body-sm">
          <span className="block text-label">
            {conta.saldo === 1 ? "consulta" : "consultas"}
          </span>
          <span className="text-ink-muted">
            Publique mais {plural(conta.vagasFaltam, "vaga", "vagas")} e ganhe
            2.
          </span>
        </p>
      </div>
      {podeAssinar && (
        <BotaoLink
          href="/painel/assinar?recurso=salarios"
          variante="secundario"
          tamanho="sm"
          className="self-start sm:self-auto"
        >
          Sem limite
          {precoMensal ? ` por ${formatarMoeda(precoMensal)} por mês` : ""}
        </BotaoLink>
      )}
    </section>
  );
}

/** As funções achadas pelo que a pessoa escreveu (a regra das funções comuns primeiro), com a faixa ao lado. */
async function Achadas({
  q,
  regiao,
  consultadas,
}: {
  q: string;
  regiao: RegiaoSalario;
  consultadas: Map<string, string>;
}) {
  const regra = funcaoPeloTitulo(q);
  const lista = [
    ...(regra ? [ocupacao(regra.cbo)].filter((o) => o !== null) : []),
    ...buscarOcupacoes(q, 8),
  ]
    .filter((o, i, todos) => todos.findIndex((x) => x.cbo === o.cbo) === i)
    .slice(0, 8);
  if (!lista.length) {
    return (
      <Aviso tipo="info" titulo="Não achamos essa função">
        Tente outra palavra, como o nome que vai na carteira (ex.: “auxiliar de
        limpeza”).
      </Aviso>
    );
  }
  const banco = criarClientePublico();
  const faixas = await Promise.all(
    lista.map(async (o) => {
      const { data } = await banco.rpc("salario_da_funcao", {
        p_cbo: o.cbo,
        p_regiao: regiao,
      });
      return data?.[0] ? faixaDoBanco(data[0]) : null;
    }),
  );
  return (
    <section aria-label="Funções achadas" className="flex flex-col gap-2">
      <p className="text-body-sm text-ink-muted">
        Escolha a função para ver mais. Ver a faixa é grátis; a consulta
        completa usa 1 consulta.
      </p>
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
        {lista.map((o, i) => {
          const f = faixas[i];
          return (
            <li key={o.cbo}>
              <Link
                href={`/painel/salarios?q=${encodeURIComponent(q)}&cbo=${o.cbo}`}
                className="flex flex-col gap-0.5 px-4 py-3 hover:bg-surface-300 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <span className="min-w-0">
                  <span className="block text-label">{o.nome}</span>
                  <span className="text-caption text-ink-muted">
                    CBO {codigoCbo(o.cbo)}
                    {consultadas.has(o.cbo)
                      ? ` · salva até ${salvaAte(consultadas.get(o.cbo)!)}: abrir não gasta`
                      : ""}
                  </span>
                </span>
                <span className="shrink-0 text-body-sm tabular-nums text-ink-muted">
                  {f
                    ? `${reaisDaFaixa(f.p25)} a ${reaisDaFaixa(f.p75)}`
                    : "Sem dados suficientes"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

async function Funcao({
  cbo,
  q,
  regiao,
  cidades,
  conta,
  precoMensal,
  podeAssinar,
}: {
  cbo: string;
  q: string;
  regiao: RegiaoSalario;
  cidades: readonly string[];
  conta: NonNullable<Awaited<ReturnType<typeof salariosDaConta>>>;
  precoMensal: number | null;
  podeAssinar: boolean;
}) {
  const o = ocupacao(cbo)!;
  const { data } = await criarClientePublico().rpc("salario_da_funcao", {
    p_cbo: cbo,
    p_regiao: regiao,
  });
  const faixa = data?.[0] ? faixaDoBanco(data[0]) : null;
  const completa = faixa ? await consultaCompleta(cbo, cidades) : null;
  const talentos = completa ? await talentosDaFuncao(cbo, cidades) : 0;
  const voltar = q
    ? `/painel/salarios?q=${encodeURIComponent(q)}`
    : "/painel/salarios";

  return (
    <section aria-labelledby="funcao" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link
          href={voltar}
          className="inline-flex items-center gap-1.5 self-start text-body-sm text-ink-muted hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Outra função
        </Link>
        <h3 id="funcao" className="text-h3 text-balance">
          {o.nome}
        </h3>
        <p className="text-caption text-ink-muted">CBO {codigoCbo(cbo)}</p>
      </div>

      {!faixa ? (
        <Aviso tipo="info" titulo="Ainda sem dados dessa função">
          Há menos de 30 contratações com carteira dessa função em Goiás nos
          últimos 12 meses. Nenhuma consulta foi gasta.
        </Aviso>
      ) : (
        <>
          <FaixaDaPraca faixa={faixa} />
          {completa ? (
            <>
              {conta.consultadas.has(cbo) && !conta.assinante && (
                <p className="text-body-sm text-cerrado-text">
                  Consulta salva até {salvaAte(conta.consultadas.get(cbo)!)}.
                  Abrir de novo não gasta.
                </p>
              )}
              <Completa
                faixa={faixa}
                completa={completa}
                talentos={talentos}
                cidadeDaPraca={nomeDaRegiao(regiao)}
              />
            </>
          ) : (
            <Bloqueada
              cbo={cbo}
              conta={conta}
              precoMensal={precoMensal}
              podeAssinar={podeAssinar}
            />
          )}
        </>
      )}
    </section>
  );
}

/** A faixa da praça: sempre grátis (a mesma de quando se publica a vaga). */
function FaixaDaPraca({ faixa }: { faixa: FaixaSalarial }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-5">
      <p className="text-label text-ink-muted">{nomeDaRegiao(faixa.regiao)}</p>
      <p className="text-body">
        A maioria das contratações com carteira paga de{" "}
        <strong className="tabular-nums">
          {reaisDaFaixa(faixa.p25)} a {reaisDaFaixa(faixa.p75)}
        </strong>{" "}
        por mês. No meio,{" "}
        <strong className="tabular-nums">{reaisDaFaixa(faixa.p50)}</strong>.
      </p>
      {faixa.regiao === "go" && (
        <p className="text-body-sm text-ink-muted">
          Poucas contratações na praça: a conta usa Goiás inteiro.
        </p>
      )}
      <p className="text-caption text-ink-muted">{fonteDaFaixa(faixa)}</p>
    </div>
  );
}

function Bloqueada({
  cbo,
  conta,
  precoMensal,
  podeAssinar,
}: {
  cbo: string;
  conta: NonNullable<Awaited<ReturnType<typeof salariosDaConta>>>;
  precoMensal: number | null;
  podeAssinar: boolean;
}) {
  const itens = [
    { icone: MapPinned, texto: "Goiânia, Anápolis e Goiás lado a lado" },
    {
      icone: Building2,
      texto: "O que as vagas do Publike oferecem para a função",
    },
    {
      icone: UsersRound,
      texto: "Quantas pessoas da aba Talentos já trabalharam nela",
    },
    { icone: Target, texto: "Quanto oferecer para fechar rápido" },
  ];
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-dashed border-line-strong bg-surface-100 p-5">
      <p className="flex items-center gap-2 text-label">
        <Lock aria-hidden className="size-4 text-ink-muted" />
        Na consulta completa
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {itens.map(({ icone: Icone, texto }) => (
          <li key={texto} className="flex items-start gap-2 text-body-sm">
            <Icone
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-ink-muted"
            />
            {texto}
          </li>
        ))}
      </ul>
      {conta.saldo > 0 ? (
        <div className="flex flex-col gap-1.5">
          <BotaoConsultar cbo={cbo} texto="Ver a consulta completa" />
          <p className="text-body-sm text-ink-muted">
            Gasta 1 das suas {plural(conta.saldo, "consulta", "consultas")}.
            Abrir a mesma função de novo em 30 dias não gasta.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-body">
            Suas consultas acabaram. Publique mais{" "}
            {plural(conta.vagasFaltam, "vaga", "vagas")} e ganhe 2 consultas
            {podeAssinar ? ", ou assine para consultar sem limite." : "."}
          </p>
          <div className="flex flex-wrap gap-2">
            <BotaoLink href="/publicar" variante="primario">
              Publicar vaga
            </BotaoLink>
            {podeAssinar && (
              <BotaoLink
                href="/painel/assinar?recurso=salarios"
                variante="secundario"
              >
                Assinar
                {precoMensal
                  ? ` por ${formatarMoeda(precoMensal)} por mês`
                  : ""}
              </BotaoLink>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Completa({
  faixa,
  completa,
  talentos,
  cidadeDaPraca,
}: {
  faixa: FaixaSalarial;
  completa: NonNullable<Awaited<ReturnType<typeof consultaCompleta>>>;
  talentos: number;
  cidadeDaPraca: string;
}) {
  const regioes = ORDEM_DAS_REGIOES.flatMap((r) =>
    completa.regioes.filter((x) => x.regiao === r),
  );
  const pub = completa.publike;
  return (
    <div className="flex flex-col gap-4">
      <Bloco icone={Target} titulo="Quanto oferecer">
        <p className="text-body">
          A partir de{" "}
          <strong className="tabular-nums">{reaisDaFaixa(faixa.p50)}</strong>, o
          meio do mercado. Para fechar rápido, perto de{" "}
          <strong className="tabular-nums">{reaisDaFaixa(faixa.p75)}</strong>:
          mais do que 3 de cada 4 contratações com carteira pagam.
        </p>
        <p className="text-body-sm text-ink-muted">
          É uma referência, não uma regra: benefícios, escala e experiência
          pedida também contam.
        </p>
      </Bloco>

      <Bloco icone={MapPinned} titulo="Nas regiões">
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[28rem] text-left text-body-sm">
            <thead className="text-label text-ink-muted">
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Região
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  A maioria
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  No meio
                </th>
                <th scope="col" className="py-2 font-medium">
                  Contratações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {regioes.map((r) => (
                <tr key={r.regiao}>
                  <th scope="row" className="py-2 pr-3 text-left font-medium">
                    {nomeDaRegiao(r.regiao)}
                  </th>
                  <td className="py-2 pr-3">
                    {reaisDaFaixa(r.p25)} a {reaisDaFaixa(r.p75)}
                  </td>
                  <td className="py-2 pr-3">{reaisDaFaixa(r.p50)}</td>
                  <td className="py-2">{formatarNumero(r.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {regioes.length < 3 && (
          <p className="text-body-sm text-ink-muted">
            Onde não aparece, há menos de 30 contratações da função para fazer a
            conta.
          </p>
        )}
      </Bloco>

      <Bloco icone={Building2} titulo="No Publike">
        {pub ? (
          <p className="text-body">
            As vagas dessa função em {cidadeDaPraca} oferecem de{" "}
            <strong className="tabular-nums">
              {reaisDaFaixa(pub.p25)} a {reaisDaFaixa(pub.p75)}
            </strong>{" "}
            por mês; no meio,{" "}
            <strong className="tabular-nums">{reaisDaFaixa(pub.p50)}</strong>.{" "}
            <span className="text-ink-muted">
              {plural(pub.n, "vaga", "vagas")} de{" "}
              {plural(pub.contas, "empresa", "empresas")}, nos últimos 90 dias.
            </span>
          </p>
        ) : (
          <p className="text-body-sm text-ink-muted">
            Ainda poucas vagas dessa função no Publike em {cidadeDaPraca}{" "}
            (contamos só com 5 vagas ou mais, de 3 empresas ou mais, para
            ninguém descobrir o salário de uma empresa).
          </p>
        )}
      </Bloco>

      <Bloco icone={UsersRound} titulo="Na aba Talentos">
        <p className="text-body">
          {talentos > 0
            ? `${plural(talentos, "pessoa", "pessoas")} em ${cidadeDaPraca} já ${talentos === 1 ? "trabalhou" : "trabalharam"} nessa função.`
            : `Ainda ninguém da aba Talentos em ${cidadeDaPraca} trabalhou nessa função.`}
        </p>
        {talentos > 0 && (
          <BotaoLink
            href="/talentos"
            variante="secundario"
            tamanho="sm"
            className="self-start"
          >
            Ver os talentos
          </BotaoLink>
        )}
      </Bloco>

      <p className="text-caption text-ink-muted">
        Do Novo Caged: só contratações com carteira, em jornada integral, sem
        aprendiz; não diz os anos de experiência e chega com um a dois meses de
        atraso. É uma faixa, não uma promessa.
      </p>
    </div>
  );
}

function Bloco({
  icone: Icone,
  titulo,
  children,
}: {
  icone: typeof Target;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-5">
      <h4 className="flex items-center gap-2 text-label">
        <Icone aria-hidden className="size-4 text-terra-text" />
        {titulo}
      </h4>
      {children}
    </section>
  );
}
