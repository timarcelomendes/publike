"use client";

import { LoaderCircle, Rocket } from "lucide-react";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { cancelarImpulso, impulsionarSemPagar } from "@/lib/acoes/impulso";
import { Botao } from "@/components/ui/botao";

/** Impulsionar sem pagar: com os dias de crédito ou o primeiro grátis. */
export function ImpulsionarSemPagar({
  anuncio,
  jeito,
  dias,
}: {
  anuncio: string;
  jeito: "credito" | "cortesia";
  dias: number;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <div className="flex flex-col items-start gap-2">
      <Botao
        variante="primario"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            const r = await chamarAcao(() => impulsionarSemPagar(anuncio, jeito));
            if (!r.ok) setErro(r.erro);
          })
        }
      >
        {pendente ? <LoaderCircle aria-hidden className="animate-spin" /> : <Rocket aria-hidden />}
        {jeito === "cortesia" ? `Impulsionar ${dias} dias grátis` : `Usar ${dias} ${dias === 1 ? "dia" : "dias"} de crédito`}
      </Botao>
      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
    </div>
  );
}

/** Desistir antes de o anúncio entrar no ar (com a confirmação no próprio lugar). */
export function CancelarImpulso({ id, origem }: { id: string; origem: "compra" | "credito" | "cortesia" }) {
  const [certeza, setCerteza] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const volta =
    origem === "compra"
      ? "O valor volta para você pelo mesmo jeito que pagou."
      : origem === "credito"
        ? "Os dias voltam como crédito."
        : "O impulso grátis fica disponível de novo.";
  if (!certeza)
    return (
      <Botao tamanho="sm" onClick={() => setCerteza(true)}>
        Cancelar o impulso
      </Botao>
    );
  return (
    <div role="group" aria-label="Cancelar o impulso" className="flex flex-col gap-2 rounded-md bg-surface-300 p-3">
      <p className="text-body-sm">Cancelar o impulso? {volta}</p>
      <div className="flex flex-wrap gap-2">
        <Botao
          tamanho="sm"
          variante="primario"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              setErro(null);
              const r = await chamarAcao(() => cancelarImpulso(id));
              if (!r.ok) setErro(r.erro);
            })
          }
        >
          {pendente && <LoaderCircle aria-hidden className="animate-spin" />}
          Sim, cancelar
        </Botao>
        <Botao tamanho="sm" onClick={() => setCerteza(false)} disabled={pendente}>
          Voltar
        </Botao>
      </div>
      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
    </div>
  );
}
