import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { DicaDeNovidade } from "@/components/ui/dica-de-novidade";
import { plural } from "@/lib/formato";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/** Os comentários da vaga no painel: quantos e quantos esperam resposta, com o link para responder na vaga. */
export async function ComentariosNoPainel({ anuncioId }: { anuncioId: string }) {
  const { data, error } = await (await criarClienteServidor()).rpc("comentarios_das_minhas_vagas", {
    p_anuncios: [anuncioId],
  });
  // sem a migração 20270318120000, nada
  if (error) return null;
  const linha = data?.[0];
  const total = Number(linha?.comentarios ?? 0);
  const semResposta = Number(linha?.sem_resposta ?? 0);
  return (
    <DicaDeNovidade chave="comentarios-empresa" logado>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-200 px-4 py-3">
        <MessageCircle aria-hidden className="size-5 shrink-0 text-ink-muted" />
        <p className="min-w-0 flex-1 text-body-sm">
          <span className="font-semibold">Comentários na vaga: </span>
          {total === 0
            ? "ninguém comentou ainda."
            : semResposta > 0
              ? `${plural(total, "comentário", "comentários")}, ${plural(semResposta, "espera", "esperam")} a sua resposta.`
              : `${plural(total, "comentário", "comentários")}, todos respondidos.`}
        </p>
        <Link
          href={`/anuncio/${anuncioId}#comentarios`}
          className="text-label underline underline-offset-2 hover:text-terra-text"
        >
          {semResposta > 0 ? "Responder" : "Ver os comentários"}
        </Link>
      </div>
    </DicaDeNovidade>
  );
}
