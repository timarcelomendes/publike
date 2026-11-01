import { nomeDaOrigem, taxa, textoDoTempo } from "@/lib/automacoes";
import type { NumerosDaVaga } from "@/lib/servidor/automacoes";

// As partes dos Números do processo (claude/plano-recursos-concorrentes.md, parte 6), de todas as vagas
// (/painel/numeros) e de uma só (a aba Números da vaga): os tempos, o caminho dos candidatos e de onde vieram.
// As barras são de uma série só: a cor neutra da tinta (o terra fica para a ação principal da tela).

const ETAPAS_DO_FUNIL: { chave: keyof NumerosDaVaga; nome: string }[] = [
  { chave: "candidatos", nome: "Se candidataram" },
  { chave: "respondidos", nome: "Receberam resposta" },
  { chave: "analise", nome: "Em análise ou depois" },
  { chave: "entrevista", nome: "Chegaram à entrevista" },
  { chave: "contratados", nome: "Contratados" },
];

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

export function CaminhoDosCandidatos({ linha }: { linha: NumerosDaVaga }) {
  return (
    <section aria-labelledby="funil" className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5">
      <h3 id="funil" className="text-h3">
        O caminho dos candidatos
      </h3>
      <ol className="flex flex-col gap-3">
        {ETAPAS_DO_FUNIL.map((e, i) => {
          const n = Number(linha[e.chave]);
          const antes = i > 0 ? Number(linha[ETAPAS_DO_FUNIL[i - 1].chave]) : null;
          const numeros = (
            <>
              <span className="text-label">{n}</span>
              {antes !== null && antes > 0 && (
                <span className="text-ink-muted"> · {taxa(n, antes)} da etapa anterior</span>
              )}
            </>
          );
          // no celular, o nome e os números numa linha e a barra embaixo, na largura toda
          return (
            <li
              key={e.chave}
              className="flex flex-col gap-1 text-body-sm sm:grid sm:grid-cols-[minmax(0,11rem)_1fr] sm:items-center sm:gap-3"
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-label">{e.nome}</span>
                <span className="text-right tabular-nums sm:hidden">{numeros}</span>
              </span>
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-6 min-w-1 rounded-r-[4px] bg-ink-muted"
                  style={{ width: `${Math.max(1, (n / Math.max(1, linha.candidatos)) * 100) * 0.8}%` }}
                />
                <span className="hidden tabular-nums sm:inline">{numeros}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {linha.nao_seguiu > 0 && (
        <p className="text-body-sm text-ink-muted">
          {linha.nao_seguiu} {linha.nao_seguiu === 1 ? "pessoa não seguiu" : "pessoas não seguiram"}.
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
  return (
    <section aria-labelledby="origem" className="flex flex-col gap-3">
      <h3 id="origem" className="text-h3">
        De onde vieram
      </h3>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface-200">
        <table className="w-full min-w-[32rem] text-left text-body-sm">
          <thead className="text-caption text-ink-muted">
            <tr className="border-b border-line">
              <th className="px-4 py-2.5 font-normal">Origem</th>
              <th className="px-4 py-2.5 text-right font-normal">Candidatos</th>
              <th className="px-4 py-2.5 text-right font-normal">Entrevista</th>
              <th className="px-4 py-2.5 text-right font-normal">Contratados</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line tabular-nums">
            {origens.map((o) => (
              <tr key={o.origem}>
                <th scope="row" className="px-4 py-2.5 text-label">
                  {nomeDaOrigem(o.origem)}
                </th>
                <td className="px-4 py-2.5 text-right">{o.candidatos}</td>
                <td className="px-4 py-2.5 text-right">{o.entrevista}</td>
                <td className="px-4 py-2.5 text-right">{o.contratados}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
