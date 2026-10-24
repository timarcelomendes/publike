import { Briefcase, CircleCheck } from "lucide-react";
import Link from "next/link";
import { esperaResposta } from "@/lib/constantes";
import { listarMeusAnuncios, listarMeusCandidatos } from "@/lib/dados";
import { plural } from "@/lib/formato";
import { ONDE_FUNCIONA } from "@/lib/pracas";

const UM_DIA = 24 * 60 * 60 * 1000;

/**
 * No topo do feed, para quem tem vaga no ar: um atalho, não outra tela (o Início é igual para todos).
 * Vaga publicada há menos de um dia e sem candidato: "Sua vaga está no ar" e onde ela aparece (quem
 * publica não via a vaga em lugar nenhum e achava que não tinha saído). Senão: as vagas no ar, os
 * candidatos para responder e o painel.
 */
export async function FaixaDeQuemContrata({ agora }: { agora: number }) {
  const [anuncios, candidatos] = await Promise.all([
    listarMeusAnuncios().catch(() => []),
    listarMeusCandidatos().catch(() => []),
  ]);
  const noAr = anuncios.filter((a) => a.tipo === "vaga" && a.status === "ativo");
  if (!noAr.length) return null;
  const esperam = (candidatos ?? []).filter(esperaResposta).length;
  const nova = noAr
    .filter((a) => agora - new Date(a.criado_em).getTime() < UM_DIA && a.curtidas_total === 0)
    .sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1))[0];

  if (nova && !esperam) {
    return (
      <section
        aria-label="Sua vaga"
        className="flex flex-col gap-2 rounded-lg border border-cerrado/40 bg-cerrado/5 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4"
      >
        <CircleCheck aria-hidden className="size-5 shrink-0 text-cerrado-text" />
        <p className="min-w-0 flex-1 text-body-sm text-ink">
          <span className="font-semibold">Sua vaga “{nova.titulo}” está no ar.</span> Ela aparece aqui no feed para quem
          procura trabalho em {ONDE_FUNCIONA}. Quando alguém curtir, você recebe um aviso.
        </p>
        <span className="flex shrink-0 gap-3 text-label">
          <Link href={`/anuncio/${nova.id}`} className="underline underline-offset-2 hover:text-terra-text">
            Ver a vaga
          </Link>
          <Link href="/painel" className="underline underline-offset-2 hover:text-terra-text">
            Abrir o painel
          </Link>
        </span>
      </section>
    );
  }

  return (
    <section
      aria-label="Suas vagas"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-surface-200 px-3 py-2.5 sm:px-4"
    >
      <Briefcase aria-hidden className="size-4 shrink-0 text-terra-text" />
      <p className="min-w-0 flex-1 text-body-sm text-ink">
        <span className="font-semibold">Suas vagas:</span> {plural(noAr.length, "no ar", "no ar")}
        {esperam > 0 && (
          <>
            {" · "}
            <Link
              href="/painel/caixa?aba=responder"
              className="font-semibold text-terra-text underline underline-offset-2"
            >
              {plural(esperam, "candidato para responder", "candidatos para responder")}
            </Link>
          </>
        )}
      </p>
      <Link href="/painel" className="shrink-0 text-label underline underline-offset-2 hover:text-terra-text">
        Abrir o painel
      </Link>
    </section>
  );
}
