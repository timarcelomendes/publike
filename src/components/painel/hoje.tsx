import { ArrowRight, CircleCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

// As peças da página Hoje, a primeira do painel em todos os modos: a saudação, o que
// pede você agora (em cartões, com a ação no próprio cartão) e os números do modo.

const FUSO = "America/Sao_Paulo";

/** "Bom dia", "Boa tarde" ou "Boa noite", pela hora de Goiânia. */
function cumprimento(agora: number) {
  const hora = Number(
    new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hourCycle: "h23", timeZone: FUSO }).format(agora),
  );
  return hora < 5 ? "Boa noite" : hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
}

/** "sexta, 16 de outubro" */
function hoje(agora: number) {
  const dia = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: FUSO })
    .format(agora)
    .replace("-feira", "");
  return dia.charAt(0).toUpperCase() + dia.slice(1);
}

/** O título da página Hoje: o cumprimento, a data e quantas coisas pedem a pessoa. */
export function Saudacao({
  nome,
  agora,
  pendencias,
  acao,
  resumo,
  boasVindas = false,
}: {
  nome: string | null;
  agora: number;
  pendencias: number;
  /** uma frase do que está acontecendo, embaixo da data ("3 vagas no ar para 2 clientes.") */
  resumo?: string;
  /** conta nova: "Boas-vindas" no lugar do bom dia */
  boasVindas?: boolean;
  /** o botão principal do modo (Publicar vaga, por exemplo) */
  acao?: ReactNode;
}) {
  const primeiro = nome?.trim().split(/\s+/)[0];
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-h2 sm:text-h1">
          {boasVindas ? "Boas-vindas" : cumprimento(agora)}
          {primeiro ? `, ${primeiro}` : ""}
        </h2>
        <p className="mt-1 text-body text-ink-muted">
          {hoje(agora)} ·{" "}
          {pendencias === 0
            ? "tudo em dia"
            : pendencias === 1
              ? "1 coisa pede você"
              : `${pendencias} coisas pedem você`}
        </p>
        {resumo && <p className="mt-0.5 text-body text-ink">{resumo}</p>}
      </div>
      {acao}
    </header>
  );
}

export type Cartao = {
  icone: LucideIcon;
  /** "Mais urgente", "Hoje, 15h", "Em 2 dias" */
  quando?: string;
  titulo: string;
  texto?: string;
  href: string;
  /** o texto do botão: "Responder agora", "Mandar meu currículo" */
  acao: string;
  tom?: "urgente" | "bom" | "normal";
};

const TONS = {
  urgente: { caixa: "border-transparent bg-terra-soft", quando: "text-terra-text", botao: "bg-ink text-surface-100" },
  bom: {
    caixa: "border-transparent bg-cerrado text-on-cerrado",
    quando: "text-on-cerrado",
    botao: "bg-surface-200 text-ink",
  },
  normal: {
    caixa: "border-line bg-surface-200 shadow-card",
    quando: "text-ink-muted",
    botao: "border border-line-strong text-ink",
  },
} as const;

/**
 * "Para fazer agora": os três mais urgentes em cartões, com a ação no próprio cartão;
 * o resto numa lista embaixo. Sem nada: uma linha de tudo em dia.
 */
export function ParaFazerAgora({
  itens,
  vazio,
  lista = false,
  titulo = "Para fazer agora",
}: {
  itens: Cartao[];
  vazio: string;
  titulo?: string;
  /** tudo numa lista, uma linha por tarefa com o botão à direita (a Hoje de quem contrata) */
  lista?: boolean;
}) {
  if (itens.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-md bg-surface-300 px-4 py-3 text-body-sm text-ink">
        <CircleCheck aria-hidden className="size-5 shrink-0 text-cerrado-text" />
        {vazio}
      </p>
    );
  }
  if (lista) return <ListaParaFazer itens={itens} titulo={titulo} />;
  const cartoes = itens.slice(0, 3);
  const resto = itens.slice(3);
  return (
    <section aria-labelledby="para-fazer" className="flex flex-col gap-3">
      <h2 id="para-fazer" className="text-h3">
        Para fazer agora
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cartoes.map(({ icone: Icone, quando, titulo, texto, href, acao, tom = "normal" }) => {
          const t = TONS[tom];
          return (
            <li key={titulo} className={`flex flex-col gap-2.5 rounded-lg border p-4 sm:p-5 ${t.caixa}`}>
              {quando && (
                <span className={`flex items-center gap-1.5 text-caption uppercase ${t.quando}`}>
                  <Icone aria-hidden className="size-4 shrink-0" />
                  {quando}
                </span>
              )}
              <h3 className="font-display text-h3">{titulo}</h3>
              {texto && <p className={`text-body-sm ${tom === "bom" ? "" : "text-ink-muted"}`}>{texto}</p>}
              <Link
                href={href}
                className={`mt-auto inline-flex min-h-11 items-center gap-1.5 self-start rounded-md px-4 text-label transition-opacity hover:opacity-90 ${t.botao}`}
              >
                {acao}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </li>
          );
        })}
      </ul>
      {resto.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
          {resto.map(({ icone: Icone, titulo, texto, href }) => (
            <li key={titulo}>
              <Link href={href} className="group flex min-h-14 items-center gap-3 px-4 py-2.5">
                <Icone aria-hidden className="size-5 shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block text-label group-hover:underline">{titulo}</span>
                  {texto && <span className="line-clamp-1 block text-body-sm text-ink-muted">{texto}</span>}
                </span>
                <ArrowRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ListaParaFazer({ itens, titulo: nome }: { itens: Cartao[]; titulo: string }) {
  return (
    <section aria-labelledby="para-fazer" className="flex flex-col gap-3">
      <h2 id="para-fazer" className="text-h3">
        {nome}
      </h2>
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200 shadow-card">
        {itens.map(({ icone: Icone, quando, titulo, texto, href, acao, tom = "normal" }) => (
          <li key={titulo} className="flex flex-wrap items-center gap-x-3.5 gap-y-2 px-4 py-3.5 sm:flex-nowrap sm:px-5">
            <span
              aria-hidden
              className={`grid size-10 shrink-0 place-items-center rounded-pill ${
                tom === "urgente"
                  ? "bg-terra-soft text-terra-text"
                  : tom === "bom"
                    ? "bg-cerrado text-on-cerrado"
                    : "bg-surface-300 text-ink"
              }`}
            >
              <Icone className="size-5" />
            </span>
            <span className="min-w-0 flex-1 basis-48">
              {quando && (
                <span className={`block text-caption ${tom === "urgente" ? "text-terra-text" : "text-ink-muted"}`}>
                  {quando}
                </span>
              )}
              <h3 className="text-label">{titulo}</h3>
              {texto && <p className="text-body-sm text-ink-muted">{texto}</p>}
            </span>
            <Link
              href={href}
              className={`ml-[54px] inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md px-3.5 text-label transition-opacity hover:opacity-90 sm:ml-0 ${
                tom === "urgente" ? "bg-ink text-surface-100" : "border border-line-strong text-ink"
              }`}
            >
              {acao}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Um número da semana: o nome, o valor grande e uma linha de ajuda. */
export function NumeroHoje({
  nome,
  valor,
  ajuda,
  selo,
  href,
}: {
  nome: string;
  valor: string;
  ajuda?: string;
  /** um selo ao lado do valor ("Selo ativo") */
  selo?: string;
  href?: string;
}) {
  const miolo = (
    <>
      <span className="block text-body-sm text-ink-muted">{nome}</span>
      <span className="mt-1 flex flex-wrap items-center gap-2">
        <span className="font-display text-h2 leading-none tabular-nums">{valor}</span>
        {selo && (
          <span className="rounded-pill bg-cerrado px-2 py-0.5 text-caption text-on-cerrado uppercase">{selo}</span>
        )}
      </span>
      {ajuda && <span className="mt-1.5 block text-body-sm text-ink-muted">{ajuda}</span>}
    </>
  );
  const classe = "block h-full rounded-lg border border-line bg-surface-200 p-4";
  return href ? (
    <Link href={href} className={`${classe} transition-colors hover:border-line-strong`}>
      {miolo}
    </Link>
  ) : (
    <div className={classe}>{miolo}</div>
  );
}

/** As etapas de uma candidatura em 4 traços: os feitos em verde, o atual em amarelo. */
export function Etapas({ feitas, atual, rotulo }: { feitas: number; atual: boolean; rotulo: string }) {
  return (
    <span role="img" aria-label={rotulo} className="flex gap-1">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`h-1.5 flex-1 rounded-pill ${
            i < feitas ? "bg-cerrado" : i === feitas && atual ? "bg-ipe" : "bg-line"
          }`}
        />
      ))}
    </span>
  );
}
