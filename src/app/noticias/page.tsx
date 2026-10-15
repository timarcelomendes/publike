import { Newspaper } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Container, Selo } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { dataCurta, TEMAS_NOTICIA } from "@/lib/noticias";
import { noticiasPublicadas } from "@/lib/servidor/noticias";

export const metadata: Metadata = {
  title: "Notícias sobre trabalho em Goiânia e região",
  description:
    "Feirões de emprego, cursos gratuitos, concursos e mudanças nos seus direitos em Goiânia e região, em poucas linhas e com a fonte.",
  alternates: { canonical: "/noticias" },
};

export default function Noticias() {
  return (
    <>
      <section className="border-b border-line">
        <Container className="py-10 sm:py-14">
          <Selo variante="novo">Todo dia</Selo>
          <h1 className="mt-3 text-h1 sm:text-display">Notícias sobre trabalho</h1>
          <p className="mt-3 max-w-2xl text-body-lg text-ink-muted">
            Feirões de emprego, cursos gratuitos, concursos e o que muda nos seus direitos, em Goiânia e região. Em
            poucas linhas, com o link da notícia completa.
          </p>
        </Container>
      </section>
      <Container className="py-10">
        <Suspense fallback={<div className="min-h-96" />}>
          <Lista />
        </Suspense>
      </Container>
    </>
  );
}

async function Lista() {
  const noticias = await noticiasPublicadas();
  if (!noticias.length) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-10 text-center">
        <Newspaper aria-hidden className="size-10 text-ink-muted" />
        <h2 className="text-h3">As primeiras notícias chegam em breve</h2>
        <p className="text-body text-ink-muted">Enquanto isso, veja as vagas e os serviços perto de você.</p>
        <BotaoLink href="/?tipo=vaga" variante="primario">
          Ver vagas
        </BotaoLink>
      </div>
    );
  }
  return (
    <ul className="mx-auto flex max-w-3xl flex-col divide-y divide-line">
      {noticias.map((n) => (
        <li key={n.id} className="py-6 first:pt-0">
          <article className="flex flex-col gap-2">
            <p className="flex flex-wrap items-center gap-2 text-body-sm text-ink-muted">
              <Selo variante="contorno">{TEMAS_NOTICIA[n.tema]?.curto ?? n.tema}</Selo>
              {n.publicar_em && <time dateTime={n.publicar_em}>{dataCurta(n.publicar_em)}</time>}
              {n.cidade && <span>· {n.cidade}</span>}
            </p>
            <h2 className="text-h3">
              <Link href={`/noticias/${n.slug}`} className="hover:underline hover:underline-offset-4">
                {n.titulo}
              </Link>
            </h2>
            <p className="text-body text-ink-muted">{n.resumo}</p>
            <p className="text-body-sm text-ink-muted">Fonte: {n.fonte_nome}</p>
          </article>
        </li>
      ))}
    </ul>
  );
}
