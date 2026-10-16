import { MessageCircleQuestion } from "lucide-react";
import { textoDaResposta, type Pergunta, type Respostas } from "@/lib/vaga-extra";

/** O que o candidato respondeu às perguntas da vaga (cartão em Candidatos e na vaga). */
export function RespostasDoCandidato({
  perguntas,
  respostas,
}: {
  perguntas: Pergunta[];
  respostas: Respostas | undefined;
}) {
  if (!perguntas.length) return null;
  const r = respostas ?? {};
  return (
    <div className="rounded-md border border-line bg-surface-100 p-3">
      <p className="flex items-center gap-2 text-label">
        <MessageCircleQuestion aria-hidden className="size-4 shrink-0 text-ink-muted" />
        Respostas às suas perguntas
      </p>
      <dl className="mt-2 grid gap-x-6 gap-y-2 text-body-sm sm:grid-cols-2">
        {perguntas.map((p) => {
          const texto = textoDaResposta(p, r[p.id]);
          return (
            <div key={p.id} className="min-w-0">
              <dt className="text-ink-muted">{p.nome}</dt>
              <dd className={texto ? "font-semibold break-words" : "text-ink-muted italic"}>
                {texto || "Não respondeu"}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
