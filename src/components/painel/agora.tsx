import { ChevronRight, CircleCheck } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/basicos";
import type { Cartao } from "./hoje";

// "Para fazer", o miolo do Hoje de quem contrata (claude/plano-painel-hoje-novo-design.md): o item mais urgente num
// cartão escuro (com "Agora" em amarelo, as pessoas e uma ação branca) e o resto numa lista, com a hora (ou o
// "quando") na frente de cada item, como uma agenda do dia e da semana. Cada item tem uma ação.

export type ItemAgora = Cartao & {
  /** a ação principal do dia (o primeiro item) */
  principal?: boolean;
  /** quem espera (até 3 nomes): as iniciais no cartão escuro */
  pessoas?: string[];
};

export function Agora({ itens, vazio }: { itens: ItemAgora[]; vazio: string }) {
  const [primeiro, ...resto] = itens;
  return (
    <section aria-labelledby="agora-titulo" className="flex min-w-0 flex-col gap-3">
      <h2 id="agora-titulo" className="text-h2">
        Para fazer
      </h2>
      {!primeiro ? (
        <p className="flex items-center gap-2 rounded-lg border border-line bg-surface-200 px-4 py-4 text-body text-ink sm:px-6">
          <CircleCheck aria-hidden className="size-5 shrink-0 text-cerrado-text" />
          {vazio}
        </p>
      ) : (
        <>
          <article className="flex flex-col gap-4 rounded-lg bg-hero px-5 py-6 text-on-hero shadow-raised sm:p-7">
            <span className="self-start rounded-pill bg-ipe px-3 py-1.5 text-[13px] leading-4 font-bold text-on-ipe">
              {primeiro.quando ?? "Agora"}
            </span>
            <h3 className="font-display text-[25px] leading-[30px] font-bold tracking-[-0.4px] sm:text-[30px] sm:leading-9 sm:tracking-[-0.5px]">
              {primeiro.titulo}
            </h3>
            {primeiro.pessoas && primeiro.pessoas.length > 0 && (
              <span className="flex items-center gap-3">
                <span aria-hidden className="flex shrink-0">
                  {primeiro.pessoas.slice(0, 3).map((nome, i) => (
                    <Avatar
                      key={`${nome}-${i}`}
                      nome={nome}
                      tamanho={44}
                      className={`border-[3px] border-hero text-ink ${i > 0 ? "-ml-2" : ""}`}
                    />
                  ))}
                </span>
                <span className="text-body">{nomes(primeiro.pessoas)}</span>
              </span>
            )}
            {primeiro.texto && <p className="text-body-sm text-on-hero-muted sm:text-[15px] sm:leading-[22px]">{primeiro.texto}</p>}
            <Link
              href={primeiro.href}
              className="inline-flex min-h-12 items-center justify-center gap-2 self-stretch rounded-md bg-surface-200 px-5 text-label text-ink transition-opacity hover:opacity-90 sm:self-start"
            >
              {primeiro.acao}
              <ChevronRight aria-hidden className="size-[18px]" strokeWidth={2.25} />
            </Link>
          </article>

          {resto.length > 0 && (
            <ol className="overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card">
              {resto.map((item, i) => (
                <li
                  key={`${item.titulo}-${i}`}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-0.5 px-4 py-3.5 sm:flex-nowrap sm:px-5 sm:py-4 ${
                    i > 0 ? "border-t border-line" : ""
                  }`}
                >
                  <span
                    className={`basis-full font-display text-[15px] leading-5 font-bold sm:w-[100px] sm:shrink-0 sm:basis-auto sm:text-[17px] ${
                      item.tom === "bom" ? "text-cerrado-text" : "text-ink"
                    }`}
                  >
                    {item.quando ?? "Hoje"}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body font-semibold">{item.titulo}</span>
                    {item.texto && <span className="text-body-sm text-ink-muted">{item.texto}</span>}
                  </span>
                  <Link
                    href={item.href}
                    className="inline-flex shrink-0 items-center gap-0.5 text-label whitespace-nowrap text-terra-text sm:min-h-10 sm:rounded-md sm:border sm:border-line-strong sm:bg-surface-200 sm:px-3.5 sm:text-ink sm:hover:bg-surface-300"
                  >
                    {item.acao}
                    <ChevronRight aria-hidden className="size-4 sm:hidden" strokeWidth={2.25} />
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

/** "Ana, Kauã e Larissa" */
function nomes(lista: string[]) {
  const n = lista.slice(0, 3);
  return n.length <= 1 ? (n[0] ?? "") : `${n.slice(0, -1).join(", ")} e ${n[n.length - 1]}`;
}
