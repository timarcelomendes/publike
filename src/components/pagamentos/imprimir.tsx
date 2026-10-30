"use client";

import { Printer } from "lucide-react";
import { Botao } from "../ui/botao";

export function BotaoImprimir() {
  return (
    <Botao variante="secundario" tamanho="sm" onClick={() => window.print()} className="print:hidden">
      <Printer aria-hidden />
      Imprimir recibo
    </Botao>
  );
}
