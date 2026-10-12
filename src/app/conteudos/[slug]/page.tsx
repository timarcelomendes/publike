import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CaminhosGratis, CorpoDoConteudo } from "@/components/conteudo/blocos";
import { CapaConteudo } from "@/components/conteudo/capa";
import { CartaoConteudo } from "@/components/conteudo/cartao";
import { Container, Selo } from "@/components/ui/basicos";
import { SITE_URL } from "@/lib/config";
import { CONTEUDOS, conteudoDoSlug, minutosDeLeitura, relacionados, TEMAS_CONTEUDO } from "@/lib/conteudos";

export function generateStaticParams() {
  return CONTEUDOS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/conteudos/[slug]">): Promise<Metadata> {
  const c = conteudoDoSlug((await params).slug);
  if (!c) return {};
  return {
    title: c.titulo,
    description: c.descricao,
    alternates: { canonical: `/conteudos/${c.slug}` },
    openGraph: { type: "article", title: c.titulo, description: c.descricao, publishedTime: c.publicado },
  };
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function dataPorExtenso(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

export default function Pagina({ params }: PageProps<"/conteudos/[slug]">) {
  return (
    <Suspense fallback={<Container className="min-h-screen py-8 sm:py-12" />}>
      {params.then(({ slug }) => (
        <Artigo slug={slug} />
      ))}
    </Suspense>
  );
}

function Artigo({ slug }: { slug: string }) {
  const c = conteudoDoSlug(slug);
  if (!c) notFound();
  const dados = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: c.titulo,
    description: c.descricao,
    datePublished: c.publicado,
    inLanguage: "pt-BR",
    mainEntityOfPage: `${SITE_URL}/conteudos/${c.slug}`,
    author: { "@type": "Organization", name: "Publike", url: SITE_URL },
    publisher: { "@type": "Organization", name: "Publike", url: SITE_URL },
  };
  return (
    <Container className="py-8 sm:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(dados).replace(/</g, "\\u003c") }} />
      <article className="mx-auto max-w-2xl">
        <Link href="/conteudos" className="inline-flex items-center gap-2 text-body-sm text-ink-muted hover:text-ink">
          <ArrowLeft aria-hidden className="size-4" />
          Conteúdos
        </Link>
        <div className="mt-6">
          <Selo variante="contorno">{TEMAS_CONTEUDO[c.tema].nome}</Selo>
        </div>
        <h1 className="mt-3 text-h1">{c.titulo}</h1>
        <p className="mt-3 text-body-lg text-ink">{c.descricao}</p>
        <p className="mt-3 text-body-sm text-ink-muted">
          Publike · {dataPorExtenso(c.publicado)} · {minutosDeLeitura(c)} min de leitura
        </p>
        <CapaConteudo c={c} tamanho="grande" className="mt-6 aspect-video rounded-lg border border-line" />
        <div className="mt-8">
          <CorpoDoConteudo c={c} />
        </div>
        {c.fontes.length > 0 && (
          <section aria-labelledby="fontes" className="mt-10 border-t border-line pt-6">
            <h2 id="fontes" className="text-h3">
              Fontes
            </h2>
            <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-body-sm text-ink-muted">
              {c.fontes.map((f) => (
                <li key={f.url}>
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-ink">
                    {f.titulo}
                  </a>{" "}
                  ({f.data})
                </li>
              ))}
            </ol>
            <p className="mt-3 text-body-sm text-ink-muted">
              O Publike é independente e não fala em nome do governo, do Sine ou de outros órgãos citados.
            </p>
          </section>
        )}
        <div className="mt-10">
          <CaminhosGratis />
        </div>
      </article>
        <section aria-labelledby="leia-tambem" className="mx-auto mt-12 max-w-5xl">
          <h2 id="leia-tambem" className="text-h3">
            Leia também
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-3">
            {relacionados(c).map((o) => (
              <li key={o.slug}>
                <CartaoConteudo c={o} />
              </li>
            ))}
          </ul>
        </section>
    </Container>
  );
}
