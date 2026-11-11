import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AvisoDaFaixa } from "@/components/pagamentos/aviso-da-faixa";
import { GradeDePlanos, preco, vagas } from "@/components/pagamentos/grade-de-planos";
import { CabecalhoDaPagina } from "@/components/painel/cabecalho-da-pagina";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { MODO_DEMO } from "@/lib/config";
import { recursosPagos } from "@/lib/dados";
import { formatarMoeda, primeiro } from "@/lib/formato";
import {
  ehPlanoPorFaixa,
  NOME_PRODUTO,
  O_PRODUTO,
  planoQueCabe,
  seCruzam,
  type Ciclo,
  type Produto,
} from "@/lib/pagamentos";
import { dataCurta, type EstadoRecurso } from "@/lib/recursos-pagos";
import { pagamentosDaConta } from "@/lib/servidor/faturas";
import { minhaFaixa } from "@/lib/servidor/pagina-de-carreiras";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import { BotaoLink } from "@/components/ui/botao";

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

/** Cada recurso sozinho, na ordem em que aparece embaixo, com o que ele faz numa linha. */
const AVULSOS: { p: Produto; faz: string }[] = [
  { p: "copiloto", faz: "A IA lê os currículos contra o que a vaga pede." },
  { p: "testes", faz: "Confirme que a pessoa sabe fazer, com um teste pelo celular." },
  { p: "combo", faz: "A Triagem e o Teste Prático juntos, por menos." },
  {
    p: "video",
    faz: "Confirme que a pessoa sabe fazer: respostas gravadas com o resumo da IA, sem limite, e até 10 entrevistas ao vivo pelo Publike por mês.",
  },
  { p: "automacoes", faz: "As suas regras, o Publike faz sozinho." },
  { p: "salarios", faz: "Quanto o mercado paga para cada função." },
  { p: "carreiras", faz: "A sua página de vagas com a cara da empresa." },
];

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
      <CabecalhoDaPagina
        titulo="Planos"
        descricao="Os planos são para quem contrata. Quem procura trabalho usa o Publike de graça, sempre."
      />
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
      <CabecalhoDaPagina
        titulo="Planos"
        descricao="Publicar vagas e receber candidatos é grátis, até 20 vagas no ar. O plano junta as ferramentas que adiantam a seleção, pelo número de vagas que você tem no ar."
        acoes={
          valendo.length > 0 ? (
            <BotaoLink href="/painel/assinatura" variante="secundario" tamanho="sm">
              Sua assinatura
            </BotaoLink>
          ) : undefined
        }
      />

      <AvisoDaFaixa faixa={faixa} comLink={false} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body">
          Você tem <strong>{vagas(noAr)} no ar</strong> agora.
        </p>
        <TrocaCiclo ciclo={ciclo} anual={temAnual} />
      </div>

      <GradeDePlanos
        faixas={faixas}
        pag={pag}
        recursos={recursos}
        ciclo={ciclo}
        noAr={noAr}
        cabe={cabe}
        meuPlano={meuPlano}
        agencia={agencia}
        agenciaNoGratis={agencia || faixa?.agencia === true}
        valendo={valendo}
      />

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
