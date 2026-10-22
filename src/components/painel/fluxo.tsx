import { ArrowRight, ChevronRight, CircleCheck, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

// Peças da visão geral do painel (/painel): os dois lados da conta, "O que você
// oferece" (o que publicou) e "O que você procura" (o que curtiu ou pediu), cada um
// com os seus fluxos em passos numerados. Cada número leva à lista já filtrada.

/**
 * Chip de filtro (Candidatos, Meus anúncios, Minhas curtidas). `vazio`: ninguém ali (mais apagado,
 * sem o zero). `relative` segura o texto
 * só para leitor de tela dentro do chip: sem isso, numa fileira que rola de lado, ele
 * escapa da rolagem e alarga a página no celular.
 */
export function classesChip(ativo: boolean, destaque = false, vazio = false) {
  return `relative inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-pill border px-3.5 text-label whitespace-nowrap transition-colors ${
    ativo
      ? "border-ink bg-ink text-surface-100"
      : destaque
        ? "border-transparent bg-terra-soft text-terra-text hover:border-terra-text"
        : vazio
          ? "border-line bg-transparent text-ink-muted hover:border-line-strong hover:text-ink"
          : "border-line bg-surface-300 text-ink hover:border-line-strong"
  }`;
}

/**
 * Chip que liga e desliga um filtro: escolhido, fica em `ink` com um × (tocar de novo tira).
 * A contagem fica ao lado do nome.
 */
export function ChipFiltro({
  href,
  ativo,
  nome,
  numero,
  destaque = false,
}: {
  href: string;
  ativo: boolean;
  nome: string;
  numero?: number;
  destaque?: boolean;
}) {
  return (
    <Link href={href} scroll={false} aria-current={ativo ? "true" : undefined} className={classesChip(ativo, destaque)}>
      {nome}
      {numero !== undefined && (
        <span className={ativo ? "text-surface-100/80" : destaque ? "" : "text-ink-muted"}>{numero}</span>
      )}
      {ativo && (
        <>
          <X aria-hidden className="size-4" />
          <span className="sr-only">(tirar o filtro)</span>
        </>
      )}
    </Link>
  );
}

export type PassoDaTrilha = {
  nome: string;
  /** null: não deu para contar agora (aparece "–") */
  numero: number | null;
  /** a lista já filtrada (só vira link quando há o que ver) */
  href?: string;
  /** vira link mesmo com zero (ex.: "No ar" de quem tem vagas vencidas para renovar) */
  sempre?: boolean;
  /** pede uma ação sua (ex.: "Para responder") */
  destaque?: boolean;
  /** o fim do caminho (ex.: "Contratados") */
  final?: boolean;
};

/**
 * Os passos de um fluxo com o número de cada um: No ar → Candidatos → Para responder → …
 * No celular, um embaixo do outro, ligados por uma linha (como o rastreio de uma entrega);
 * a partir de 640 px, em cartões numa linha só, com setas.
 * Sem `setas` (números soltos, como "Em contato"), não há linha nem setas.
 */
export function Trilha({ rotulo, passos, setas = true }: { rotulo: string; passos: PassoDaTrilha[]; setas?: boolean }) {
  return (
    <ol aria-label={rotulo} className="flex flex-col sm:flex-row">
      {passos.map((p, i) => {
        const tem = (p.numero ?? 0) > 0;
        const chamar = tem && p.destaque;
        const href = (tem || p.sempre) && p.href ? p.href : null;
        const cor = !tem ? "text-ink-muted" : chamar ? "text-terra-text" : p.final ? "text-cerrado-text" : "text-ink";
        const ponto = !tem ? "bg-line-strong" : chamar ? "bg-terra" : p.final ? "bg-cerrado" : "bg-ink";
        const caixa = [
          "relative flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md px-1.5 py-2",
          "sm:min-h-[4.75rem] sm:flex-col sm:items-start sm:justify-center sm:gap-0 sm:border sm:px-3 sm:py-2.5",
          chamar ? "sm:border-transparent sm:bg-terra-soft" : "sm:border-line sm:bg-surface-100",
          href
            ? `transition-colors hover:bg-surface-300 ${chamar ? "sm:hover:border-terra-text sm:hover:bg-terra-soft" : "sm:hover:border-line-strong"}`
            : "",
        ].join(" ");
        const conteudo = (
          <>
            {setas && <span aria-hidden className={`size-2.5 shrink-0 rounded-full ring-4 ring-surface-200 sm:hidden ${ponto}`} />}
            <span className={`order-2 ml-auto font-display text-h3 leading-none sm:order-1 sm:ml-0 sm:text-h2 ${cor}`}>
              {p.numero ?? "–"}
            </span>
            <span
              className={`order-1 min-w-0 text-body leading-tight sm:order-2 sm:mt-1.5 sm:text-body-sm ${
                chamar ? "font-semibold text-terra-text sm:font-normal sm:text-ink" : tem ? "text-ink" : "text-ink-muted"
              }`}
            >
              {p.nome}
            </span>
            {/* sem link, o espaço da seta fica vazio: os números continuam alinhados */}
            {href ? (
              <ChevronRight aria-hidden className="order-3 size-4 shrink-0 text-ink-muted sm:hidden" />
            ) : (
              <span aria-hidden className="order-3 size-4 shrink-0 sm:hidden" />
            )}
          </>
        );
        return (
          <li
            key={p.nome}
            // com setas, a partir do 2º a caixa divide o espaço com a seta (1,5 rem): todas ficam da mesma largura
            className={`relative flex min-w-0 items-stretch ${
              i === 0 ? "sm:flex-1" : setas ? "sm:flex-[1_1_1.5rem]" : "sm:ml-2 sm:flex-1"
            }`}
          >
            {/* celular: a linha que liga um passo ao próximo */}
            {setas && i < passos.length - 1 && (
              <span aria-hidden className="absolute top-1/2 left-2.5 h-full w-0.5 bg-line sm:hidden" />
            )}
            {setas && i > 0 && (
              <ChevronRight aria-hidden className="mx-1 hidden size-4 shrink-0 self-center text-ink-muted sm:block" />
            )}
            {href ? (
              <Link href={href} className={caixa}>
                {conteudo}
              </Link>
            ) : (
              <div className={caixa}>{conteudo}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Um lado da conta ("O que você oferece" ou "O que você procura"), com os seus blocos. */
export function Lado({
  id,
  icone: Icone,
  titulo,
  texto,
  children,
}: {
  id: string;
  icone: LucideIcon;
  titulo: string;
  texto: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-surface-300">
          <Icone aria-hidden className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id={id} className="text-h2">
            {titulo}
          </h2>
          <p className="text-body-sm text-ink-muted">{texto}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Um fluxo dentro de um lado: título, uma linha de ajuda, a ação ao lado e os passos. */
export function Bloco({
  id,
  icone: Icone,
  titulo,
  texto,
  acao,
  children,
}: {
  id: string;
  icone: LucideIcon;
  titulo: string;
  texto?: ReactNode;
  acao?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <h3 id={id} className="flex items-center gap-2 text-h3">
            <Icone aria-hidden className="size-5 shrink-0 text-ink-muted" />
            {titulo}
          </h3>
          {texto && <p className="mt-1 text-body-sm text-ink-muted">{texto}</p>}
        </div>
        {acao && <div className="flex shrink-0 flex-wrap gap-2">{acao}</div>}
      </div>
      {children}
    </section>
  );
}

/** Link discreto com seta, para o rodapé de um bloco ("Ver vagas salvas", "Ver avaliações"). */
export function LinkDoBloco({ href, icone: Icone, children }: { href: string; icone?: LucideIcon; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-2 text-label text-ink underline-offset-2 hover:underline"
    >
      {Icone && <Icone aria-hidden className="size-4 shrink-0 text-ink-muted" />}
      {children}
      <ArrowRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
    </Link>
  );
}

export type ItemParaFazer = {
  icone: LucideIcon;
  texto: string;
  ajuda?: string;
  href: string;
};

/** "Para fazer agora": o que espera uma ação sua, do mais urgente para o menos. */
export function ParaFazer({ itens }: { itens: ItemParaFazer[] }) {
  if (itens.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-md bg-surface-300 px-4 py-3 text-body-sm text-ink">
        <CircleCheck aria-hidden className="size-5 shrink-0 text-cerrado-text" />
        Tudo em dia: nada esperando por você agora. Quando alguém curtir ou responder, aparece aqui.
      </p>
    );
  }
  return (
    <section
      aria-labelledby="para-fazer"
      className="rounded-lg border border-line-strong bg-surface-200 p-4 shadow-card sm:p-5"
    >
      <h2 id="para-fazer" className="text-h3">
        Para fazer agora
      </h2>
      <ul className="mt-2 flex flex-col divide-y divide-line">
        {itens.map(({ icone: Icone, texto, ajuda, href }) => (
          <li key={texto}>
            <Link href={href} className="group flex min-h-14 items-center gap-3 py-2.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-terra-soft text-terra-text">
                <Icone aria-hidden className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-label group-hover:underline">{texto}</span>
                {ajuda && <span className="line-clamp-2 block text-body-sm text-ink-muted">{ajuda}</span>}
              </span>
              <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export type Sugestao = { icone: LucideIcon; pergunta: string; acao: string; href: string };

/** O que a conta ainda não usa daquele lado, numa linha cada ("Precisa contratar alguém? Publique…"). */
export function Sugestoes({ itens }: { itens: Sugestao[] }) {
  if (itens.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {itens.map(({ icone: Icone, pergunta, acao, href }) => (
        <li key={href} className="sm:min-w-0 sm:flex-1">
          <Link
            href={href}
            className="flex h-full min-h-14 items-center gap-3 rounded-lg border border-dashed border-line-strong px-4 py-3 hover:bg-surface-200"
          >
            <Icone aria-hidden className="size-5 shrink-0 text-ink-muted" />
            <span className="min-w-0 flex-1 text-body-sm">
              <span className="text-ink-muted">{pergunta}</span>{" "}
              <span className="font-semibold text-terra-text">{acao}</span>
            </span>
            <ArrowRight aria-hidden className="size-4 shrink-0 text-terra-text" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
