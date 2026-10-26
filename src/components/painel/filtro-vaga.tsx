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
  cliente = null,
  compacto = false,
  todas = true,
}: {
  /** `total`: quantos candidatos, entre parênteses (sem ele, só o título) */
  vagas: { id: string; titulo: string; total?: number }[];
  vaga: string | null;
  etapa: string | null;
  situacao?: string | null;
  /** a página que filtra (Candidatos ou a caixa de entrada) */
  caminho?: string;
  /** a aba aberta da caixa de entrada */
  aba?: string | null;
  /** agência: o cliente escolhido (fica no filtro) */
  cliente?: string | null;
  /** na linha das abas (caixa de entrada): "Vaga: todas", da altura das abas e sem o rótulo em cima */
  compacto?: boolean;
  /** com a opção "Todas as vagas" (sem ela, sempre uma vaga escolhida: o "Para a sua vaga" dos Talentos) */
  todas?: boolean;
}) {
  const nome = (v: { titulo: string; total?: number }) =>
    v.total === undefined ? v.titulo : `${v.titulo} (${v.total})`;
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const mudar = (valor: string) => {
    const q = new URLSearchParams();
    if (cliente) q.set("cliente", cliente);
    if (valor) q.set("vaga", valor);
    if (aba) q.set("aba", aba);
    if (situacao) q.set("situacao", situacao);
    else if (etapa) q.set("etapa", etapa);
    const s = q.toString();
    iniciar(() => router.push(`${caminho}${s ? `?${s}` : ""}`, { scroll: false }));
  };
  if (compacto) {
    return (
      <Seletor
        id="filtro-vaga"
        aria-label="Vaga"
        value={vaga ?? ""}
        disabled={pendente}
        onChange={(e) => mudar(e.target.value)}
        envoltorio="min-w-0 shrink-0 self-start sm:ml-auto sm:max-w-72 sm:self-auto"
        className={`field-sizing-content min-h-10 max-w-full rounded-pill border pl-4 text-label transition-colors disabled:opacity-60 ${
          vaga
            ? "border-ink bg-surface-200 text-ink"
            : "border-line-strong bg-surface-200 text-ink hover:bg-surface-300"
        }`}
      >
        {todas && <option value="">Vaga: todas</option>}
        {vagas.map((v) => (
          <option key={v.id} value={v.id}>
            {nome(v)}
          </option>
        ))}
      </Seletor>
    );
  }
  return (
    <div className="flex flex-col gap-1.5 sm:w-full sm:max-w-md">
      <label htmlFor="filtro-vaga" className="text-label">
        Vaga
      </label>
      <Seletor
        id="filtro-vaga"
        value={vaga ?? ""}
        disabled={pendente}
        onChange={(e) => mudar(e.target.value)}
        className={classesEntrada}
      >
        {todas && <option value="">Todas as vagas</option>}
        {vagas.map((v) => (
          <option key={v.id} value={v.id}>
            {nome(v)}
          </option>
        ))}
      </Seletor>
    </div>
  );
}
