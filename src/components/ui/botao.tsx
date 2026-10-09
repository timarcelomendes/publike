import Link from "next/link";
import type { ComponentProps } from "react";

export type VarianteBotao = "primario" | "secundario" | "fantasma" | "perigo" | "sucesso";
export type TamanhoBotao = "md" | "sm";

// Design System: principal em terra (um por tela), secundário com borda,
// alvos de toque de no mínimo 44 px.
const VARIANTES: Record<VarianteBotao, string> = {
  primario: "border-transparent bg-terra text-on-terra hover:bg-terra-hover",
  secundario: "border-line-strong bg-surface-200 text-ink hover:bg-surface-300",
  fantasma: "border-transparent bg-transparent text-ink hover:bg-surface-300",
  perigo: "border-danger bg-surface-200 text-danger hover:bg-surface-300",
  sucesso: "border-transparent bg-cerrado text-on-cerrado hover:brightness-110",
};

const TAMANHOS: Record<TamanhoBotao, string> = {
  md: "min-h-11 px-5",
  sm: "min-h-10 px-3.5",
};

export function classesBotao(variante: VarianteBotao = "secundario", tamanho: TamanhoBotao = "md", extra = "") {
  return [
    "inline-flex items-center justify-center gap-2 rounded-md border text-label whitespace-nowrap",
    "transition-colors disabled:cursor-not-allowed disabled:opacity-60",
    "[&_svg]:size-[18px] [&_svg]:shrink-0",
    VARIANTES[variante],
    TAMANHOS[tamanho],
    extra,
  ].join(" ");
}

/**
 * Botões de login social (Google, Facebook e LinkedIn). Seguem o padrão do botão
 * oficial do Google, que o site não consegue mudar: pílula de 40 px, borda fina,
 * claro no tema claro e escuro no tema escuro (tokens social-* do globals.css).
 */
export const classesBotaoRede = [
  "inline-flex h-10 w-full items-center justify-center gap-2.5 rounded-pill border px-3 whitespace-nowrap",
  "border-social-line bg-social-surface text-body-sm font-medium text-social-ink",
  "transition-colors hover:bg-social-hover disabled:cursor-not-allowed disabled:opacity-60",
].join(" ");

type Estilo = { variante?: VarianteBotao; tamanho?: TamanhoBotao };

export function Botao({ variante, tamanho, className, type = "button", ...props }: ComponentProps<"button"> & Estilo) {
  return <button type={type} className={classesBotao(variante, tamanho, className)} {...props} />;
}

export function BotaoLink({ variante, tamanho, className, ...props }: ComponentProps<typeof Link> & Estilo) {
  return <Link className={classesBotao(variante, tamanho, className)} {...props} />;
}
