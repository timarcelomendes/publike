import { CircleCheck, Zap } from "lucide-react";
import Link from "next/link";
import type { Cartao } from "./hoje";

// "Agora", o miolo do Hoje de quem contrata (claude/plano-painel-feed-indicacao-documentos.md, parte 1): uma lista só,
// na ordem do que é mais urgente, com a hora (ou o "quando") na frente de cada item, como uma agenda do dia. Cada
// item tem uma ação; o primeiro fica em destaque. Substitui o resumo do dia, a faixa do caminho e o "Para fazer agora".

export type ItemAgora = Cartao & {
  /** a ação principal do dia (o primeiro item): o botão escuro com o raio, "Decidir agora" */
  principal?: boolean;
};

export function Agora({ itens, vazio }: { itens: ItemAgora[]; vazio: string }) {
  return (
    <section aria-labelledby="agora-titulo" className="flex flex-col gap-3">
      <h2 id="agora-titulo" className="text-h2">
        Agora
      </h2>
      {itens.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-line bg-surface-200 px-4 py-4 text-body text-ink sm:px-6">
          <CircleCheck aria-hidden className="size-5 shrink-0 text-cerrado-text" />
          {vazio}
        </p>
      ) : (
        <ol className="overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card">
          {itens.map((item, i) => {
            const primeiro = i === 0;
            const urgente = item.tom === "urgente" || primeiro;
            return (
              <li
                key={`${item.titulo}-${i}`}
                className={`flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-4 sm:px-6 sm:py-5 ${
                  primeiro ? "bg-terra-soft" : "border-t border-line"
                }`}
              >
                <span
                  className={`basis-full font-display text-body font-bold sm:basis-24 sm:text-h3 ${
                    urgente ? "text-terra-text" : item.tom === "bom" ? "text-cerrado-text" : "text-ink"
                  }`}
                >
                  {item.quando ?? "Hoje"}
                </span>
                <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
                  <p className="text-body font-bold sm:text-body-lg">{item.titulo}</p>
                  {item.texto && <p className="text-body-sm text-ink-muted">{item.texto}</p>}
                </div>
                <Link
                  href={item.href}
                  className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md px-4 text-label transition-colors sm:w-auto ${
                    item.principal
                      ? "bg-ink text-surface-100 hover:opacity-90"
                      : "border border-line-strong bg-surface-200 text-ink hover:bg-surface-300"
                  }`}
                >
                  {item.principal && <Zap aria-hidden className="size-[18px]" />}
                  {item.acao}
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
