import { ArrowRight, BriefcaseBusiness, Megaphone, Store } from "lucide-react";
import Link from "next/link";
import type { BlocoConteudo, Conteudo } from "@/lib/conteudos/tipos";
import { BotaoLink } from "../ui/botao";
import { TextoRico } from "./texto-rico";

/** O corpo do artigo. */
export function CorpoDoConteudo({ c }: { c: Conteudo }) {
  return (
    <div className="flex flex-col gap-5">
      {c.blocos.map((b, i) => (
        <Bloco key={i} b={b} c={c} />
      ))}
    </div>
  );
}

function Bloco({ b, c }: { b: BlocoConteudo; c: Conteudo }) {
  switch (b.t) {
    case "p":
      return (
        <p className="text-body-lg text-ink-muted">
          <TextoRico texto={b.texto} />
        </p>
      );
    case "h2":
      return <h2 className="mt-4 text-h2">{b.texto}</h2>;
    case "lista":
      return (
        <ul className="flex list-disc flex-col gap-2 pl-6 text-body-lg text-ink-muted marker:text-terra-text">
          {b.itens.map((item, i) => (
            <li key={i}>
              <TextoRico texto={item} />
            </li>
          ))}
        </ul>
      );
    case "numero": {
      const fonte = c.fontes[b.fonte - 1];
      return (
        <figure className="my-2 rounded-lg border border-line bg-surface-200 p-5 shadow-card">
          <p className="font-display text-display leading-none text-terra-text max-sm:text-h1">{b.valor}</p>
          <figcaption className="mt-2 text-body text-ink">
            {b.rotulo}
            {fonte && (
              <span className="mt-1 block text-body-sm text-ink-muted">
                Fonte:{" "}
                <a href={fonte.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                  {fonte.titulo}
                </a>
              </span>
            )}
          </figcaption>
        </figure>
      );
    }
    case "chamada":
      return (
        <aside className="my-2 flex flex-col items-start gap-3 rounded-lg border border-line-strong bg-surface-300 p-5">
          <p className="font-display text-h3">{b.titulo}</p>
          <p className="text-body text-ink-muted">
            <TextoRico texto={b.texto} />
          </p>
          <BotaoLink href={b.href}>
            {b.botao}
            <ArrowRight aria-hidden />
          </BotaoLink>
        </aside>
      );
  }
}

/** No fim de todo artigo: os três caminhos grátis do Publike. */
export function CaminhosGratis() {
  const itens = [
    {
      icone: BriefcaseBusiness,
      titulo: "Procura trabalho?",
      texto: "Vagas com carteira, diárias e freelances perto de casa, com o tempo de ônibus.",
      href: "/vagas/goiania",
      acao: "Ver vagas",
    },
    {
      icone: Megaphone,
      titulo: "Precisa contratar?",
      texto: "Publique a vaga de graça e escolha entre quem mora perto.",
      href: "/publicar",
      acao: "Publicar vaga grátis",
    },
    {
      icone: Store,
      titulo: "Presta serviço?",
      texto: "Monte sua vitrine e receba pedidos de clientes do seu bairro.",
      href: "/painel/servicos",
      acao: "Oferecer meus serviços",
    },
  ];
  return (
    <section aria-labelledby="caminhos-gratis" className="rounded-lg border border-line bg-surface-200 p-5 shadow-card sm:p-6">
      <h2 id="caminhos-gratis" className="text-h3">
        No Publike, tudo é de graça
      </h2>
      <p className="mt-1 text-body-sm text-ink-muted">
        Para quem procura, para quem contrata e para quem presta serviço.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-3">
        {itens.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              className="group flex h-full flex-col gap-2 rounded-md border border-line bg-surface-100 p-4 transition-colors hover:border-line-strong"
            >
              <i.icone aria-hidden className="size-5 text-terra-text" />
              <span className="text-label">{i.titulo}</span>
              <span className="flex-1 text-body-sm text-ink-muted">{i.texto}</span>
              <span className="inline-flex items-center gap-1 text-label text-terra-text">
                {i.acao}
                <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
