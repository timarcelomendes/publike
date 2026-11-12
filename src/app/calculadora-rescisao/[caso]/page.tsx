import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CalculadoraRescisao } from "@/components/calculadora-rescisao";
import { DadosEstruturados } from "@/components/dados-estruturados";
import { CompartilharPagina } from "@/components/compartilhar-pagina";
import { MaisDoPublike } from "@/components/mais-do-publike";
import { Container } from "@/components/ui/basicos";
import { SITE_URL } from "@/lib/config";
import { calcularRescisao, dataBr } from "@/lib/rescisao";
import { CASOS_RESCISAO, casoDaRescisao, type CasoRescisao } from "@/lib/rescisao-casos";
import { ANO_DAS_TABELAS } from "@/lib/tabelas-trabalhistas";
import { IMAGEM_DO_SITE } from "@/lib/seo";

// A rescisão de um caso (claude/plano-rescisao-por-caso.md): a calculadora completa já marcada no caso, com o
// resumo do que entra e do que não entra, um exemplo resolvido pelas regras de verdade e perguntas próprias.

export function generateStaticParams() {
  return CASOS_RESCISAO.map((c) => ({ caso: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/calculadora-rescisao/[caso]">): Promise<Metadata> {
  const { caso } = await params;
  const c = casoDaRescisao(caso);
  if (!c) return {};
  const url = `/calculadora-rescisao/${c.slug}`;
  return {
    title: c.titulo,
    description: c.descricao,
    alternates: { canonical: url },
    openGraph: {
      images: [IMAGEM_DO_SITE],
      title: `${c.titulo} · Publike`,
      description: c.descricao,
      url,
      type: "website",
    },
  };
}

export default function PaginaCasoRescisao({ params }: PageProps<"/calculadora-rescisao/[caso]">) {
  return (
    <Suspense fallback={<Container className="py-12" />}>
      {params.then(({ caso }) => (
        <Conteudo slug={caso} />
      ))}
    </Suspense>
  );
}

const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Conteudo({ slug }: { slug: string }) {
  const c = casoDaRescisao(slug);
  if (!c) notFound();
  const outros = CASOS_RESCISAO.filter((o) => o.slug !== c.slug);

  return (
    <Container className="py-8 sm:py-10">
      <DadosEstruturados
        dados={[
          {
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: `Calculadora de rescisão: ${c.nome.toLowerCase()}`,
            url: `${SITE_URL}/calculadora-rescisao/${c.slug}`,
            applicationCategory: "FinanceApplication",
            operatingSystem: "Qualquer navegador",
            offers: { "@type": "Offer", price: "0", priceCurrency: "BRL" },
            inLanguage: "pt-BR",
          },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: c.perguntas.map((q) => ({
              "@type": "Question",
              name: q.p,
              acceptedAnswer: { "@type": "Answer", text: q.r },
            })),
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Calculadora de rescisão",
                item: `${SITE_URL}/calculadora-rescisao`,
              },
              { "@type": "ListItem", position: 2, name: c.nome, item: `${SITE_URL}/calculadora-rescisao/${c.slug}` },
            ],
          },
        ]}
      />
      <div className="max-w-3xl print:hidden">
        <nav aria-label="Você está em" className="text-body-sm text-ink-muted">
          <Link href="/calculadora-rescisao" className="underline underline-offset-2 hover:text-ink">
            Calculadora de rescisão
          </Link>{" "}
          / {c.nome}
        </nav>
        <h1 className="mt-2 text-h2 sm:text-h1">{c.h1}</h1>
        <p className="mt-3 text-body-lg text-ink-muted">{c.chamada}</p>
        <div className="mt-4">
          <CompartilharPagina
            caminho={`/calculadora-rescisao/${c.slug}`}
            texto={`${c.h1}: calcule grátis, com a conta de cada valor:`}
          />
        </div>
        <p className="mt-4 rounded-md border-l-4 border-ipe bg-surface-200 px-4 py-3 text-body">
          <strong>É uma estimativa, use como sugestão.</strong> Os resultados podem não ser precisos: qualquer detalhe
          do contrato de trabalho, da convenção coletiva da sua categoria ou uma informação que faltou aqui muda os
          valores. Use para conferir e tirar dúvidas, não como a verdade. Para o cálculo oficial, procure o sindicato,
          um advogado trabalhista ou a Justiça do Trabalho.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <h2 className="text-label">O que você recebe</h2>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-body">
              {c.recebe.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-label">O que não entra</h2>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-body text-ink-muted">
              {c.naoRecebe.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <CalculadoraRescisao inicial={c.inicial} />

      <div className="mt-14 flex max-w-3xl flex-col gap-10 print:hidden">
        <section aria-labelledby="atencao" className="flex flex-col gap-4">
          <h2 id="atencao" className="text-h3">
            O que muda neste caso
          </h2>
          {c.atencao.map((a) => (
            <div key={a.titulo}>
              <h3 className="text-label">{a.titulo}</h3>
              <p className="mt-1 text-body text-ink-muted">{a.texto}</p>
            </div>
          ))}
        </section>

        <Exemplo c={c} />

        <section aria-labelledby="perguntas">
          <h2 id="perguntas" className="text-h3">
            Perguntas frequentes
          </h2>
          <dl className="mt-3 flex flex-col gap-4">
            {c.perguntas.map((q) => (
              <div key={q.p}>
                <dt className="text-label">{q.p}</dt>
                <dd className="mt-1 text-body text-ink-muted">{q.r}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="outros-casos">
          <h2 id="outros-casos" className="text-h3">
            Calcule pelo seu caso
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {outros.map((o) => (
              <li key={o.slug}>
                <Link
                  href={`/calculadora-rescisao/${o.slug}`}
                  className="inline-flex min-h-11 items-center rounded-pill border border-line-strong px-4 text-body-sm hover:bg-surface-200"
                >
                  {o.nome}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/calculadora-rescisao"
                className="inline-flex min-h-11 items-center rounded-pill border border-line-strong px-4 text-body-sm hover:bg-surface-200"
              >
                Todos os casos
              </Link>
            </li>
          </ul>
          <p className="mt-6 text-body">
            {c.seguro && (
              <>
                Veja se tem direito ao{" "}
                <Link href="/seguro-desemprego" className="font-semibold underline underline-offset-2">
                  seguro-desemprego
                </Link>
                ,{" "}
              </>
            )}
            {c.seguro ? "monte" : "Monte"} um{" "}
            <Link href="/curriculo-simples" className="font-semibold underline underline-offset-2">
              currículo grátis
            </Link>{" "}
            e procure a próxima vaga nas{" "}
            <Link href="/vagas/goiania/ultimos-3-dias" className="font-semibold underline underline-offset-2">
              vagas dos últimos 3 dias
            </Link>
            .
          </p>
        </section>
      </div>

      <MaisDoPublike atual="rescisao" />
    </Container>
  );
}

/** O exemplo resolvido, calculado com as regras de verdade: muda sozinho quando as tabelas do ano mudarem. */
function Exemplo({ c }: { c: CasoRescisao }) {
  const r = calcularRescisao(c.exemplo.entrada);
  if (!r.ok) return null;
  const saca = r.fgts.saque + (r.fgts.domestico32?.recebe ?? 0);
  return (
    <section aria-labelledby="exemplo">
      <h2 id="exemplo" className="text-h3">
        Um exemplo, com as tabelas de {ANO_DAS_TABELAS}
      </h2>
      <p className="mt-2 text-body text-ink-muted">{c.exemplo.frase}</p>
      <table className="mt-3 w-full border-collapse text-body-sm tabular-nums">
        <caption className="sr-only">Exemplo de rescisão: {c.nome.toLowerCase()}</caption>
        <tbody>
          {r.proventos.map((l) => (
            <tr key={l.nome} className="border-b border-line">
              <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                {l.nome}
                {l.ref && <span className="text-ink-muted"> ({l.ref})</span>}
              </th>
              <td className="py-1.5 text-right">{reais(l.valor)}</td>
            </tr>
          ))}
          {r.descontos.map((l) => (
            <tr key={l.nome} className="border-b border-line text-ink-muted">
              <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                {l.nome}
                {l.ref && <span> ({l.ref})</span>}
              </th>
              <td className="py-1.5 text-right">− {reais(l.valor)}</td>
            </tr>
          ))}
          <tr>
            <th scope="row" className="py-2 pr-3 text-left font-semibold">
              Líquido a receber
            </th>
            <td className="py-2 text-right font-semibold">{reais(r.liquido)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-body-sm text-ink-muted">
        {saca > 0
          ? `FGTS: saca ${reais(saca)}${r.fgts.saldoEstimado ? " (com o saldo estimado)" : ""}. `
          : "FGTS: o saldo fica na conta. "}
        Prazo para a empresa pagar: {dataBr(r.prazoPagamento)}.
      </p>
    </section>
  );
}
