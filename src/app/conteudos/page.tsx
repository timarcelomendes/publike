import type { Metadata } from "next";
import { CaminhosGratis } from "@/components/conteudo/blocos";
import { CartaoConteudo } from "@/components/conteudo/cartao";
import { Container, Selo } from "@/components/ui/basicos";
import { CONTEUDOS, conteudosDoTema, TEMAS_CONTEUDO, type TemaConteudo } from "@/lib/conteudos";
import { ONDE_FUNCIONA } from "@/lib/pracas";

export const metadata: Metadata = {
  title: `Conteúdos sobre trabalho em ${ONDE_FUNCIONA}`,
  description:
    "Números do emprego em Goiânia e Goiás, dicas para achar vaga perto de casa, contratar de graça, oferecer serviços e conhecer seus direitos.",
  alternates: { canonical: "/conteudos" },
};

/** O artigo em destaque no topo. */
const DESTAQUE = CONTEUDOS[0];

const ORDEM: TemaConteudo[] = ["mercado", "procurar", "contratar", "servicos", "direitos"];

export default function Conteudos() {
  return (
    <>
      <section className="border-b border-line">
        <Container className="py-10 sm:py-14">
          <Selo variante="novo">Grátis</Selo>
          <h1 className="mt-3 text-h1 sm:text-display">Trabalho em {ONDE_FUNCIONA}</h1>
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
        <CartaoConteudo c={DESTAQUE} destaque />
        {ORDEM.map((t) => (
          <section key={t} id={t} aria-labelledby={`tema-${t}`} className="scroll-mt-24">
            <h2 id={`tema-${t}`} className="text-h2">
              {TEMAS_CONTEUDO[t].nome}
            </h2>
            <p className="mt-1 text-body text-ink-muted">{TEMAS_CONTEUDO[t].descricao}</p>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {conteudosDoTema(t)
                .filter((c) => c.slug !== DESTAQUE.slug)
                .map((c) => (
                <li key={c.slug}>
                  <CartaoConteudo c={c} />
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
