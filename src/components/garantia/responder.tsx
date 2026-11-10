"use client";

import { CircleCheckBig, UserX } from "lucide-react";
import { useState } from "react";
import { responderGarantia } from "@/lib/acoes/garantia";
import { Botao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

/** "Continua" ou "Saiu", uma vez (a garantia acompanhada com o cliente, migração 20270410120000). */
export function ResponderGarantia({ token, pessoa }: { token: string; pessoa: string }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [respondido, setRespondido] = useState(false);
  const responder = (r: "continua" | "saiu") =>
    rodar(
      () => responderGarantia(token, r),
      (x) => x.ok && setRespondido(true),
    );
  return (
    <div className="flex flex-col gap-3">
      {!respondido && (
        <div className="flex flex-wrap gap-2">
          <Botao disabled={pendente} onClick={() => responder("continua")}>
            <CircleCheckBig aria-hidden />
            {pessoa} continua
          </Botao>
          <Botao variante="secundario" disabled={pendente} onClick={() => responder("saiu")}>
            <UserX aria-hidden />
            {pessoa} saiu
          </Botao>
        </div>
      )}
      {mensagem}
    </div>
  );
}
