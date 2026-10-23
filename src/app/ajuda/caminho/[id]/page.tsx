import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CompartilharCaminho } from "@/components/assistente/compartilhar-caminho";
import { PassosDoCaminho } from "@/components/assistente/passos-caminho";
import { Container } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { todosOsCaminhos } from "@/lib/ajuda";
import { SITE_URL } from "@/lib/config";
import { TIPOS_CONTA } from "@/lib/constantes";

// O passo a passo de um caminho, com as telas: a página para mandar a quem ainda não usa o Publike.

export function generateStaticParams() {
  return todosOsCaminhos().map((c) => ({ id: c.id }));
}

function acharCaminho(id: string) {
  return todosOsCaminhos().find((c) => c.id === id) ?? null;
}

const tituloDo = (c: NonNullable<ReturnType<typeof acharCaminho>>) =>
  c.tipo === "pessoa"
    ? `${c.jornada.nome}: passo a passo`
    : `${TIPOS_CONTA[c.tipo].nome}: ${c.jornada.nome.toLowerCase()}, passo a passo`;

export async function generateMetadata({ params }: PageProps<"/ajuda/caminho/[id]">): Promise<Metadata> {
  const { id } = await params;
  const c = acharCaminho(id);
  if (!c) return {};
  return {
    title: tituloDo(c),
    description: c.jornada.resumo,
    alternates: { canonical: `/ajuda/caminho/${c.id}` },
    openGraph: { title: `${tituloDo(c)} | Publike`, description: c.jornada.resumo },
  };
}

export default function Caminho({ params }: PageProps<"/ajuda/caminho/[id]">) {
  return (
    <Suspense fallback={<Container className="py-12" />}>
      {params.then(({ id }) => (
        <Conteudo id={id} />
      ))}
    </Suspense>
  );
}

function Conteudo({ id }: { id: string }) {
  const c = acharCaminho(id);
  if (!c) notFound();
  const outros = todosOsCaminhos().filter((o) => o.id !== c.id);
  const url = `${SITE_URL}/ajuda/caminho/${c.id}`;
  const primeiro = c.jornada.passos[0]?.link;

  return (
    <>
      <section className="border-b border-line">
        <Container className="py-8 sm:py-12">
          <Link
            href="/ajuda#passo-a-passo"
            className="inline-flex min-h-10 items-center gap-2 text-label text-ink-muted hover:text-ink"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Ajuda
          </Link>
          <p className="mt-4 text-label text-terra-text">
            Passo a passo · {TIPOS_CONTA[c.tipo].nome}
            {c.tipo === "pessoa" ? "" : ` · ${c.jornada.nome}`}
          </p>
          <h1 className="mt-1 text-h1 sm:text-display">
            {c.tipo === "pessoa" ? c.jornada.nome : TIPOS_CONTA[c.tipo].nome}
          </h1>
          <p className="mt-3 max-w-2xl text-body-lg text-ink-muted">{c.jornada.resumo}</p>
          <div className="mt-5">
            <CompartilharCaminho url={url} texto={`Publike, ${tituloDo(c).toLowerCase()}: ${c.jornada.resumo}`} />
          </div>
        </Container>
      </section>

      <Container className="max-w-4xl py-8 sm:py-10">
        <PassosDoCaminho passos={c.jornada.passos} />

        <section className="mt-10 flex flex-col items-start gap-3 rounded-lg bg-surface-300 p-5 sm:p-6">
          <h2 className="text-h3">Pronto para começar?</h2>
          <p className="text-body text-ink-muted">É grátis, sem senha e funciona no celular.</p>
          <div className="flex flex-wrap gap-2">
            {primeiro && (
              <BotaoLink href={primeiro.href} variante="primario">
                {primeiro.texto}
              </BotaoLink>
            )}
            <BotaoLink href="/">Ver o Publike</BotaoLink>
          </div>
        </section>

        <nav aria-label="Outros caminhos" className="mt-10">
          <h2 className="mb-3 text-label">Outros caminhos</h2>
          <ul className="flex flex-wrap gap-2">
            {outros.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/ajuda/caminho/${o.id}`}
                  className="inline-flex min-h-10 items-center rounded-pill border border-line-strong bg-surface-200 px-3.5 text-label hover:bg-surface-300"
                >
                  {TIPOS_CONTA[o.tipo].nome} · {o.jornada.nome}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </>
  );
}
