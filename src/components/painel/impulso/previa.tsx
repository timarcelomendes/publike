import { textoDoAnuncio, type VagaDoImpulso } from "@/lib/impulso";

/**
 * Como o anúncio sai no Google (a prévia na hora de comprar): o "Patrocinado", o endereço, os três primeiros títulos e
 * as duas primeiras descrições. O Google mistura os títulos e as descrições; esta é uma das combinações.
 */
export function PreviaDoAnuncio({ vaga, raio }: { vaga: VagaDoImpulso; raio: number | null }) {
  const t = textoDoAnuncio(vaga);
  return (
    <figure className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-100 p-4 shadow-card sm:p-5">
        <p className="text-caption text-ink-muted">
          <span className="font-bold text-ink">Patrocinado</span>
        </p>
        <p className="flex items-center gap-2 text-body-sm">
          <span className="grid size-7 shrink-0 place-items-center rounded-pill bg-surface-300 text-[13px] font-bold">
            P
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="font-semibold">Publike</span>
            <span className="truncate text-ink-muted">
              publike.org › {t.caminho1} › {t.caminho2}
            </span>
          </span>
        </p>
        <p className="text-[19px] leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">
          {titulosDaPrevia(t.titulos).join(" | ")}
        </p>
        <p className="text-body-sm text-ink-muted">{descricoesDaPrevia(t.descricoes).join(" ")}</p>
      </div>
      <figcaption className="text-body-sm text-ink-muted">
        Para quem pesquisa {t.palavras[0] ? `“${t.palavras[0]}”` : "pela função"} e parecidas
        {raio ? `, a até ${raio} km da vaga` : ""}. O Google mistura os títulos e as descrições; esta é uma das
        combinações.
      </figcaption>
    </figure>
  );
}

/** Três títulos que não se repetem: a função, o salário (ou o regime) e o bairro. O Google mistura de outros jeitos. */
function titulosDaPrevia(titulos: string[]) {
  const [funcao, ...resto] = titulos;
  const dizOutraCoisa = resto.filter((x) => !x.toLowerCase().includes(funcao.toLowerCase()));
  const segundo = dizOutraCoisa.find((x) => x.includes("R$")) ?? dizOutraCoisa[0];
  const terceiro = dizOutraCoisa.find((x) => x !== segundo && x.startsWith("Vaga em")) ?? dizOutraCoisa.find((x) => x !== segundo);
  return [funcao, segundo, terceiro].filter((x): x is string => Boolean(x));
}

/** A primeira descrição e outra que diga outra coisa (o match, de preferência). */
function descricoesDaPrevia(descricoes: string[]) {
  const [primeira, ...resto] = descricoes;
  const comeco = (x: string) => x.split(" em ")[0];
  const outra = resto.find((x) => x.startsWith("Curtiu")) ?? resto.find((x) => comeco(x) !== comeco(primeira));
  return outra ? [primeira, outra] : [primeira];
}
