import { Megaphone } from "lucide-react";
import type { Metadata } from "next";
import { CartaoDoPublike } from "@/components/home/cartao-do-publike";
import { MarcarNovidadesVistas } from "@/components/novidades/marcar-vistas";
import { Container } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { formatarData } from "@/lib/formato";
import { PARA_NOVIDADE } from "@/lib/novidades";
import { novidadesDoPublike } from "@/lib/servidor/novidades";

export const metadata: Metadata = {
  title: "Novidades do Publike",
  description: "O que mudou no Publike, o que chegou de novo e dicas para achar trabalho e contratar perto de casa.",
  alternates: { canonical: "/novidades" },
};

// Novidades do Publike: as principais evoluções, escritas em Admin › Novidades, e os banners marcados "Também em
// Novidades" (inclusive os que já saíram do ar), da mais nova para a mais antiga (claude/plano-novidades-do-publike.md).
export default async function Novidades() {
  const lista = await novidadesDoPublike();
  return (
    <>
      <section className="border-b border-line">
        <Container className="py-8 sm:py-12">
          <p className="text-caption text-terra-text uppercase">Do Publike</p>
          <h1 className="mt-2 text-h1 sm:text-display">Novidades do Publike</h1>
          <p className="mt-3 max-w-2xl text-body-lg text-ink-muted">
            O que chegou de novo, o que mudou e dicas para usar melhor o Publike.
          </p>
        </Container>
      </section>
      <Container className="py-8 sm:py-10">
        <MarcarNovidadesVistas quando={lista[0]?.quando ?? null} />
        {lista.length ? (
          <ul className="mx-auto flex max-w-3xl flex-col gap-5">
            {lista.map((n) => (
              <li key={n.id}>
                <CartaoDoPublike
                  banner={n}
                  jeito="pagina"
                  data={
                    n.para === "todos" ? formatarData(n.quando) : `${formatarData(n.quando)} · ${PARA_NOVIDADE[n.para]}`
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-10 text-center">
            <Megaphone aria-hidden className="size-10 text-ink-muted" />
            <h2 className="text-h3">Nenhuma novidade por enquanto</h2>
            <p className="text-body text-ink-muted">Quando o Publike tiver algo novo para contar, aparece aqui.</p>
            <BotaoLink href="/?tipo=vaga" variante="primario">
              Ver vagas
            </BotaoLink>
          </div>
        )}
      </Container>
    </>
  );
}
