"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { classesEntrada, Seletor } from "../ui/campo";

/** Escolhe de qual vaga ver os candidatos (troca a URL, mantendo a etapa). */
export function FiltroVaga({
  vagas,
  vaga,
  etapa,
}: {
  vagas: { id: string; titulo: string; total: number }[];
  vaga: string | null;
  etapa: string | null;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <div className="flex flex-col gap-1.5 sm:max-w-md">
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
          if (etapa) q.set("etapa", etapa);
          const s = q.toString();
          iniciar(() => router.push(`/painel/candidatos${s ? `?${s}` : ""}`, { scroll: false }));
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
