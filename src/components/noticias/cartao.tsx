import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { dataCurta, TEMAS_NOTICIA, type Noticia } from "@/lib/noticias";
import { CapaNoticia } from "./capa";

/** Cartão da notícia: capa, assunto, título, resumo, fonte e data. */
export function CartaoNoticia({ n, destaque = false }: { n: Noticia; destaque?: boolean }) {
  return (
    <Link
      href={`/noticias/${n.slug}`}
      className={`group flex h-full overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card transition-shadow hover:shadow-raised ${
        destaque ? "flex-col md:flex-row" : "flex-col"
      }`}
    >
      <CapaNoticia
        n={n}
        tamanho={destaque ? "grande" : "card"}
        className={destaque ? "aspect-video md:aspect-auto md:w-3/5" : "aspect-video"}
      />
      <span className={`flex flex-1 flex-col gap-2 p-5 ${destaque ? "md:justify-center md:p-8" : ""}`}>
        <span className="flex flex-wrap items-center gap-x-2 text-caption text-ink-muted uppercase">
          <span className="text-terra-text">{TEMAS_NOTICIA[n.tema]?.curto ?? n.tema}</span>
          {n.cidade && <span>· {n.cidade}</span>}
        </span>
        <span className={destaque ? "text-h2" : "text-h3"}>{n.titulo}</span>
        <span className={`flex-1 text-body-sm text-ink-muted ${destaque ? "" : "line-clamp-3"}`}>{n.resumo}</span>
        <span className="mt-1 flex items-center justify-between gap-3 text-body-sm text-ink-muted">
          <span className="min-w-0 truncate">
            {n.publicar_em && <time dateTime={n.publicar_em}>{dataCurta(n.publicar_em)}</time>} · {n.fonte_nome}
          </span>
          <ArrowRight
            aria-hidden
            className="size-4 shrink-0 text-terra-text transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </span>
    </Link>
  );
}
