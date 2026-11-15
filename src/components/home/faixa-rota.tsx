import { MapPinned } from "lucide-react";
import Link from "next/link";
import { Container } from "../ui/basicos";

/**
 * "Vai entregar currículo? Veja onde deixar.": a Rota do currículo na home de quem visita (15/11/2026, Marcelo: "deixe
 * a rota do currículo visível, que o usuário acesse na home sem logar e veja sobre, gera interesse").
 */
export function FaixaRota() {
  return (
    <Container className="mt-12 sm:mt-16">
      <section
        aria-labelledby="faixa-rota"
        className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-5 sm:flex-row sm:items-center sm:gap-8 sm:p-8 lg:rounded-[28px] lg:px-10"
      >
        <span className="hidden size-14 shrink-0 items-center justify-center rounded-md bg-terra-soft text-terra-text sm:flex">
          <MapPinned aria-hidden className="size-7" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id="faixa-rota" className="text-h2 sm:text-[32px] sm:leading-[36px]">
            Vai entregar currículo? Veja onde deixar.
          </h2>
          <p className="text-body text-ink-muted sm:text-body-lg">
            Escolha a sua função e veja no mapa os comércios perto de casa que costumam contratar. Imprima uma cópia para
            cada um, com QR code, e saiba quando abrirem. Grátis.
          </p>
        </div>
        <Link
          href="/rota-do-curriculo"
          className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 self-start rounded-md bg-ink px-5 text-label text-surface-100 transition-opacity hover:opacity-90 sm:self-center"
        >
          <MapPinned aria-hidden className="size-4" />
          Ver os lugares perto de mim
        </Link>
      </section>
    </Container>
  );
}
