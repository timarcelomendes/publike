import { ArrowLeft, ExternalLink, Lightbulb } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CapaNoticia } from "@/components/noticias/capa";
import { Container, Selo } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { SITE_URL } from "@/lib/config";
import { dataCurta, TEMAS_NOTICIA } from "@/lib/noticias";
import { noticiaDoSlug } from "@/lib/servidor/noticias";

export async function generateMetadata({ params }: PageProps<"/noticias/[slug]">): Promise<Metadata> {
  const n = await noticiaDoSlug((await params).slug);
  if (!n) return {};
  return {
    title: n.titulo,
    description: n.resumo,
    alternates: { canonical: `/noticias/${n.slug}` },
    openGraph: { type: "article", title: n.titulo, description: n.resumo, publishedTime: n.publicar_em ?? undefined },
  };
}

export default function Pagina({ params }: PageProps<"/noticias/[slug]">) {
  return (
    <Suspense fallback={<Container className="min-h-screen py-8 sm:py-12" />}>
      {params.then(({ slug }) => (
        <Noticia slug={slug} />
      ))}
    </Suspense>
  );
}

async function Noticia({ slug }: { slug: string }) {
  const n = await noticiaDoSlug(slug);
  if (!n) notFound();
  const dados = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: n.titulo,
    description: n.resumo,
    datePublished: n.publicar_em,
    inLanguage: "pt-BR",
    mainEntityOfPage: `${SITE_URL}/noticias/${n.slug}`,
    isBasedOn: n.fonte_url,
    author: { "@type": "Organization", name: "Publike", url: SITE_URL },
    publisher: { "@type": "Organization", name: "Publike", url: SITE_URL },
  };
  return (
    <Container className="py-8 sm:py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(dados).replace(/</g, "\\u003c") }}
      />
      <article className="mx-auto max-w-2xl">
        <Link href="/noticias" className="inline-flex items-center gap-2 text-body-sm text-ink-muted hover:text-ink">
          <ArrowLeft aria-hidden className="size-4" />
          Notícias
        </Link>
        <p className="mt-6 flex flex-wrap items-center gap-2 text-body-sm text-ink-muted">
          <Selo variante="contorno">{TEMAS_NOTICIA[n.tema]?.nome ?? n.tema}</Selo>
          {n.publicar_em && <time dateTime={n.publicar_em}>{dataCurta(n.publicar_em)}</time>}
          {n.cidade && <span>· {n.cidade}</span>}
        </p>
        <h1 className="mt-3 text-h1">{n.titulo}</h1>
        <p className="mt-3 text-body-lg">{n.resumo}</p>
        <CapaNoticia n={n} tamanho="grande" className="mt-6 aspect-video rounded-lg border border-line" />

        <div className="mt-6 flex flex-col gap-4 text-body">
          {n.corpo
            .split(/\n\s*\n/)
            .map((p) => p.trim())
            .filter(Boolean)
            .map((p, i) => (
              <p key={i}>{p}</p>
            ))}
        </div>

        {n.pratico && (
          <aside className="mt-8 flex gap-3 rounded-md bg-terra-soft p-4">
            <Lightbulb aria-hidden className="mt-0.5 size-5 shrink-0 text-terra-text" />
            <div>
              <h2 className="text-label text-terra-text">O que isso muda para você</h2>
              <p className="mt-1 text-body">{n.pratico}</p>
            </div>
          </aside>
        )}

        <section aria-labelledby="fonte" className="mt-8 border-t border-line pt-6">
          <h2 id="fonte" className="text-label">
            Fonte
          </h2>
          <p className="mt-1 text-body-sm text-ink-muted">
            Resumo feito pelo Publike a partir de{" "}
            <a
              href={n.fonte_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-ink underline underline-offset-2"
            >
              {n.fonte_nome}
              <ExternalLink aria-hidden className="size-3.5" />
            </a>
            {n.fonte_data
              ? `, de ${new Date(`${n.fonte_data}T12:00:00`).toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}`
              : ""}
            . Datas, endereços e valores podem mudar: confira na fonte antes de ir.
          </p>
        </section>

        <section className="mt-10 flex flex-col gap-3 rounded-lg border border-line-strong bg-surface-200 p-5">
          <h2 className="text-h3">Procurando trabalho perto de casa?</h2>
          <p className="text-body text-ink-muted">
            No Publike, as vagas e os bicos aparecem pela distância e pelo tempo de ônibus até você. É grátis.
          </p>
          <div className="flex flex-wrap gap-2">
            <BotaoLink href="/?tipo=vaga" variante="primario">
              Ver vagas perto de mim
            </BotaoLink>
            <BotaoLink href="/profissionais">Oferecer meus serviços</BotaoLink>
          </div>
        </section>
      </article>
    </Container>
  );
}
