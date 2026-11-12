import type { VarianteSelo } from "@/components/ui/basicos";

// Os nomes de Admin › Impulsos, iguais em todas as abas (a página, o histórico e o impulso novo).

export const NOME_DA_SITUACAO: Record<string, string> = {
  pago: "Criando no Google",
  em_revisao: "Em revisão no Google",
  no_ar: "No ar",
  encerrado: "Encerrado",
  credito: "Virou crédito",
  devolvido: "Devolvido",
};

export const VARIANTE_DA_SITUACAO: Record<string, VarianteSelo> = {
  pago: "neutro",
  em_revisao: "neutro",
  no_ar: "match",
  encerrado: "neutro",
  credito: "neutro",
  devolvido: "aviso",
};

/** De onde veio o impulso: quem pagou e como. */
export const NOME_DA_ORIGEM: Record<string, string> = {
  compra: "Pago",
  credito: "Crédito",
  cortesia: "Grátis",
  admin: "Pelo admin",
  automatico: "Automático",
  cliente: "Campanha do cliente",
};

/** O impulso ainda corre (criando, em revisão ou no ar). */
export function ehCorrendo(situacao: string) {
  return situacao === "pago" || situacao === "em_revisao" || situacao === "no_ar";
}
