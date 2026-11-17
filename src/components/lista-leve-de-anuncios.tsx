import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { formatarLugar, tempoRelativo, valorDoAnuncio } from "@/lib/formato";
import type { AnuncioResumo } from "@/lib/tipos";

// As páginas de busca com muitas vagas (17/11/2026, "deixe a performance invejável"): os primeiros cartões vêm
// inteiros e o resto numa lista leve, uma linha por anúncio, sem botões. A página de Goiânia, com mais de 100
// cartões, tinha 1,8 MB de HTML e quase 8 mil elementos, e demorava no celular; assim, cada anúncio continua com o
// link (para quem rola e para o Google), mas a página pesa uma fração.

/** Quantos cartões inteiros as páginas de busca mostram antes da lista leve. */
export const CARTOES_INTEIROS = 24;

export function ListaLeveDeAnuncios({
  anuncios,
  agora,
  titulo,
  id = "mais-anuncios",
}: {
  anuncios: AnuncioResumo[];
  agora: number;
  titulo: string;
  id?: string;
}) {
  if (!anuncios.length) return null;
  return (
    <section aria-labelledby={id} className="mt-8">
      <h2 id={id} className="text-h3">
        {titulo}
      </h2>
      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-200">
        {anuncios.map((a) => {
          const valor = valorDoAnuncio(a);
          return (
            <li key={a.id}>
              <Link
                href={`/anuncio/${a.id}`}
                prefetch={false}
                className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-surface-300"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-label text-ink">{a.titulo}</span>
                  <span className="truncate text-body-sm text-ink-muted">
                    {[a.autor_nome, formatarLugar(a.bairro, a.cidade), valor, tempoRelativo(a.criado_em, agora)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
