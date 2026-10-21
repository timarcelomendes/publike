import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { ComoFuncionaAnimado } from "./como-funciona-animado";
import { ConteudosNaHome } from "./conteudo/na-home";
import { PASSOS } from "./passos";
import { RecursosDoPublike } from "./secao-recursos";
import { Container } from "./ui/basicos";

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

/**
 * Página inicial, depois dos anúncios: como funciona (3 passos), o que dá para fazer
 * no seu caso e o aviso de segurança. Uma seção só, na ordem de quem está conhecendo.
 */
export function EntendaOPublike() {
  return (
    <section id="entenda" aria-label="Entenda o Publike" className="mt-16 scroll-mt-20 border-t border-line pt-12 pb-4 sm:pt-16">
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

        <h2 id="o-que-da-para-fazer" className="mt-16 scroll-mt-20 text-h2 sm:mt-20 sm:text-h1">
          O que dá para fazer no Publike
        </h2>
        <p className="mt-2 mb-6 max-w-2xl text-body text-ink-muted sm:text-body-lg">
          Escolha o seu caso e veja, em poucas palavras, como o Publike ajuda. Tudo de graça.
        </p>
        <RecursosDoPublike linkDetalhes />

        <ConteudosNaHome />

        <div className="mt-12 flex gap-3 rounded-lg bg-terra-soft p-5 text-ink">
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
