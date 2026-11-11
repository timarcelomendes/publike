import { Check, CreditCard } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AvisoDaFaixa } from "@/components/pagamentos/aviso-da-faixa";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Selo } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { recursosPagos } from "@/lib/dados";
import { formatarMoeda, primeiro } from "@/lib/formato";
import {
  ehPlanoPorFaixa,
  MESES,
  NOME_PRODUTO,
  O_PRODUTO,
  planoQueCabe,
  podeAssinarPacote,
  seCruzam,
  type Assinatura,
  type Ciclo,
  type PagamentosDaConta,
  type Produto,
} from "@/lib/pagamentos";
import { dataCurta, type EstadoRecurso, type RecursosPagos } from "@/lib/recursos-pagos";
import { pagamentosDaConta } from "@/lib/servidor/faturas";
import { minhaFaixa } from "@/lib/servidor/pagina-de-carreiras";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Planos", robots: { index: false } };

// Os planos à venda, lado a lado (pedido do Marcelo, 10/11/2026): o Grátis, as faixas do Plano Empresa ou do Plano
// Agência (pela conta) e, embaixo, cada recurso sozinho. Mostra a faixa em que as vagas no ar cabem e o que a conta já
// tem. Assinar continua em /painel/assinar; o que já se assina, em /painel/assinatura.

export default function PaginaPlanos({ searchParams }: PageProps<"/painel/planos">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

const GRATIS = [
  "Até 20 vagas no ar ao mesmo tempo",
  "Candidatos, quadro e mensagens",
  "Equipe sem limite de pessoas",
  "Página de carreiras com 10 vagas publicadas",
];

const DOS_PLANOS = [
  "Triagem com IA",
  "Teste Prático",
  "Entrevista em vídeo",
  "Automações personalizadas",
  "Consulta de salários",
  "Página de carreiras, sem esperar as 10 vagas",
];

const SO_DA_AGENCIA = [
  "Finalistas com a marca da agência",
  "Relatório por cliente",
  "Garantia acompanhada com o cliente",
  "Dossiê de cada finalista",
];

/** Cada recurso sozinho, na ordem em que aparece embaixo, com o que ele faz numa linha. */
const AVULSOS: { p: Produto; faz: string }[] = [
  { p: "copiloto", faz: "A IA lê os currículos contra o que a vaga pede." },
  { p: "testes", faz: "Confirme que a pessoa sabe fazer, com um teste pelo celular." },
  { p: "combo", faz: "A Triagem e o Teste Prático juntos, por menos." },
  { p: "video", faz: "Confirme que a pessoa sabe fazer, com respostas gravadas e o resumo da IA." },
  { p: "automacoes", faz: "As suas regras, o Publike faz sozinho." },
  { p: "salarios", faz: "Quanto o mercado paga para cada função." },
  { p: "carreiras", faz: "A sua página de vagas com a cara da empresa." },
];

const vagas = (n: number) => (n === 1 ? "1 vaga" : `${n} vagas`);

function preco(pag: PagamentosDaConta | null, p: Produto, ciclo: Ciclo) {
  return pag?.planos.find((x) => x.recurso === p && x.ciclo === ciclo) ?? null;
}

/** Como um recurso sozinho está na conta: assinado, liberado ou nos dias grátis; senão, nada. */
function situacao(e: EstadoRecurso | undefined, agora: number): string | null {
  if (!e) return null;
  if (e.assinante) return "Assinado";
  if (e.liberado && !e.ate) return "Liberado";
  if (e.liberado && e.ate) {
    const gratis = e.fim_experimento && new Date(e.fim_experimento).getTime() > agora;
    return gratis ? `Grátis até ${dataCurta(e.ate)}` : `Vale até ${dataCurta(e.ate)}`;
  }
  return null;
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/painel/planos">["searchParams"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/planos");
  const pedido = primeiro((await searchParams).ciclo);
  const ciclo: Ciclo = pedido === "3" ? "QUARTERLY" : pedido === "12" ? "YEARLY" : "MONTHLY";
  const [pag, recursos, faixa, agora] = await Promise.all([
    pagamentosDaConta(),
    recursosPagos(),
    minhaFaixa(),
    agoraDaRequisicao(),
  ]);

  if (!pag?.pode) {
    return (
      <div className="flex max-w-3xl flex-col gap-3">
        <h2 className="text-h2">Planos</h2>
        <p className="text-body text-ink-muted">
          Os planos são para quem contrata. Quem procura trabalho usa o Publike de graça, sempre.
        </p>
      </div>
    );
  }

  const noAr = faixa?.vagas_no_ar ?? 0;
  const valendo = pag.assinaturas.filter((a) => a.situacao !== "cancelada");
  const cabe = planoQueCabe(pag, faixa);
  const agencia = Boolean(cabe?.startsWith("agencia"));
  // as faixas do público da conta (Empresa ou Agência); antes da migração, o Plano Completo no lugar
  const faixas: Produto[] = cabe
    ? pag.planos
        .filter((x) => ehPlanoPorFaixa(x.recurso) && x.recurso.startsWith(agencia ? "agencia" : "empresa") && x.ciclo === "MONTHLY")
        .sort((a, b) => (a.limite_vagas ?? 0) - (b.limite_vagas ?? 0))
        .map((x) => x.recurso)
    : preco(pag, "completo", "MONTHLY")
      ? ["completo"]
      : [];
  // o plano que a conta já assina (um por faixa ou o Completo antigo)
  const meuPlano = valendo.find((a) => ehPlanoPorFaixa(a.recurso) || a.recurso === "completo") ?? null;
  const avulsos = AVULSOS.filter((a) => preco(pag, a.p, "MONTHLY"));
  // o anual e os 30 dias (migração 20270416120000): só aparecem quando o Admin põe à venda
  const temAnual = faixas.some((f) => preco(pag, f, "YEARLY"));
  const temTrinta = faixas.some((f) => preco(pag, f, "AVULSO"));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-h2">Planos</h2>
          <p className="mt-1 text-body text-ink-muted">
            Publicar vagas e receber candidatos é grátis, até 20 vagas no ar. O plano junta as ferramentas que adiantam a seleção,
            pelo número de vagas que você tem no ar.
          </p>
        </div>
        {valendo.length > 0 && (
          <Link href="/painel/assinatura" className="text-label text-terra-text underline underline-offset-2">
            Sua assinatura
          </Link>
        )}
      </div>

      <AvisoDaFaixa faixa={faixa} comLink={false} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body">
          Você tem <strong>{vagas(noAr)} no ar</strong> agora.
        </p>
        <TrocaCiclo ciclo={ciclo} anual={temAnual} />
      </div>

      <ul className={`grid gap-4 ${faixas.length >= 2 ? "lg:grid-cols-3" : faixas.length === 1 ? "md:grid-cols-2" : ""}`}>
        <li>
          <CartaoGratis atual={!meuPlano} agencia={agencia || faixa?.agencia === true} />
        </li>
        {faixas.map((p) => (
          <li key={p}>
            <CartaoPlano
              p={p}
              pag={pag}
              recursos={recursos}
              ciclo={ciclo}
              noAr={noAr}
              cabe={cabe === p || (p === "completo" && !cabe)}
              meu={meuPlano}
              agencia={agencia}
              cruza={
                [...valendo]
                  .sort((a, b) => Number(b.situacao === "ativa") - Number(a.situacao === "ativa"))
                  .find((a) => a.recurso !== p && seCruzam(a.recurso, p)) ?? null
              }
            />
          </li>
        ))}
      </ul>

      {avulsos.length > 0 && (
        <section aria-labelledby="avulsos" className="flex flex-col gap-3">
          <div>
            <h3 id="avulsos" className="text-h3">
              Ou só o que você precisa
            </h3>
            <p className="mt-1 text-body-sm text-ink-muted">Cada recurso sozinho, sem limite de vagas.</p>
          </div>
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
            {avulsos.map(({ p, faz }) => {
              const valor = preco(pag, p, "MONTHLY")?.valor ?? 0;
              const estado =
                p === "copiloto" || p === "testes" || p === "video" || p === "automacoes" || p === "salarios"
                  ? recursos?.[p]
                  : undefined;
              const tem = situacao(estado, agora) ?? (valendo.some((a) => a.recurso === p) ? "Assinado" : null);
              // o combo de quem já assina a Triagem ou o Teste (não valem juntos): sem o "Assinar"
              const cruza = valendo.find((a) => a.recurso !== p && seCruzam(a.recurso, p));
              return (
                <li key={p} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="text-label">{NOME_PRODUTO[p]}</p>
                    <p className="text-body-sm text-ink-muted">{faz}</p>
                  </div>
                  <p className="text-body-sm tabular-nums">
                    <strong className="text-label">{formatarMoeda(valor)}</strong> por mês
                  </p>
                  <div className="flex w-36 justify-end text-right">
                    {tem ? (
                      <span className="text-body-sm text-cerrado-text">{tem}</span>
                    ) : cruza ? (
                      <span className="text-body-sm text-ink-muted">Inclui {O_PRODUTO[cruza.recurso]}</span>
                    ) : (
                      <Link
                        href={`/painel/assinar?recurso=${p}`}
                        className="text-label text-terra-text underline underline-offset-2"
                      >
                        Assinar
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="regras" className="flex flex-col gap-2 border-t border-line pt-5">
        <h3 id="regras" className="text-label">
          Como funciona
        </h3>
        <ul className="grid gap-x-8 gap-y-2 text-body-sm text-ink-muted md:grid-cols-2">
          <li>Preço de lançamento: quem assina agora mantém o valor enquanto continuar assinando.</li>
          <li>Até 20 vagas no ar, é grátis. Para mais, só com um plano. Passou da faixa do plano, você tem 30 dias para mudar.</li>
          <li>Cartão ou Pix. Cancele quando quiser: o que já foi pago vale até o fim.</li>
          <li>Nada pago muda a ordem das vagas ou dos candidatos, e o candidato nunca paga.</li>
          {temAnual && <li>No anual, você paga 9 meses e usa 12.</li>}
          {temTrinta && <li>Por 30 dias: paga uma vez, vale 30 dias a partir do pagamento e não renova sozinho.</li>}
          {(temAnual || temTrinta) && (
            <li>No anual e nos 30 dias, desistiu em até 7 dias do pagamento, o dinheiro volta.</li>
          )}
          <li>Já assina e precisa de mais vagas? Mude para a faixa de cima pagando só a diferença dos dias que faltam.</li>
        </ul>
      </section>
    </div>
  );
}

/** Mensal, a cada 3 meses ou anual (quando está à venda), por link (sem JavaScript). */
function TrocaCiclo({ ciclo, anual }: { ciclo: Ciclo; anual: boolean }) {
  const opcoes: { c: Ciclo; nome: string; href: string }[] = [
    { c: "MONTHLY", nome: "Por mês", href: "/painel/planos" },
    { c: "QUARTERLY", nome: "A cada 3 meses", href: "/painel/planos?ciclo=3" },
    ...(anual ? [{ c: "YEARLY" as const, nome: "Anual", href: "/painel/planos?ciclo=12" }] : []),
  ];
  return (
    <nav aria-label="Como pagar" className="inline-flex rounded-pill border border-line bg-surface-200 p-1">
      {opcoes.map((o) => (
        <Link
          key={o.c}
          href={o.href}
          scroll={false}
          aria-current={o.c === ciclo ? "page" : undefined}
          className={`rounded-pill px-3.5 py-1.5 text-body-sm font-semibold ${
            o.c === ciclo ? "bg-ink text-surface-100" : "text-ink-muted hover:text-ink"
          }`}
        >
          {o.nome}
        </Link>
      ))}
    </nav>
  );
}

function Lista({ itens, titulo }: { itens: string[]; titulo?: string }) {
  return (
    <div className="flex flex-col gap-2">
      {titulo && <p className="text-body-sm font-semibold">{titulo}</p>}
      <ul className="flex flex-col gap-1.5 text-body-sm">
        {itens.map((t) => (
          <li key={t} className="flex gap-2">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-cerrado-text" />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CartaoGratis({ atual, agencia }: { atual: boolean; agencia: boolean }) {
  return (
    <article className="flex h-full flex-col gap-5 rounded-lg border border-line bg-surface-200 p-5 sm:p-6">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <h3 className="text-h3">Grátis</h3>
        {atual && <Selo variante="contorno">Seu plano</Selo>}
      </div>
      <p>
        <span className="text-h1 tabular-nums">R$ 0</span>
        <span className="block text-body-sm text-ink-muted">para sempre</span>
      </p>
      <Lista itens={agencia ? [...GRATIS, "Clientes, pedidos e finalistas por link"] : GRATIS} />
    </article>
  );
}

function CartaoPlano({
  p,
  pag,
  recursos,
  ciclo,
  noAr,
  cabe,
  meu,
  agencia,
  cruza,
}: {
  p: Produto;
  pag: PagamentosDaConta;
  recursos: RecursosPagos | null;
  ciclo: Ciclo;
  noAr: number;
  cabe: boolean;
  meu: Assinatura | null;
  agencia: boolean;
  /** uma assinatura de recurso que o plano inclui (não valem juntos) */
  cruza: Assinatura | null;
}) {
  const mensal = preco(pag, p, "MONTHLY");
  const escolhido = preco(pag, p, ciclo) ?? mensal;
  if (!mensal || !escolhido) return null;
  const limite = mensal.limite_vagas ?? null;
  const pequeno = limite != null && noAr > limite;
  const ehMeu = meu?.recurso === p;
  const porMes = escolhido.valor / MESES[escolhido.ciclo];
  const desconto = escolhido.ciclo !== "MONTHLY" ? Math.round((1 - porMes / mensal.valor) * 100) : 0;
  const trinta = preco(pag, p, "AVULSO");
  // a assinatura de plano por faixa de hoje, numa faixa menor da mesma família: muda pagando a diferença
  const subir =
    meu && ehPlanoPorFaixa(meu.recurso) && meu.situacao === "ativa" && limite != null &&
    String(meu.recurso).split("_")[0] === String(p).split("_")[0] &&
    (Number(String(meu.recurso).split("_")[1]) || 0) < limite;
  const linkCiclo = escolhido.ciclo === "QUARTERLY" ? "&ciclo=3" : escolhido.ciclo === "YEARLY" ? "&ciclo=12" : "";
  const recrutadores = p === "agencia_15" ? 3 : p === "agencia_200" ? 10 : null;
  const podeAssinar = !meu && !pequeno && podeAssinarPacote(pag, recursos, p as Parameters<typeof podeAssinarPacote>[2]);
  const nome = p === "completo" ? "Plano Completo" : agencia ? "Plano Agência" : "Plano Empresa";

  return (
    <article
      className={`flex h-full flex-col gap-5 rounded-lg border bg-surface-200 p-5 sm:p-6 ${
        ehMeu || (cabe && !meu) ? "border-2 border-ink shadow-card" : "border-line"
      } ${pequeno ? "opacity-70" : ""}`}
    >
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
        <h3 className="text-h3">
          {nome}
          {limite != null && <span className="block text-body-sm font-normal text-ink-muted">até {vagas(limite)} no ar</span>}
        </h3>
        {ehMeu ? (
          <Selo variante="match">Seu plano</Selo>
        ) : cabe && !meu ? (
          <Selo variante="aviso">Cabe nas suas vagas</Selo>
        ) : null}
      </div>
      {escolhido.ciclo === "QUARTERLY" || escolhido.ciclo === "YEARLY" ? (
        <p>
          <span className="text-h1 tabular-nums">{formatarMoeda(escolhido.valor)}</span>
          <span className="block text-body-sm text-ink-muted">
            {escolhido.ciclo === "YEARLY" ? "por ano" : "a cada 3 meses"}:{" "}
            {formatarMoeda(Math.round(porMes * 100) / 100)} por mês
            {desconto > 0 ? `, ${desconto}% a menos` : ""}
          </span>
        </p>
      ) : (
        <p>
          <span className="text-h1 tabular-nums">{formatarMoeda(porMes)}</span>
          <span className="block text-body-sm text-ink-muted">por mês, no cartão ou no Pix</span>
        </p>
      )}
      <div className="flex flex-col gap-4">
        <Lista
          titulo="Tudo do Grátis, mais:"
          itens={recrutadores ? [...DOS_PLANOS, `Até ${recrutadores} recrutadores usando`] : DOS_PLANOS}
        />
        {agencia && p !== "completo" && <Lista titulo="Só no Plano Agência:" itens={SO_DA_AGENCIA} />}
      </div>
      <div className="mt-auto border-t border-line pt-4">
        {ehMeu ? (
          <BotaoLink href="/painel/assinatura" variante="secundario" tamanho="sm">
            Ver a assinatura
          </BotaoLink>
        ) : pequeno ? (
          <p className="text-body-sm text-ink-muted">Você tem {vagas(noAr)} no ar: a faixa de cima cabe melhor.</p>
        ) : podeAssinar ? (
          <div className="flex flex-col items-start gap-2">
            <BotaoLink
              href={`/painel/assinar?recurso=${p}${linkCiclo}`}
              variante={cabe ? "primario" : "secundario"}
              tamanho="sm"
            >
              <CreditCard aria-hidden />
              Assinar
            </BotaoLink>
            {trinta && (
              <Link
                href={`/painel/assinar?recurso=${p}&trinta=1`}
                className="text-body-sm text-terra-text underline underline-offset-2"
              >
                Ou só por 30 dias, sem renovar: {formatarMoeda(trinta.valor)}
              </Link>
            )}
          </div>
        ) : subir ? (
          <BotaoLink href={`/painel/assinar?recurso=${p}&mudar=1`} variante="secundario" tamanho="sm">
            Mudar para esta faixa
          </BotaoLink>
        ) : meu ? (
          <p className="text-body-sm text-ink-muted">
            Para trocar de plano, cancele {NOME_PRODUTO[meu.recurso]} em{" "}
            <Link href="/painel/assinatura" className="underline underline-offset-2">
              Assinatura
            </Link>
            : o que já foi pago continua valendo.
          </p>
        ) : cruza ? (
          <p className="text-body-sm text-ink-muted">
            O plano inclui {O_PRODUTO[cruza.recurso]}, que você já assina. Para trocar, cancele em{" "}
            <Link href="/painel/assinatura" className="underline underline-offset-2">
              Assinatura
            </Link>{" "}
            e volte aqui: o que já foi pago continua valendo, e o plano só cobra quando ele acabar.
          </p>
        ) : (
          <p className="text-body-sm text-ink-muted">
            Os recursos do plano já estão liberados na sua conta, sem prazo.
          </p>
        )}
      </div>
    </article>
  );
}
