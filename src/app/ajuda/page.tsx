import { MessageSquareText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Conversa } from "@/components/assistente/conversa";
import { ListaAjuda } from "@/components/assistente/lista-ajuda";
import { Container } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { TEMAS_AJUDA } from "@/lib/ajuda";
import { assistenteDisponivel } from "@/lib/servidor/assistente";

export const metadata: Metadata = {
  title: "Ajuda",
  description:
    "Dúvidas sobre o Publike: como achar vagas perto de casa, publicar grátis, curtir, dar match, evitar golpes e cuidar da conta.",
};

export default function Ajuda() {
  return (
    <>
      <section className="border-b border-line">
        <Container className="py-10 sm:py-14">
          <h1 className="text-h1 sm:text-display">Como podemos ajudar?</h1>
          <p className="mt-3 max-w-2xl text-body-lg text-ink-muted">
            As dúvidas mais comuns sobre achar trabalho, contratar e cuidar da conta no Publike. Não achou? Pergunte ao
            assistente ou fale com a equipe.
          </p>
          <nav aria-label="Temas" className="mt-6 flex flex-wrap gap-2">
            {TEMAS_AJUDA.map((t) => (
              <a
                key={t.id}
                href={`#${t.id}`}
                className="inline-flex min-h-10 items-center rounded-pill border border-line bg-surface-300 px-3.5 text-label hover:border-line-strong"
              >
                {t.titulo}
              </a>
            ))}
          </nav>
        </Container>
      </section>

      <Container className="grid gap-10 py-10 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-7">
          <ListaAjuda temas={TEMAS_AJUDA} />
        </div>
        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:col-span-5">
          <Suspense fallback={null}>
            <ConversaSeDisponivel />
          </Suspense>
          <section className="rounded-lg border border-line bg-surface-200 p-5">
            <h2 className="flex items-center gap-2 text-h3">
              <MessageSquareText aria-hidden className="size-5 text-terra-text" />
              Fale com a equipe
            </h2>
            <p className="mt-2 text-body-sm text-ink-muted">
              Achou um erro, tem uma ideia ou quer elogiar? Mande pela página Sugestões e erros, com ou sem conta. Para
              anúncio suspeito, use “Denunciar anúncio”, dentro do anúncio.
            </p>
            <BotaoLink href="/sugerir" className="mt-4">
              Mandar sugestão ou erro
            </BotaoLink>
          </section>
          <p className="text-body-sm text-ink-muted">
            Veja também{" "}
            <Link href="/como-funciona" className="underline">
              Como funciona
            </Link>
            , as{" "}
            <Link href="/como-funciona#seguranca" className="underline">
              dicas de segurança
            </Link>{" "}
            e a{" "}
            <Link href="/privacidade" className="underline">
              política de privacidade
            </Link>
            .
          </p>
        </aside>
      </Container>
    </>
  );
}

async function ConversaSeDisponivel() {
  if (!(await assistenteDisponivel())) return null;
  return (
    <section
      aria-labelledby="titulo-assistente"
      className="flex h-[32rem] flex-col overflow-hidden rounded-lg border border-line bg-surface-100 shadow-card"
    >
      <div className="border-b border-line bg-surface-200 px-4 py-3">
        <h2 id="titulo-assistente" className="font-display text-label">
          Pergunte ao assistente
        </h2>
        <p className="text-body-sm text-ink-muted">Tira dúvidas na hora. Com conta, procura vagas e empresas.</p>
      </div>
      <Conversa className="flex-1" />
    </section>
  );
}
