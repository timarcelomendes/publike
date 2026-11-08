"use client";

import { LoaderCircle, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { pularRegra } from "@/lib/acoes/processo";
import { REGRAS, type Regra } from "@/lib/processo";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";

/**
 * Uma regra do processo travou (Configurações › Processo): diz o que falta e deixa quem administra pular, dizendo o
 * motivo, que fica na Trilha. Depois de pular, `aoPular` tenta de novo o que travou.
 */
export function PularRegra({
  anuncioId,
  perfilId,
  regra,
  aoPular,
}: {
  anuncioId: string;
  perfilId: string;
  regra: Regra;
  aoPular: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const r = REGRAS[regra];
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line-strong bg-surface-100 p-3">
      <p className="flex items-center gap-2 text-label">
        <ShieldAlert aria-hidden className="size-4 shrink-0 text-terra-text" />
        {r.falta}
      </p>
      <p className="text-body-sm text-ink-muted">
        É uma regra das{" "}
        <Link href="/painel/configuracoes?aba=processo" className="underline underline-offset-2">
          Configurações
        </Link>
        . Quem administra a conta pode pular, dizendo o motivo: a Trilha da vaga mostra.
      </p>
      <label htmlFor={`pular-${regra}-${perfilId}`} className="text-label">
        Motivo
      </label>
      <input
        id={`pular-${regra}-${perfilId}`}
        value={motivo}
        maxLength={200}
        placeholder={regra === "entrevista" ? "Ex.: conversamos por telefone" : "Ex.: já trabalhou aqui antes"}
        onChange={(e) => setMotivo(e.target.value)}
        className={classesEntrada}
      />
      <div>
        <Botao
          tamanho="sm"
          disabled={pendente || motivo.trim().length < 3}
          onClick={() =>
            iniciar(async () => {
              setErro(null);
              const res = await chamarAcao(() => pularRegra(anuncioId, perfilId, regra, motivo));
              if (!res.ok) return setErro(res.erro);
              aoPular();
            })
          }
        >
          {pendente && <LoaderCircle aria-hidden className="animate-spin" />}
          {r.pular}
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
