"use client";

import { useState } from "react";
import { devolverPagamento } from "@/lib/acoes/assinatura";
import { formatarMoeda } from "@/lib/formato";
import { dataEHora } from "@/lib/pagamentos";
import { Botao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

/**
 * O arrependimento em 7 dias (migração 20270416120000; CDC, art. 49): no plano por 30 dias e na 1ª compra do anual,
 * em dois toques. O dinheiro volta pela mesma forma de pagamento e os recursos fecham.
 */
export function DevolverPagamento({ cobranca, valor, ate }: { cobranca: string; valor: number; ate: string | null }) {
  const [certeza, setCerteza] = useState(false);
  const { rodar, pendente, mensagem } = useAcao();
  if (!certeza) {
    return (
      <div className="flex flex-col items-start gap-2">
        <Botao variante="fantasma" tamanho="sm" onClick={() => setCerteza(true)}>
          Desistir e receber de volta
        </Botao>
        {mensagem}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-2 rounded-md bg-surface-300 p-3">
      <p className="text-body-sm">
        Você recebe de volta {formatarMoeda(valor)}, pela mesma forma de pagamento, e os recursos fecham agora.
        {ate ? ` Dá para desistir até ${dataEHora(ate)}.` : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <Botao variante="perigo" tamanho="sm" disabled={pendente} onClick={() => rodar(() => devolverPagamento(cobranca))}>
          Desistir e pedir de volta
        </Botao>
        <Botao variante="secundario" tamanho="sm" disabled={pendente} onClick={() => setCerteza(false)}>
          Manter
        </Botao>
      </div>
      {mensagem}
    </div>
  );
}
