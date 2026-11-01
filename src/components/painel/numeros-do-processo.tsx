import { nomeDaOrigem, taxa, textoDoTempo } from "@/lib/automacoes";
import type { NumerosDaVaga } from "@/lib/servidor/automacoes";

// As partes dos Números do processo (claude/plano-recursos-concorrentes.md, parte 6), de todas as vagas
// (/painel/numeros) e de uma só (a aba Números da vaga): os tempos, o funil de contratação e a origem dos
// candidatos. As barras são na cor da tinta, e as contratações no verde do sucesso (o terra fica para a ação
// principal da tela).

const ETAPAS_DO_FUNIL: { chave: keyof NumerosDaVaga; nome: string; ajuda: string }[] = [
  { chave: "candidatos", nome: "Candidaturas", ajuda: "o total, o ponto de partida" },
  { chave: "respondidos", nome: "Respondidas", ajuda: "receberam a sua resposta" },
  { chave: "analise", nome: "Em análise", ajuda: "foram para análise ou além" },
  { chave: "entrevista", nome: "Entrevistas", ajuda: "chegaram à entrevista" },
  { chave: "contratados", nome: "Contratações", ajuda: "foram contratados" },
];

/** A passagem de uma etapa para a outra em que mais gente parou (só com 2 pessoas ou mais na de antes). */
function ondeMaisParam(n: number[]) {
  let pior: { i: number; seguiram: number; antes: number } | null = null;
  for (let i = 1; i < n.length; i++) {
    const antes = n[i - 1];
    if (antes < 2) continue;
    if (!pior || n[i] / antes < pior.seguiram / pior.antes) pior = { i, seguiram: n[i], antes };
  }
  return pior && pior.seguiram < pior.antes ? pior : null;
}

export function TemposDoProcesso({ linha }: { linha: NumerosDaVaga }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tempo titulo="Até a primeira resposta" valor={textoDoTempo(linha.horas_resposta, "h")} />
        <Tempo titulo="Até a entrevista" valor={textoDoTempo(linha.dias_entrevista, "d")} />
        <Tempo titulo="Até contratar" valor={textoDoTempo(linha.dias_contratar, "d")} />
      </div>
      <p className="text-caption text-ink-muted">
        A mediana: metade das candidaturas levou menos que isso, contando do dia em que a pessoa se candidatou.
      </p>
    </div>
  );
}

function Tempo({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface-200 p-4">
      <span className="text-body-sm text-ink-muted">{titulo}</span>
      <span className="text-h2">{valor}</span>
    </div>
  );
}

/** A passagem de uma etapa para a próxima: quantos seguiram, em % (vazio quando ninguém chegou à de antes). */
const passagem = (n: number[], i: number) => (n[i - 1] > 0 ? taxa(n[i], n[i - 1]) || "0%" : "—");

/**
 * O funil de contratação: as 5 etapas lado a lado (no celular, uma embaixo da outra), cada uma com o número, a
 * barra (a altura é a parte do total) e a parte do total; entre uma e outra, quantos % seguiram. A passagem em que
 * mais gente para fica marcada, e no alto vai a taxa de contratação (contratações ÷ candidaturas).
 */
export function FunilDeContratacao({ linha }: { linha: NumerosDaVaga }) {
  const n = ETAPAS_DO_FUNIL.map((e) => Number(linha[e.chave]) || 0);
  const total = Math.max(1, n[0]);
  const pior = ondeMaisParam(n);
  const ultima = ETAPAS_DO_FUNIL.length - 1;
  return (
    <section aria-labelledby="funil" className="flex flex-col gap-5 rounded-lg border border-line bg-surface-200 p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id="funil" className="text-h3">
            Funil de contratação
          </h3>
          <p className="text-body-sm text-ink-muted">
            {pior
              ? `Onde mais gente para: de ${ETAPAS_DO_FUNIL[pior.i - 1].nome} para ${ETAPAS_DO_FUNIL[pior.i].nome}, ${
                  pior.seguiram === 0 ? "ninguém seguiu" : `${pior.seguiram} de ${pior.antes} seguiram`
                }.`
              : "Cada etapa mostra quantas pessoas chegaram até ela."}
          </p>
        </div>
        <p className="flex flex-col items-start sm:items-end">
          <span className="text-h2 tabular-nums">{n[0] ? taxa(n[ultima], n[0]) || "0%" : "—"}</span>
          <span className="text-caption text-ink-muted">taxa de contratação</span>
        </p>
      </div>

      <ol className="grid grid-cols-1 sm:grid-cols-5">
        {ETAPAS_DO_FUNIL.map((e, i) => {
          const ehPior = pior?.i === i;
          const contratacao = i === ultima;
          return (
            <li
              key={e.chave}
              className="relative flex flex-col gap-2 border-line py-3 max-sm:border-t max-sm:first:border-t-0 sm:border-l sm:px-4 sm:py-0 sm:first:border-l-0 sm:first:pl-0"
            >
              <div className="flex items-baseline justify-between gap-3 sm:flex-col sm:items-start sm:gap-0.5">
                <span className="text-label">{e.nome}</span>
                <span className="text-h2 tabular-nums sm:text-h1">{n[i]}</span>
              </div>
              {i > 0 && (
                <span
                  className={`inline-flex w-fit items-center gap-1 rounded-pill px-2 py-0.5 text-caption tabular-nums sm:hidden ${
                    ehPior ? "bg-ipe text-on-ipe" : "border border-line bg-surface-100 text-ink-muted"
                  }`}
                  title={`De ${ETAPAS_DO_FUNIL[i - 1].nome} para ${e.nome}`}
                >
                  <span aria-hidden>→</span>
                  <span className="sr-only">Da etapa anterior, seguiram </span>
                  {passagem(n, i)}
                </span>
              )}
              {/* a barra: deitada no celular, em pé no computador (a altura é a parte do total) */}
              <span aria-hidden className="block h-2 overflow-hidden rounded-pill bg-surface-300 sm:hidden">
                <span
                  className={`block h-full rounded-pill ${contratacao ? "bg-cerrado" : "bg-ink-muted"}`}
                  style={{ width: `${(n[i] / total) * 100}%` }}
                />
              </span>
              <span className="relative hidden h-20 items-end rounded-md bg-surface-300 sm:flex">
                {i > 0 && (
                  <span
                    className={`absolute top-1/2 -left-4 z-10 hidden -translate-x-1/2 -translate-y-1/2 items-center sm:inline-flex gap-1 rounded-pill px-2 py-0.5 text-caption tabular-nums ${
                      ehPior ? "bg-ipe text-on-ipe" : "border border-line bg-surface-100 text-ink-muted"
                    }`}
                    title={`De ${ETAPAS_DO_FUNIL[i - 1].nome} para ${e.nome}`}
                  >
                    <span aria-hidden>→</span>
                    <span className="sr-only">Da etapa anterior, seguiram </span>
                    {passagem(n, i)}
                  </span>
                )}

                <span
                  aria-hidden
                  className={`block w-full rounded-md ${contratacao ? "bg-cerrado" : "bg-ink-muted"}`}
                  style={{ height: `${Math.max(n[i] ? 4 : 0, (n[i] / total) * 100)}%` }}
                />
              </span>
              <span className="text-caption text-ink-muted">
                {i === 0 ? e.ajuda : `${taxa(n[i], n[0]) || "0%"} do total ${e.ajuda}`}
              </span>
            </li>
          );
        })}
      </ol>
      {linha.nao_seguiu > 0 && (
        <p className="text-caption text-ink-muted">
          {linha.nao_seguiu === 1 ? "1 pessoa está" : `${linha.nao_seguiu} pessoas estão`} em Não seguiu.
        </p>
      )}
    </section>
  );
}

export function DeOndeVieram({
  origens,
}: {
  origens: { origem: string; candidatos: number; entrevista: number; contratados: number }[];
}) {
  const todos = origens.reduce((t, o) => t + o.candidatos, 0);
  return (
    <section aria-labelledby="origem" className="flex flex-col gap-3">
      <h3 id="origem" className="text-h3">
        Origem dos candidatos
      </h3>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface-200">
        <table className="w-full min-w-[32rem] text-left text-body-sm">
          <thead className="text-caption text-ink-muted">
            <tr className="border-b border-line">
              <th className="px-4 py-2.5 font-normal">Origem</th>
              <th className="px-4 py-2.5 text-right font-normal">Candidatos</th>
              <th className="px-4 py-2.5 text-right font-normal">Chegaram à entrevista</th>
              <th className="px-4 py-2.5 text-right font-normal">Contratados</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line tabular-nums">
            {origens.map((o) => (
              <tr key={o.origem}>
                <th scope="row" className="px-4 py-2.5 font-normal">
                  <span className="text-label">{nomeDaOrigem(o.origem)}</span>
                  <span aria-hidden className="mt-1.5 block h-1.5 max-w-48 overflow-hidden rounded-pill bg-surface-300">
                    <span
                      className="block h-full rounded-pill bg-ink-muted"
                      style={{ width: `${(o.candidatos / Math.max(1, todos)) * 100}%` }}
                    />
                  </span>
                </th>
                <td className="px-4 py-2.5 text-right">{o.candidatos}</td>
                <td className="px-4 py-2.5 text-right">
                  {o.entrevista}
                  {o.candidatos > 0 && <span className="text-ink-muted"> · {taxa(o.entrevista, o.candidatos)}</span>}
                </td>
                <td className="px-4 py-2.5 text-right">{o.contratados}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
