import { Newspaper } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CartaoNoticia } from "@/components/noticias/cartao";
import { Container } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { primeiro } from "@/lib/formato";
import { LISTA_TEMAS_NOTICIA, TEMAS_NOTICIA, type TemaNoticia } from "@/lib/noticias";
import { noticiasPublicadas } from "@/lib/servidor/noticias";
import { ONDE_FUNCIONA } from "@/lib/pracas";

export const metadata: Metadata = {
  title: `Notícias sobre trabalho em ${ONDE_FUNCIONA}`,
  description: `Vagas e feirões, salários, cursos gratuitos, concursos e o que muda nos seus direitos em ${ONDE_FUNCIONA}, em poucas linhas e com a fonte.`,
  alternates: { canonical: "/noticias" },
};

export default function Noticias({ searchParams }: PageProps<"/noticias">) {
  return (
    <>
      <section className="border-b border-line">
        <Container className="py-8 sm:py-12">
          <p className="text-caption text-terra-text uppercase">Atualizado todo dia</p>
          <h1 className="mt-2 text-h1 sm:text-display">Notícias do trabalho</h1>
          <p className="mt-3 max-w-2xl text-body-lg text-ink-muted">
            O que muda para quem trabalha e para quem contrata em {ONDE_FUNCIONA}. Em poucas linhas, com o link da
            notícia completa.
          </p>
        </Container>
      </section>
      <Container className="py-8 sm:py-10">
        <Suspense fallback={<div className="min-h-96" />}>
          {searchParams.then((sp) => (
            <Lista tema={primeiro(sp.tema)} />
          ))}
        </Suspense>
      </Container>
    </>
  );
}

const chip = (ativo: boolean) =>
  `inline-flex min-h-10 shrink-0 items-center gap-2 rounded-pill border px-3.5 text-label transition-colors ${
    ativo ? "border-ink bg-ink text-surface-100" : "border-line bg-surface-300 text-ink hover:border-line-strong"
  }`;

async function Lista({ tema: pedido }: { tema?: string }) {
  const todas = await noticiasPublicadas();
  if (!todas.length) {
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
  const tema = LISTA_TEMAS_NOTICIA.includes(pedido as TemaNoticia) ? (pedido as TemaNoticia) : null;
  const temas = LISTA_TEMAS_NOTICIA.filter((t) => todas.some((n) => n.tema === t));
  const lista = tema ? todas.filter((n) => n.tema === tema) : todas;
  const [destaque, ...resto] = lista;

  return (
    <div className="flex flex-col gap-8">
      {temas.length > 1 && (
        <nav aria-label="Assuntos" className="sem-barra -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <Link href="/noticias" className={chip(!tema)} aria-current={!tema ? "page" : undefined}>
            Todas
          </Link>
          {temas.map((t) => (
            <Link
              key={t}
              href={`/noticias?tema=${t}`}
              className={chip(tema === t)}
              aria-current={tema === t ? "page" : undefined}
            >
              {TEMAS_NOTICIA[t].nome}
            </Link>
          ))}
        </nav>
      )}
      {destaque ? (
        <>
          <CartaoNoticia n={destaque} destaque />
          {resto.length > 0 && (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {resto.map((n) => (
                <li key={n.id}>
                  <CartaoNoticia n={n} />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="py-10 text-center text-body text-ink-muted">Nenhuma notícia deste assunto ainda.</p>
      )}
      <section className="flex flex-col items-start gap-3 rounded-lg bg-surface-300 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-h3">Procurando trabalho perto de casa?</h2>
          <p className="mt-1 text-body text-ink-muted">
            Vagas e freelances pela distância e pelo tempo de ônibus. É grátis.
          </p>
        </div>
        <BotaoLink href="/?tipo=vaga" variante="primario">
          Ver vagas perto de mim
        </BotaoLink>
      </section>
    </div>
  );
}
