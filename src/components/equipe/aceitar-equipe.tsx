"use client";

import { ArrowLeftRight, Check, LoaderCircle, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { aceitarConviteEquipe, trocarConta } from "@/lib/acoes/equipe";
import { Botao } from "../ui/botao";

// Entrar na equipe pelo link do convite e passar a agir pela agência.

export function AceitarEquipe({ token, agencia }: { token: string; agencia: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [semTroca, setSemTroca] = useState(false);
  const [pendente, iniciar] = useTransition();

  function entrar() {
    setErro(null);
    iniciar(async () => {
      const r = await aceitarConviteEquipe(token);
      if (!r.ok) {
        if (r.ir) return router.push(r.ir);
        return setErro(r.erro);
      }
      if (!r.agindo) return setSemTroca(true);
      router.push("/painel");
      router.refresh();
    });
  }

  if (semTroca) {
    return (
      <p role="status" className="text-body-sm">
        Você entrou na equipe da {agencia}, mas a troca de conta ainda não está ligada no Publike. Avise o suporte.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Botao variante="primario" onClick={entrar} disabled={pendente}>
          {pendente ? <LoaderCircle aria-hidden className="motion-safe:animate-spin" /> : <UserPlus aria-hidden />}
          {pendente ? "Entrando…" : "Entrar na equipe"}
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

/** "Agir como a agência" (quem já é da equipe e está na própria conta). */
export function AgirComo({ contaId, nome }: { contaId: string; nome: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Botao
          variante="primario"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await trocarConta(contaId);
              if (!r.ok) return r.ir ? router.push(r.ir) : setErro(r.erro);
              router.push("/painel");
              router.refresh();
            })
          }
        >
          {pendente ? <Check aria-hidden /> : <ArrowLeftRight aria-hidden />}
          {pendente ? "Trocando…" : `Agir como ${nome}`}
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
