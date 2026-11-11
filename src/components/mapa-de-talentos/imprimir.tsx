"use client";

import { Printer } from "lucide-react";
import { Botao } from "../ui/botao";

/** Imprimir ou salvar em PDF, para a agência mostrar ao cliente. */
export function BotaoImprimir() {
  return (
    <Botao variante="secundario" tamanho="sm" className="self-start print:hidden" onClick={() => window.print()}>
      <Printer aria-hidden />
      Imprimir ou salvar em PDF
    </Botao>
  );
}
