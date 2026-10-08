import { Container, Simbolo } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";

export default function NaoEncontrado() {
  return (
    <Container className="flex flex-col items-center py-16 text-center">
      <Simbolo altura={56} />
      <h1 className="mt-6 text-h2 sm:text-h1">Não encontramos essa página</h1>
      <p className="mt-2 max-w-md text-body text-ink-muted">
        O anúncio pode ter saído do ar, ou o link está errado.
      </p>
      <BotaoLink href="/" className="mt-6">
        Ver oportunidades
      </BotaoLink>
    </Container>
  );
}
