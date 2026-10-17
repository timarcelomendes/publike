"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { classesEntrada, Seletor } from "../ui/campo";

/** Escolhe de qual vaga ver os candidatos (troca a URL, mantendo a etapa ou o "Para responder"). */
export function FiltroVaga({
  vagas,
  vaga,
  etapa,
  situacao = null,
  caminho = "/painel/candidatos",
  aba = null,
}: {
  vagas: { id: string; titulo: string; total: number }[];
  vaga: string | null;
  etapa: string | null;
  situacao?: string | null;
  /** a página que filtra (Candidatos ou a caixa de entrada) */
  caminho?: string;
  /** a aba aberta da caixa de entrada */
  aba?: string | null;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <div className="flex flex-col gap-1.5 sm:w-full sm:max-w-md">
      <label htmlFor="filtro-vaga" className="text-label">
        Vaga
      </label>
      <Seletor
        id="filtro-vaga"
        value={vaga ?? ""}
        disabled={pendente}
        onChange={(e) => {
          const q = new URLSearchParams();
          if (e.target.value) q.set("vaga", e.target.value);
          if (aba) q.set("aba", aba);
          if (situacao) q.set("situacao", situacao);
          else if (etapa) q.set("etapa", etapa);
          const s = q.toString();
          iniciar(() => router.push(`${caminho}${s ? `?${s}` : ""}`, { scroll: false }));
        }}
        className={classesEntrada}
      >
        <option value="">Todas as vagas</option>
        {vagas.map((v) => (
          <option key={v.id} value={v.id}>
            {v.titulo} ({v.total})
          </option>
        ))}
      </Seletor>
    </div>
  );
}
