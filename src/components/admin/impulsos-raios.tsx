"use client";

import { useId, useState } from "react";
import { salvarRaiosAdmin } from "@/lib/acoes/admin-impulsos";
import { formatarDataHora, formatarMoeda, plural } from "@/lib/formato";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

// Admin › Impulsos › Regras › Raios das vagas impulsionadas (claude/plano-raios-das-vagas-impulsionadas.md; migração
// 20270523120000). A chave, o raio, o lance a mais e o mínimo; a lista dos pacotes no ar com o raio de cada um.

export type LinhaDoRaio = {
  impulso: string;
  titulo: string;
  cliente: string | null;
  /** no Google agora, à espera da volta, recusado ou tirado (o pacote acabou) */
  situacao: "ligado" | "espera" | "fora" | "tirado";
  lance: number | null;
  vistas: number | null;
  cliques: number | null;
  custo: number | null;
  erro: string | null;
};

export function RaiosDaGeral({
  config,
  linhas,
  feitaEm,
  erro,
}: {
  config: { ligados: boolean; km: number; lance: number; minimo: number };
  linhas: LinhaDoRaio[];
  feitaEm: string | null;
  erro: { texto: string | null; em: string | null };
}) {
  const id = useId();
  const [c, setC] = useState(config);
  const { rodar, pendente, mensagem } = useAcao();
  const numero = (campo: "km" | "lance" | "minimo", rotulo: string, min: number, max: number, unidade: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-body-sm text-ink-muted">{rotulo}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          step={campo === "km" ? "0.5" : "1"}
          value={c[campo]}
          onChange={(e) => setC({ ...c, [campo]: Number(e.target.value) })}
          className={`${classesEntrada} w-28`}
        />
        <span className="text-body-sm text-ink-muted">{unidade}</span>
      </span>
    </label>
  );

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        rodar(() => salvarRaiosAdmin(c));
      }}
    >
      <label className="flex items-start gap-2 text-body">
        <input
          type="checkbox"
          checked={c.ligados}
          onChange={(e) => setC({ ...c, ligados: e.target.checked })}
          className="mt-1 size-4"
          aria-describedby={`${id}-chave`}
        />
        <span>
          Raio em volta de cada vaga impulsionada
          <span id={`${id}-chave`} className="block text-body-sm text-ink-muted">
            Entrou um pacote, a campanha geral passa a dar lance maior para quem está perto da vaga; acabou, o raio sai.
            Desligada, o robô tira todos os raios (as cidades da campanha ficam como estão).
          </span>
        </span>
      </label>
      <div className="flex flex-wrap gap-4">
        {numero("km", "Raio em volta da vaga", 3, 30, "km")}
        {numero("lance", "Lance a mais", 0, 300, "%")}
        {numero("minimo", "Lance mínimo", 0, 300, "%")}
      </div>
      <p className="-mt-2 max-w-3xl text-body-sm text-ink-muted">
        Toda manhã, o robô olha os últimos 7 dias de cada raio. Onde o clique já sai mais barato que na campanha toda, o
        lance a mais desce na mesma proporção, até o mínimo. Com menos de 5 cliques no raio, fica o lance a mais inteiro.
        Raios que se cruzam não somam: vale um só.
      </p>
      <p className="text-body-sm text-ink-muted">
        {feitaEm ? `A última medida foi em ${formatarDataHora(feitaEm)}.` : "O robô ainda não mediu os raios."}
      </p>
      {erro.texto && (
        <p className="text-body-sm break-words text-danger">
          {erro.em ? `${formatarDataHora(erro.em)}: ` : ""}
          {erro.texto}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Botao type="submit" variante="primario" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar os raios"}
        </Botao>
        {mensagem}
      </div>
      {linhas.length > 0 && (
        <section className="flex flex-col gap-2">
          <h4 className="text-label">Pacotes no ar</h4>
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
            {linhas.map((l) => (
              <li key={l.impulso} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-3">
                <span className="min-w-0">
                  <span className="text-body font-semibold">{l.titulo}</span>
                  {l.cliente && <span className="text-body-sm text-ink-muted"> · {l.cliente}</span>}
                  {l.cliques !== null && (
                    <span className="block text-body-sm text-ink-muted">
                      Em 7 dias, dentro do raio: {plural(l.vistas ?? 0, "vista", "vistas")},{" "}
                      {plural(l.cliques, "clique", "cliques")}
                      {l.cliques > 0 && l.custo !== null ? `, ${formatarMoeda(l.custo / l.cliques)} por clique` : ""}
                    </span>
                  )}
                  {l.erro && <span className="block text-body-sm break-words text-danger">{l.erro}</span>}
                </span>
                <span className="text-body-sm">
                  {l.situacao === "ligado"
                    ? `No Google, +${l.lance ?? 0}%`
                    : l.situacao === "tirado"
                      ? "Tirado (o pacote acabou)"
                      : l.situacao === "fora"
                        ? "Fora"
                        : c.ligados && config.ligados
                          ? "Entra na próxima volta"
                          : "Com a chave desligada"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </form>
  );
}
