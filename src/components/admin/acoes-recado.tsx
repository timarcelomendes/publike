"use client";

import { CircleCheckBig, Sparkles, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { processarFilasAgora } from "@/lib/acoes/admin";
import { moderarRecado } from "@/lib/acoes/recados";
import { Botao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

/** Liberar (vai ao ar; as denúncias ficam improcedentes) ou remover o recado, com o motivo para quem escreveu. */
export function AcoesModeracaoRecado({ id }: { id: string }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [motivo, setMotivo] = useState("");
  const campo = useId();
  return (
    <div className="flex w-full max-w-xl flex-col gap-2">
      <label htmlFor={campo} className="text-label">
        Motivo para quem escreveu (para remover)
      </label>
      <input
        id={campo}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        maxLength={500}
        placeholder="Ex.: o recado oferece trabalho cobrando taxa."
        className="min-h-10 rounded-md border border-line-strong bg-surface-200 px-3 text-body-sm"
      />
      <div className="flex flex-wrap gap-2">
        <Botao
          tamanho="sm"
          variante="sucesso"
          disabled={pendente}
          onClick={() => rodar(() => moderarRecado(id, "liberar"))}
        >
          <CircleCheckBig aria-hidden />
          Liberar
        </Botao>
        <Botao
          tamanho="sm"
          variante="perigo"
          disabled={pendente || motivo.trim().length < 3}
          onClick={() => rodar(() => moderarRecado(id, "remover", motivo))}
        >
          <Trash2 aria-hidden />
          Remover
        </Botao>
      </div>
      {mensagem}
    </div>
  );
}

/** Só no admin do Mac: roda a revisão da IA (anúncios, recados e avaliações) e a fila de e-mails agora. */
export function RevisarFilaAgora() {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="flex flex-col items-start gap-2">
      <Botao tamanho="sm" disabled={pendente} onClick={() => rodar(processarFilasAgora)}>
        <Sparkles aria-hidden />
        Revisar com a IA agora
      </Botao>
      {mensagem}
    </div>
  );
}
