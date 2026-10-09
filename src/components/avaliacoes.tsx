import { MessageSquareReply, Star } from "lucide-react";
import Link from "next/link";
import { MIN_AVALIACOES } from "@/lib/constantes";
import { formatarNota, plural, tempoRelativo } from "@/lib/formato";
import type { AvaliacaoPublica } from "@/lib/tipos";
import { Avatar } from "./ui/basicos";

/** Cinco estrelas, cheias até a nota. Só visual: o número vem escrito ao lado (ou no rótulo). */
export function Estrelas({
  nota,
  tamanho = 16,
  className = "",
}: {
  nota: number;
  tamanho?: number;
  className?: string;
}) {
  return (
    <span role="img" aria-label={`${nota} de 5 estrelas`} className={`inline-flex items-center gap-0.5 ${className}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          style={{ width: tamanho, height: tamanho }}
          className={n <= Math.round(nota) ? "text-ipe" : "text-line-strong"}
          fill="currentColor"
          strokeWidth={0}
        />
      ))}
    </span>
  );
}

/**
 * "★ 4,8 (12)". Com menos de 3 avaliações, a média não aparece: uma nota
 * isolada diz pouco. `compacto` é para o cartão da busca.
 */
export function NotaDoProfissional({
  media,
  total,
  compacto = false,
}: {
  media: number | null | undefined;
  total: number | null | undefined;
  compacto?: boolean;
}) {
  const n = total ?? 0;
  if (n < MIN_AVALIACOES || media == null) {
    if (compacto || n === 0) return null;
    return <span className="text-body-sm text-ink-muted">{plural(n, "avaliação", "avaliações")}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-body-sm text-ink">
      <Star aria-hidden className="size-4 text-ipe" fill="currentColor" strokeWidth={0} />
      <span className="font-semibold">{formatarNota(media)}</span>
      <span className="text-ink-muted">{compacto ? `(${n})` : `· ${plural(n, "avaliação", "avaliações")}`}</span>
    </span>
  );
}

/** Lista de avaliações publicadas, com a resposta do profissional logo abaixo. */
export function ListaAvaliacoes({
  avaliacoes,
  agora,
  nomeProfissional,
  mostrarServico = true,
}: {
  avaliacoes: AvaliacaoPublica[];
  agora: number;
  nomeProfissional: string;
  mostrarServico?: boolean;
}) {
  return (
    <ul className="flex flex-col divide-y divide-line">
      {avaliacoes.map((a) => (
        <li key={a.id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
          <Avatar nome={a.autor_nome} foto={a.autor_foto} tamanho={40} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-label">{a.autor_nome}</span>
              <Estrelas nota={a.nota} tamanho={14} />
              <span className="text-body-sm text-ink-muted">{tempoRelativo(a.criado_em, agora)}</span>
            </p>
            {mostrarServico && (
              <p className="text-body-sm text-ink-muted">
                {a.anuncio_id ? (
                  <Link href={`/anuncio/${a.anuncio_id}`} className="underline-offset-2 hover:underline">
                    {a.titulo_servico}
                  </Link>
                ) : (
                  a.titulo_servico
                )}
              </p>
            )}
            {a.comentario && <p className="mt-1.5 text-body whitespace-pre-line">{a.comentario}</p>}
            {a.resposta && (
              <div className="mt-3 flex gap-2 rounded-md bg-surface-300 p-3 text-body-sm">
                <MessageSquareReply aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                <div>
                  <p className="text-label">Resposta de {nomeProfissional.split(" ")[0]}</p>
                  <p className="whitespace-pre-line">{a.resposta}</p>
                </div>
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
