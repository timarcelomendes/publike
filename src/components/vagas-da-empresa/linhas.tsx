import { ChevronRight, Zap } from "lucide-react";
import Link from "next/link";

// As vagas da página de vagas da empresa em linhas (02/11/2026, como as páginas de carreiras): cabem muitas numa
// tela. Cada linha é um link para a vaga: o cargo (na cor da marca, quando tem), o salário, o lugar, a contratação,
// para qual empresa é (agência), o Começa já e o % de match de quem tem currículo.

export type LinhaDaVaga = {
  id: string;
  titulo: string;
  valor: string;
  lugar: string;
  regime: string | null;
  para: string | null;
  comecaJa: boolean;
  pessoas: number;
  nota: number | null;
};

export function VagasEmLinhas({ vagas, cor }: { vagas: LinhaDaVaga[]; cor: string | null }) {
  return (
    <ul
      aria-label="Vagas abertas"
      className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card"
    >
      {vagas.map((v) => (
        <li key={v.id}>
          <Link
            href={`/anuncio/${v.id}`}
            className="group flex items-center gap-3 px-4 py-3.5 hover:bg-surface-300 focus-visible:bg-surface-300 sm:px-5"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
              <span
                className="min-w-0 text-label group-hover:underline sm:w-2/5 sm:shrink-0 sm:truncate"
                style={cor ? { color: cor } : undefined}
              >
                {v.titulo}
              </span>
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-ink-muted">
                <span className="font-semibold text-ink">{v.valor}</span>
                <span>{v.lugar}</span>
                {v.regime && <span>{v.regime}</span>}
                {v.pessoas > 1 && <span>{v.pessoas} vagas</span>}
                {v.para && <span>Para {v.para}</span>}
                {v.comecaJa && (
                  <span className="inline-flex items-center gap-1 font-semibold text-cerrado-text">
                    <Zap aria-hidden className="size-3.5" />
                    Começa já
                  </span>
                )}
                {v.nota !== null && <span className="font-semibold text-cerrado-text">{v.nota}% combina</span>}
              </span>
            </span>
            <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
