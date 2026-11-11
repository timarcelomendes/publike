"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { mudarDeFaixa } from "@/lib/acoes/assinatura";
import { NOME_PRODUTO, type Produto } from "@/lib/pagamentos";
import { Botao } from "../ui/botao";

/**
 * A troca de faixa sem nada a pagar (migração 20270416120000): a assinatura ainda não tem período pago (os dias
 * grátis ou o 1º Pix esperando), então a faixa muda na hora e a renovação já vem com o valor novo.
 */
export function FormMudarSemPagar({ assinatura, plano, produto }: { assinatura: string; plano: string; produto: Produto }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-line bg-surface-200 p-5 shadow-card">
      <p className="text-body">
        Não há nada a pagar agora: a sua assinatura ainda não tem um período pago. A faixa muda na hora, e a próxima
        cobrança já vem com o valor do {NOME_PRODUTO[produto]}.
      </p>
      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
      <Botao
        variante="primario"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            // sem pagamento, os dados da nota não são usados: vão os que a conta já tem
            const r = await chamarAcao(() =>
              mudarDeFaixa({ forma: "pix", documento: "", nome: "", email: "", plano, assinatura, semPagar: true }),
            );
            if (!r.ok) setErro(r.erro);
            else router.push(r.ir);
          })
        }
      >
        Mudar para o {NOME_PRODUTO[produto]}
      </Botao>
    </div>
  );
}
