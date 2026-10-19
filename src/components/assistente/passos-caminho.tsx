import { ArrowRight, Check } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { PassoJornada } from "@/lib/ajuda";

/** As telas do passo a passo foram capturadas no celular, todas do mesmo tamanho. */
export const TELA = { largura: 390, altura: 760 };

/**
 * Os passos de um caminho, com os detalhes e a tela de verdade (quando tem). No computador, a
 * tela fica ao lado do texto; no celular, embaixo.
 */
export function PassosDoCaminho({
  passos,
  comImagens = true,
  nivel = 2,
}: {
  passos: PassoJornada[];
  comImagens?: boolean;
  /** o nível do título de cada passo (h2 na página do caminho, h3 dentro da Ajuda) */
  nivel?: 2 | 3;
}) {
  const Titulo = nivel === 2 ? "h2" : "h3";
  return (
    <ol className="flex flex-col gap-6">
      {passos.map((p, i) => {
        const imagem = comImagens && p.imagem ? p.imagem : null;
        return (
          <li
            key={`${i}-${p.titulo}`}
            className="grid gap-5 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-start"
          >
            <div className="flex min-w-0 gap-3 sm:gap-4">
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-ink font-display text-body text-surface-100 tabular-nums"
              >
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-col gap-2">
                <Titulo className="text-h3">
                  <span className="sr-only">Passo {i + 1}: </span>
                  {p.titulo}
                </Titulo>
                <p className="text-body">{p.texto}</p>
                {p.detalhes && p.detalhes.length > 0 && (
                  <ul className="flex flex-col gap-1.5">
                    {p.detalhes.map((d) => (
                      <li key={d} className="flex gap-2 text-body-sm text-ink-muted">
                        <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-cerrado-text" />
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {p.link && (
                  <Link
                    href={p.link.href}
                    className="mt-1 inline-flex min-h-10 items-center gap-1 self-start text-label text-terra-text underline-offset-2 hover:underline"
                  >
                    {p.link.texto}
                    <ArrowRight aria-hidden className="size-4" />
                  </Link>
                )}
              </div>
            </div>
            {imagem && (
              <figure className="mx-auto w-full max-w-[16rem] md:mx-0 md:w-56">
                <Image
                  src={`/ajuda/${imagem}.webp`}
                  alt={`Tela do Publike: ${p.titulo.toLowerCase()}`}
                  width={TELA.largura}
                  height={TELA.altura}
                  sizes="(min-width: 768px) 14rem, 16rem"
                  className="h-auto w-full rounded-xl border-4 border-ink shadow-raised"
                />
              </figure>
            )}
          </li>
        );
      })}
    </ol>
  );
}
