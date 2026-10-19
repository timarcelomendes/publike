"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { classesEntrada, Seletor } from "../ui/campo";

/**
 * Agência: escolhe de qual cliente ver as vagas ou os candidatos. Troca a URL, mantendo
 * os outros filtros da página (`manter`).
 */
export function FiltroCliente({
  clientes,
  cliente,
  caminho,
  manter = {},
}: {
  clientes: { id: string; nome: string; total: number }[];
  cliente: string | null;
  caminho: string;
  manter?: Record<string, string | null | undefined>;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <div className="flex flex-col gap-1.5 sm:w-full sm:max-w-xs">
      <label htmlFor="filtro-cliente" className="text-label">
        Cliente
      </label>
      <Seletor
        id="filtro-cliente"
        value={cliente ?? ""}
        disabled={pendente}
        onChange={(e) => {
          const q = new URLSearchParams();
          for (const [k, v] of Object.entries(manter)) if (v) q.set(k, v);
          if (e.target.value) q.set("cliente", e.target.value);
          const s = q.toString();
          iniciar(() => router.push(`${caminho}${s ? `?${s}` : ""}`, { scroll: false }));
        }}
        className={classesEntrada}
      >
        <option value="">Todos os clientes</option>
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome} ({c.total})
          </option>
        ))}
      </Seletor>
    </div>
  );
}
