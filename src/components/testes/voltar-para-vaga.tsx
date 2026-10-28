import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { obterAnuncio } from "@/lib/dados";
import { UUID } from "@/lib/validacao";

/**
 * A vaga de onde a pessoa veio (`?vaga=` na biblioteca de testes), se for dela: para voltar aos testes da
 * vaga depois de ver ou criar um teste.
 */
export async function vagaDaVolta(vaga: unknown, usuarioId: string) {
  if (typeof vaga !== "string" || !UUID.test(vaga)) return null;
  const anuncio = await obterAnuncio(vaga);
  if (!anuncio || anuncio.autor_id !== usuarioId || anuncio.tipo !== "vaga") return null;
  return { id: anuncio.id, titulo: anuncio.titulo };
}

/** "?vaga=…" para os links da biblioteca, quando a pessoa veio de uma vaga. */
export const comVaga = (href: string, vaga: { id: string } | null) =>
  vaga ? `${href}${href.includes("?") ? "&" : "?"}vaga=${vaga.id}` : href;

/** "← Voltar para a vaga: Auxiliar de cozinha" (os testes da vaga). */
export function VoltarParaVaga({ vaga }: { vaga: { id: string; titulo: string } }) {
  return (
    <Link
      href={`/painel/anuncio/${vaga.id}/testes`}
      className="inline-flex min-h-11 items-center gap-1.5 self-start text-label text-ink-muted hover:text-ink"
    >
      <ArrowLeft aria-hidden className="size-4" />
      <span>
        Voltar para a vaga: <span className="text-ink">{vaga.titulo}</span>
      </span>
    </Link>
  );
}
