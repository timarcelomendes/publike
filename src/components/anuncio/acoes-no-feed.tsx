import { MessageCircleQuestion } from "lucide-react";
import Link from "next/link";
import { IndicarNaJanela } from "./indicar-por-email";

// Os comentários e o "Indicar" à vista no cartão da vaga (feed, busca e listas): quantos comentários a vaga tem,
// levando direto à seção, e o "Indicar a um amigo" por e-mail numa janela. Antes ficavam só no fim da página da
// vaga, e ninguém via.

export function ComentariosDoCartao({
  anuncioId,
  comentarios,
  pequeno = false,
}: {
  anuncioId: string;
  comentarios: number;
  pequeno?: boolean;
}) {
  const rotulo =
    comentarios === 0
      ? "Perguntar sobre a vaga nos comentários"
      : `${comentarios} ${comentarios === 1 ? "comentário" : "comentários"}: ver e perguntar`;
  return (
    <Link
      href={`/anuncio/${anuncioId}#comentarios`}
      aria-label={rotulo}
      title={comentarios === 0 ? "Perguntar sobre a vaga" : rotulo}
      className={`relative z-10 inline-flex shrink-0 items-center justify-center gap-1 rounded-pill border border-line-strong bg-surface-200 text-label text-ink transition-colors hover:bg-surface-300 ${
        pequeno ? "min-h-9 min-w-9 px-2" : "min-h-11 min-w-11 px-2.5"
      }`}
    >
      <MessageCircleQuestion aria-hidden className="size-[18px] shrink-0" />
      {comentarios > 0 && <span className="tabular-nums">{comentarios}</span>}
    </Link>
  );
}

/** Os dois botões juntos: comentários e indicar (vaga de outra conta, no ar). */
export function AcoesDaVagaNoCartao({
  anuncioId,
  titulo,
  comentarios,
  logado,
  pequeno = false,
}: {
  anuncioId: string;
  titulo: string;
  comentarios: number;
  logado: boolean;
  pequeno?: boolean;
}) {
  return (
    <span className="relative z-10 flex items-center gap-2">
      <ComentariosDoCartao anuncioId={anuncioId} comentarios={comentarios} pequeno={pequeno} />
      <IndicarNaJanela anuncioId={anuncioId} titulo={titulo} logado={logado} jeito={pequeno ? "pequeno" : "icone"} />
    </span>
  );
}
