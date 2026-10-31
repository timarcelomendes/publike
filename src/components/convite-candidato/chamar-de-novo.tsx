"use client";

import { Check, Send } from "lucide-react";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { convidarParaVaga } from "@/lib/acoes/talentos";
import { formatarLugar, tempoRelativo } from "@/lib/formato";
import type { CandidatoDeAntes } from "@/lib/servidor/convites-candidato";
import { Avatar } from "../ui/basicos";
import { Botao } from "../ui/botao";

const ATE_ONDE: Record<CandidatoDeAntes["ate_onde"], string> = {
  finalista: "foi finalista",
  entrevista: "chegou à entrevista",
  match: "você aceitou",
};

/** Chamar de novo: quem já se candidatou às suas vagas, com o Convidar de Talentos em cada um. */
export function ChamarDeNovo({
  anuncioId,
  candidatos,
  agora,
}: {
  anuncioId: string;
  candidatos: CandidatoDeAntes[];
  agora: number;
}) {
  return (
    <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
      {candidatos.map((c) => (
        <Linha key={c.perfil_id} anuncioId={anuncioId} c={c} agora={agora} />
      ))}
    </ul>
  );
}

function Linha({ anuncioId, c, agora }: { anuncioId: string; c: CandidatoDeAntes; agora: number }) {
  const [pendente, iniciar] = useTransition();
  const [convidado, setConvidado] = useState(c.convidado);
  const [erro, setErro] = useState<string | null>(null);
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Avatar nome={c.nome} foto={c.foto} tamanho={40} />
      <div className="min-w-0 flex-1">
        <p className="text-label break-words">{c.nome}</p>
        <p className="text-body-sm text-ink-muted">
          {formatarLugar(c.bairro, c.cidade)} · Em {c.vaga}, {ATE_ONDE[c.ate_onde]} (
          {tempoRelativo(c.candidatou_em, agora)})
        </p>
        {erro && (
          <p role="alert" className="text-body-sm text-danger">
            {erro}
          </p>
        )}
      </div>
      {convidado ? (
        <span className="inline-flex items-center gap-1.5 text-body-sm text-cerrado-text">
          <Check aria-hidden className="size-4" />
          Convidado
        </span>
      ) : (
        <Botao
          tamanho="sm"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              setErro(null);
              const r = await chamarAcao(() => convidarParaVaga(anuncioId, c.perfil_id));
              if (r.ok) setConvidado(true);
              else setErro(r.erro);
            })
          }
          aria-label={`Convidar ${c.nome}`}
        >
          <Send aria-hidden />
          Convidar
        </Botao>
      )}
    </li>
  );
}
