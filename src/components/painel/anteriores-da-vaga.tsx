import { History } from "lucide-react";
import Link from "next/link";
import { candidatosDeAntes } from "@/lib/servidor/convites-candidato";

/**
 * Seus candidatos anteriores (migração 20271020120000; claude/plano-concentrar-contratacoes.md, parte 2): na vaga no ar,
 * a linha que lembra quem já se candidatou às outras vagas da conta e ainda não foi convidado para esta, com o link
 * para o "Já se candidataram às suas vagas" (convidar um a um ou vários de uma vez).
 */
export async function AnterioresDaVaga({
  anuncioId,
  noAr,
}: {
  anuncioId: string;
  noAr: boolean;
}) {
  if (!noAr) return null;
  const antes = await candidatosDeAntes(anuncioId).catch(() => null);
  const faltam = (antes ?? []).filter((c) => !c.convidado).length;
  if (!faltam) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line bg-surface-200 px-4 py-3 text-body-sm">
      <History aria-hidden className="size-4 shrink-0 text-ink-muted" />
      <span>
        {faltam === 1
          ? "1 pessoa que já se candidatou às suas vagas pode ser convidada para esta."
          : `${faltam} pessoas que já se candidataram às suas vagas podem ser convidadas para esta.`}
      </span>
      <Link
        href={`/painel/anuncio/${anuncioId}/convidar#chamar-de-novo`}
        className="text-label underline"
      >
        Ver e convidar
      </Link>
    </p>
  );
}
