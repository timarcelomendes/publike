import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { conteudosAtuais } from "@/lib/servidor/conteudos-atuais";
import { CartaoConteudo } from "./cartao";

/** Os artigos que aparecem na página inicial: um de cada lado (números, quem procura, quem contrata). */
const NA_HOME = ["emprego-em-goias-2026", "emprego-perto-de-casa-goiania", "publicar-vaga-gratis-goiania"];

export async function ConteudosNaHome() {
  // com os números atualizados que o admin publicou (Admin › Conteúdos)
  const lista = await conteudosAtuais(NA_HOME);
  return (
    <section aria-labelledby="conteudos-home" className="mt-16 sm:mt-20">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="conteudos-home" className="text-h2 sm:text-h1">
            Trabalho em Goiânia, em números
          </h2>
          <p className="mt-2 max-w-2xl text-body text-ink-muted sm:text-body-lg">
            Como anda o emprego na região, dicas para achar vaga perto de casa e para contratar sem gastar.
          </p>
        </div>
        <Link href="/conteudos" className="inline-flex min-h-11 items-center gap-1.5 text-label text-terra-text hover:text-ink">
          Ver todos os conteúdos
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
      <ul className="mt-6 grid gap-4 md:grid-cols-3">
        {lista.map((c) => (
          <li key={c.slug}>
            <CartaoConteudo c={c} />
          </li>
        ))}
      </ul>
    </section>
  );
}
