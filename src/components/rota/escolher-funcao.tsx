"use client";

import { useRouter } from "next/navigation";

/** "Outra função": ao escolher na lista, a página já mostra os lugares (sem botão de enviar). */
export function EscolherFuncao({
  funcoes,
  atual,
  raio,
  rotulo,
}: {
  funcoes: { cbo: string; titulo: string }[];
  atual: string;
  raio: number;
  rotulo: string;
}) {
  const router = useRouter();
  return (
    <label className="flex flex-wrap items-center gap-2 text-body-sm text-ink-muted">
      {rotulo}
      <select
        value={atual}
        onChange={(e) => {
          const cbo = e.target.value;
          if (cbo) router.push(`/rota-do-curriculo?cbo=${cbo}&raio=${raio}`, { scroll: false });
        }}
        className="min-h-10 rounded-sm border border-line-strong bg-surface-200 px-3 text-body-sm text-ink"
      >
        <option value="">Escolha a função…</option>
        {funcoes.map((f) => (
          <option key={f.cbo} value={f.cbo}>
            {f.titulo}
          </option>
        ))}
      </select>
    </label>
  );
}
