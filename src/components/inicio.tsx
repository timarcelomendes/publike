import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { ComoFuncionaAnimado } from "./como-funciona-animado";
import { PASSOS } from "./passos";
import { Container, Selo } from "./ui/basicos";

/** Título da página inicial. A busca entra logo abaixo, no mesmo bloco (app/page.tsx). */
export function HeroInicio() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Selo variante="novo">Grátis</Selo>
        <span className="text-body-sm text-ink-muted">Goiânia e região</span>
      </div>
      <h1 className="mt-3 max-w-3xl text-h1 sm:text-display">Trabalho perto de casa.</h1>
      <p className="mt-2 max-w-2xl text-body text-ink-muted sm:mt-3 sm:text-body-lg">
        Vagas, diárias e freelances no seu bairro, e empresas de todos os tamanhos achando gente que mora perto.
        <span className="hidden sm:inline">
          {" "}
          Menos tempo no ônibus, mais emprego em Goiânia.{" "}
          <Link href="/missao" className="text-ink underline underline-offset-2 hover:text-terra-text">
            Nossa missão
          </Link>
        </span>
      </p>
    </>
  );
}

/** Os três passos em cartões (página Como funciona). */
export function PassosComoFunciona() {
  return (
    <ol className="grid gap-4 md:grid-cols-3">
      {PASSOS.map(({ icone: Icone, titulo, texto, cor, cheio }, i) => (
        <li key={titulo} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5 shadow-card sm:p-6">
          <span className="flex items-center gap-3">
            <span className={`flex size-11 items-center justify-center rounded-pill ${cor}`}>
              <Icone aria-hidden className="size-5" fill={cheio ? "currentColor" : "none"} />
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
    <section aria-labelledby="como-funciona" className="mt-16 border-t border-line pt-12 pb-4 sm:pt-16">
      <Container>
        <h2 id="como-funciona" className="text-h2 sm:text-h1">
          Como funciona
        </h2>
        <p className="mt-2 max-w-2xl text-body text-ink-muted sm:text-body-lg">
          Simples como uma rede social. Vaga com carteira, diária de obra e a vitrine da diarista do bairro têm o mesmo
          peso aqui: todo trabalho conta.
        </p>
        <div className="mt-8">
          <ComoFuncionaAnimado />
        </div>
        <div className="mt-10 flex gap-3 rounded-lg bg-terra-soft p-5 text-ink">
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
