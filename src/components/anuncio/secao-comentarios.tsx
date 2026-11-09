import { MessageCircleQuestion } from "lucide-react";
import { lerComentarios } from "@/lib/comentarios";
import { MODO_DEMO } from "@/lib/config";
import { comentariosDasVagas } from "@/lib/servidor/linha";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { ComentariosDaVaga } from "./comentarios";
import { IndicarNaJanela } from "./indicar-por-email";

/** A seção dos comentários da vaga (lida no servidor). Sem a migração 20270318120000, não aparece. */
export async function SecaoComentarios({ anuncioId, agora }: { anuncioId: string; agora: number }) {
  if (MODO_DEMO) return null;
  const { data, error } = await (await criarClienteServidor()).rpc("comentarios_da_vaga", { p_anuncio: anuncioId });
  if (error) return null;
  const dados = lerComentarios(data);
  if (!dados) return null;
  return <ComentariosDaVaga anuncioId={anuncioId} dados={dados} agora={agora} />;
}

/**
 * No alto da vaga, logo abaixo de quem publicou: "Comentários (3)" (leva à seção) e "Indicar a um amigo" (a janela
 * do e-mail). Antes, os dois ficavam só no fim da página.
 */
export async function AtalhosDaVaga({
  anuncioId,
  titulo,
  logado,
}: {
  anuncioId: string;
  titulo: string;
  logado: boolean;
}) {
  if (MODO_DEMO) return null;
  const n = (await comentariosDasVagas([anuncioId]).catch(() => new Map<string, number>())).get(anuncioId) ?? 0;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <a
        href="#comentarios"
        className="inline-flex min-h-10 items-center gap-1.5 rounded-pill border border-line-strong bg-surface-200 px-3.5 text-label text-ink transition-colors hover:bg-surface-300"
      >
        <MessageCircleQuestion aria-hidden className="size-[18px] shrink-0" />
        {n === 0 ? "Perguntar sobre a vaga" : `${n} ${n === 1 ? "comentário" : "comentários"}`}
      </a>
      <IndicarNaJanela anuncioId={anuncioId} titulo={titulo} logado={logado} jeito="botao" />
    </div>
  );
}
