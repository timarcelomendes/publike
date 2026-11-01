"use client";

import { Check, X } from "lucide-react";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { responderProposta } from "@/lib/acoes/proposta";
import { classesEntrada } from "../ui/campo";
import { Botao } from "../ui/botao";

/** Aceitar ou recusar a proposta (o candidato). */
export function ResponderProposta({ anuncioId, empresa }: { anuncioId: string; empresa: string }) {
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const responder = (aceitar: boolean) =>
    iniciar(async () => {
      setErro(null);
      const r = await chamarAcao(() => responderProposta(anuncioId, aceitar, motivo));
      if (!r.ok) setErro(r.erro);
    });
  return (
    <div className="flex flex-col gap-3">
      {!recusando ? (
        <div className="flex flex-wrap gap-2">
          <Botao variante="primario" disabled={pendente} onClick={() => responder(true)}>
            <Check aria-hidden />
            {pendente ? "Enviando…" : "Aceitar a proposta"}
          </Botao>
          <Botao variante="secundario" disabled={pendente} onClick={() => setRecusando(true)}>
            <X aria-hidden />
            Recusar
          </Botao>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <label htmlFor="motivo-recusa" className="text-label">
            Quer contar o motivo para {empresa}? <span className="font-normal text-ink-muted">(opcional)</span>
          </label>
          <textarea
            id="motivo-recusa"
            value={motivo}
            maxLength={300}
            rows={3}
            onChange={(e) => setMotivo(e.target.value)}
            className={classesEntrada}
          />
          <div className="flex flex-wrap gap-2">
            <Botao variante="primario" disabled={pendente} onClick={() => responder(false)}>
              {pendente ? "Enviando…" : "Recusar a proposta"}
            </Botao>
            <Botao variante="fantasma" onClick={() => setRecusando(false)}>
              Voltar
            </Botao>
          </div>
        </div>
      )}
      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
      <p className="text-caption text-ink-muted">
        A sua resposta fica registrada no Publike com a data e a hora, e {empresa} recebe o aviso.
      </p>
    </div>
  );
}
