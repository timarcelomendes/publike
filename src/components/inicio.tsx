import { Heart, Megaphone, MessageCircle, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { Container, Selo } from "./ui/basicos";

export function HeroInicio() {
  return (
    <section className="border-b border-line">
      <Container className="py-8 sm:py-12">
        <div className="flex flex-wrap items-center gap-2">
          <Selo variante="novo">Grátis</Selo>
          <span className="text-body-sm text-ink-muted">Goiânia e região</span>
        </div>
        <h1 className="mt-3 max-w-3xl text-h1 sm:text-display">Trabalho perto de você.</h1>
        <p className="mt-3 max-w-2xl text-body-lg text-ink-muted">
          Vagas com carteira, diárias, bicos e serviços. Quem precisa publica, quem faz curte. Deu match, vocês
          conversam.
        </p>
      </Container>
    </section>
  );
}

export const PASSOS = [
  {
    icone: Megaphone,
    titulo: "Quem precisa publica",
    texto: "Empresa, comércio do bairro ou família: publique a vaga ou o serviço em dois minutos. De graça.",
  },
  {
    icone: Heart,
    titulo: "Quem faz curte",
    texto: "Viu algo que combina com você? Curta. Quem publicou vê seu perfil e o que você faz.",
  },
  {
    icone: MessageCircle,
    titulo: "Deu match, vocês conversam",
    texto: "Se quem publicou curtir você de volta, o WhatsApp dos dois aparece. Antes disso, ninguém vê seu número.",
  },
] as const;

export function PassosComoFunciona() {
  return (
    <ol className="grid gap-4 md:grid-cols-3">
      {PASSOS.map(({ icone: Icone, titulo, texto }, i) => (
        <li key={titulo} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5 shadow-card sm:p-6">
          <span className="flex items-center gap-3">
            <span
              className={`flex size-11 items-center justify-center rounded-pill ${
                i === 1 ? "bg-like-soft text-like" : i === 2 ? "bg-cerrado text-on-cerrado" : "bg-terra-soft text-terra-text"
              }`}
            >
              <Icone aria-hidden className="size-5" fill={i === 1 ? "currentColor" : "none"} />
            </span>
            <span className="text-caption text-ink-muted uppercase">Passo {i + 1}</span>
          </span>
          <h3 className="text-h3">{titulo}</h3>
          <p className="text-body-sm text-ink-muted">{texto}</p>
        </li>
      ))}
    </ol>
  );
}

export function ComoFuncionaResumo() {
  return (
    <section className="mt-12 border-t border-line pt-12">
      <Container>
        <h2 className="text-h2">Como funciona</h2>
        <p className="mt-2 max-w-2xl text-body text-ink-muted">
          Simples como uma rede social. Vaga com carteira, diária de pedreiro e serviço de diarista têm o mesmo peso
          aqui: todo trabalho conta.
        </p>
        <div className="mt-6">
          <PassosComoFunciona />
        </div>
        <div className="mt-6 flex gap-3 rounded-lg bg-terra-soft p-5 text-ink">
          <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-terra-text" />
          <p className="text-body-sm">
            <strong>Ninguém pode cobrar para você conseguir trabalho.</strong> Pediram dinheiro para curso, uniforme ou
            cadastro? Não pague e denuncie o anúncio.{" "}
            <Link href="/como-funciona#seguranca" className="font-semibold text-terra-text underline">
              Veja as dicas de segurança
            </Link>
            .
          </p>
        </div>
      </Container>
    </section>
  );
}
