import { ChevronLeft, ChevronRight, Search, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { STATUS_ANUNCIO } from "@/lib/constantes";
import { formatarNumero } from "@/lib/formato";
import type { StatusAnuncio } from "@/lib/tipos";
import { Selo, type VarianteSelo } from "../ui/basicos";
import { classesBotao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";

// Peças das telas do admin e da moderação.

export function Secao({
  titulo,
  descricao,
  acoes,
  children,
  id,
}: {
  titulo: string;
  descricao?: ReactNode;
  acoes?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-4 rounded-lg border border-line bg-surface-200 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-h3">{titulo}</h2>
          {descricao && <div className="mt-1 max-w-2xl text-body-sm text-ink-muted">{descricao}</div>}
        </div>
        {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
      </div>
      {children}
    </section>
  );
}

export function Numero({
  rotulo,
  valor,
  detalhe,
  href,
  icone: Icone,
  alerta,
}: {
  rotulo: string;
  valor: number;
  detalhe?: ReactNode;
  href?: string;
  icone?: LucideIcon;
  /** Destaca quando precisa de atenção (ex.: denúncias abertas). */
  alerta?: boolean;
}) {
  const conteudo = (
    <>
      <span className="flex items-center gap-2 text-label text-ink-muted">
        {Icone && <Icone aria-hidden className="size-4" />}
        {rotulo}
      </span>
      <span className={`font-display text-h1 ${alerta ? "text-terra-text" : "text-ink"}`}>{formatarNumero(valor)}</span>
      {detalhe && <span className="text-body-sm text-ink-muted">{detalhe}</span>}
    </>
  );
  const classe = `flex flex-col gap-1 rounded-lg border bg-surface-200 p-4 ${alerta ? "border-terra" : "border-line"}`;
  return href ? (
    <Link href={href} className={`${classe} transition-colors hover:bg-surface-300`}>
      {conteudo}
    </Link>
  ) : (
    <div className={classe}>{conteudo}</div>
  );
}

/** Junta os filtros atuais com uma mudança e monta o link. */
export function linkCom(base: string, atuais: Record<string, string | null | undefined>, mudanca: Record<string, string | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...atuais, ...mudanca })) if (v) p.set(k, v);
  const q = p.toString();
  return q ? `${base}?${q}` : base;
}

export function Filtros({
  rotulo,
  opcoes,
  atual,
  link,
}: {
  rotulo: string;
  opcoes: { valor: string; nome: string }[];
  atual: string;
  link: (valor: string) => string;
}) {
  return (
    <nav aria-label={rotulo} className="sem-barra -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
      {opcoes.map((o) => {
        const ativo = o.valor === atual;
        return (
          <Link
            key={o.valor}
            href={link(o.valor)}
            aria-current={ativo ? "page" : undefined}
            className={`inline-flex min-h-10 shrink-0 items-center rounded-pill border px-3.5 text-label transition-colors ${
              ativo ? "border-ink bg-ink text-surface-100" : "border-line bg-surface-200 text-ink hover:bg-surface-300"
            }`}
          >
            {o.nome}
          </Link>
        );
      })}
    </nav>
  );
}

export function Busca({
  acao,
  valor,
  placeholder,
  ocultos = {},
}: {
  acao: string;
  valor: string;
  placeholder: string;
  ocultos?: Record<string, string | null | undefined>;
}) {
  return (
    <form action={acao} role="search" className="flex gap-2">
      {Object.entries(ocultos).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <label className="relative flex-1">
        <span className="sr-only">{placeholder}</span>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
        <input
          type="search"
          name="q"
          defaultValue={valor}
          placeholder={placeholder}
          className={`${classesEntrada} pl-9 [&::-webkit-search-cancel-button]:appearance-none`}
        />
      </label>
      <button type="submit" className={classesBotao("secundario", "md")}>
        Buscar
      </button>
    </form>
  );
}

export function Paginacao({
  pagina,
  total,
  porPagina,
  link,
}: {
  pagina: number;
  total: number;
  porPagina: number;
  link: (pagina: number) => string;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (paginas <= 1) return null;
  return (
    <nav aria-label="Páginas" className="flex items-center justify-between gap-3 text-body-sm text-ink-muted">
      {pagina > 1 ? (
        <Link href={link(pagina - 1)} className={classesBotao("secundario", "sm")}>
          <ChevronLeft aria-hidden />
          Anterior
        </Link>
      ) : (
        <span />
      )}
      <span>
        Página {pagina} de {paginas}
      </span>
      {pagina < paginas ? (
        <Link href={link(pagina + 1)} className={classesBotao("secundario", "sm")}>
          Próxima
          <ChevronRight aria-hidden />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

const VARIANTE_STATUS: Record<string, VarianteSelo> = {
  ativo: "match",
  pausado: "contorno",
  encerrado: "contorno",
  expirado: "contorno",
  em_analise: "perigo",
  removido: "perigo",
};

export function SeloStatus({ status }: { status: string }) {
  return (
    <Selo variante={VARIANTE_STATUS[status] ?? "contorno"}>
      {STATUS_ANUNCIO[status as StatusAnuncio]?.nome ?? status}
    </Selo>
  );
}

/** Linha "rótulo: valor" das fichas. */
export function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-body-sm text-ink-muted sm:w-44">{rotulo}</dt>
      <dd className="min-w-0 text-body break-words">{children}</dd>
    </div>
  );
}

/** Indicador de configuração: feito ou faltando. */
export function Situacao({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-body-sm">
      <span
        aria-hidden
        className={`mt-1.5 size-2 shrink-0 rounded-pill ${ok ? "bg-cerrado" : "bg-terra"}`}
      />
      <span>
        <span className="sr-only">{ok ? "Pronto: " : "Falta: "}</span>
        {children}
      </span>
    </p>
  );
}
