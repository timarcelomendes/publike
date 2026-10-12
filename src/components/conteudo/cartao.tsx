import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { minutosDeLeitura, TEMAS_CONTEUDO, type Conteudo } from "@/lib/conteudos";
import { CapaConteudo } from "./capa";

/** O cartão de um artigo: capa, tema, título, resumo e tempo de leitura. */
export function CartaoConteudo({ c, destaque = false }: { c: Conteudo; destaque?: boolean }) {
  return (
    <Link
      href={`/conteudos/${c.slug}`}
      className={`group flex h-full overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card transition-shadow hover:shadow-raised ${
        destaque ? "flex-col md:flex-row" : "flex-col"
      }`}
    >
      <CapaConteudo c={c} tamanho={destaque ? "grande" : "card"} className={destaque ? "aspect-video md:aspect-auto md:w-3/5" : "aspect-video"} />
      <span className={`flex flex-1 flex-col gap-2 p-5 ${destaque ? "md:justify-center md:p-8" : ""}`}>
        <span className="text-caption text-ink-muted uppercase">{TEMAS_CONTEUDO[c.tema].nome}</span>
        <span className={destaque ? "text-h2" : "text-h3"}>{c.titulo}</span>
        <span className={`flex-1 text-body-sm text-ink-muted ${destaque ? "" : "line-clamp-3"}`}>{c.descricao}</span>
        <span className="mt-1 flex items-center justify-between text-body-sm text-ink-muted">
          {minutosDeLeitura(c)} min de leitura
          <ArrowRight aria-hidden className="size-4 text-terra-text transition-transform group-hover:translate-x-0.5" />
        </span>
      </span>
    </Link>
  );
}
