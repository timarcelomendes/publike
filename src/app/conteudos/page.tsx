import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CaminhosGratis } from "@/components/conteudo/blocos";
import { Container, Selo } from "@/components/ui/basicos";
import { conteudosDoTema, minutosDeLeitura, TEMAS_CONTEUDO, type TemaConteudo } from "@/lib/conteudos";

export const metadata: Metadata = {
  title: "Conteúdos sobre trabalho em Goiânia e região",
  description:
    "Números do emprego em Goiânia e Goiás, dicas para achar vaga perto de casa, contratar de graça, oferecer serviços e conhecer seus direitos.",
  alternates: { canonical: "/conteudos" },
};

const ORDEM: TemaConteudo[] = ["mercado", "procurar", "contratar", "servicos", "direitos"];

export default function Conteudos() {
  return (
    <>
      <section className="border-b border-line">
        <Container className="py-10 sm:py-14">
          <Selo variante="novo">Grátis</Selo>
          <h1 className="mt-3 text-h1 sm:text-display">Trabalho em Goiânia e região</h1>
          <p className="mt-3 max-w-2xl text-body-lg text-ink-muted">
            Os números do emprego, dicas para achar vaga perto de casa, contratar sem gastar e oferecer seus serviços. Tudo
            ligado às vagas e aos serviços grátis do Publike.
          </p>
          <nav aria-label="Temas" className="mt-6 flex flex-wrap gap-2">
            {ORDEM.map((t) => (
              <a
                key={t}
                href={`#${t}`}
                className="inline-flex min-h-10 items-center rounded-pill border border-line bg-surface-300 px-3.5 text-label hover:border-line-strong"
              >
                {TEMAS_CONTEUDO[t].nome}
              </a>
            ))}
          </nav>
        </Container>
      </section>
      <Container className="flex flex-col gap-12 py-10">
        {ORDEM.map((t) => (
          <section key={t} id={t} aria-labelledby={`tema-${t}`} className="scroll-mt-24">
            <h2 id={`tema-${t}`} className="text-h2">
              {TEMAS_CONTEUDO[t].nome}
            </h2>
            <p className="mt-1 text-body text-ink-muted">{TEMAS_CONTEUDO[t].descricao}</p>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {conteudosDoTema(t).map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/conteudos/${c.slug}`}
                    className="group flex h-full flex-col gap-2 rounded-lg border border-line bg-surface-200 p-5 shadow-card transition-shadow hover:shadow-raised"
                  >
                    <span className="text-h3">{c.titulo}</span>
                    <span className="line-clamp-3 flex-1 text-body-sm text-ink-muted">{c.descricao}</span>
                    <span className="mt-1 flex items-center justify-between text-body-sm text-ink-muted">
                      {minutosDeLeitura(c)} min de leitura
                      <ArrowRight aria-hidden className="size-4 text-terra-text transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <CaminhosGratis />
      </Container>
    </>
  );
}
