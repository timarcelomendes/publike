import type { SemanaDoCurriculo } from "@/lib/admin/dados";
import { formatarNumero } from "@/lib/formato";
import { diaMes, Indicador, pct } from "./metricas-produto";
import { Secao } from "./ui";

/** O domingo da semana que começa na segunda `semana` (AAAA-MM-DD). */
function fimDaSemana(semana: string) {
  const d = new Date(`${semana}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

/**
 * Painel › Cadastro: de cada semana de contas novas de quem procura trabalho, quantas fizeram o currículo em até 7
 * dias (12/11/2026, claude/plano-mais-curriculos.md: o número para ver se o passo depois da curtida e o lembrete
 * funcionam). A semana cujos 7 dias ainda não passaram para todas as contas aparece como "contando".
 */
export function CurriculosPorSemana({ semanas }: { semanas: SemanaDoCurriculo[] }) {
  const fechadas = semanas.filter((s) => s.fechada && s.pessoas > 0);
  const ultima = fechadas[0];
  const antes = fechadas[1];
  return (
    <Secao
      titulo="Currículo das pessoas novas"
      descricao="De cada semana de contas novas de quem procura trabalho (sem a equipe), quantas fizeram o currículo em até 7 dias. O pedido do currículo depois da curtida e o lembrete começaram em 12/11/2026."
    >
      <div className="grid gap-6 md:grid-cols-2">
        {ultima ? (
          <Indicador
            rotulo="Fizeram o currículo em 7 dias"
            valor={pct(ultima.em_7_dias, ultima.pessoas)}
            detalhe={antes ? `Na semana antes: ${pct(antes.em_7_dias, antes.pessoas)}` : undefined}
            nota={`Contas de ${diaMes(ultima.semana)} a ${diaMes(fimDaSemana(ultima.semana))}: ${formatarNumero(ultima.pessoas)}`}
          />
        ) : (
          <p className="text-body-sm text-ink-muted">Ainda sem uma semana inteira de contas para contar.</p>
        )}
      </div>
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="min-w-max text-body-sm">
          <caption className="sr-only">
            Currículo das contas novas de quem procura trabalho, por semana de cadastro
          </caption>
          <thead>
            <tr className="text-ink-muted">
              <th scope="col" className="py-1 pr-4 text-left font-normal">
                Cadastro
              </th>
              <th scope="col" className="py-1 pr-4 text-right font-normal">
                Contas
              </th>
              <th scope="col" className="py-1 pr-4 text-right font-normal">
                Currículo em 7 dias
              </th>
              <th scope="col" className="py-1 pr-4 text-right font-normal">
                Com currículo hoje
              </th>
              <th scope="col" className="py-1 text-right font-normal">
                Receberam o lembrete
              </th>
            </tr>
          </thead>
          <tbody>
            {semanas.map((s) => (
              <tr key={s.semana} className={`border-t border-line ${s.pessoas === 0 ? "text-ink-muted" : ""}`}>
                <th scope="row" className="py-1.5 pr-4 text-left font-normal whitespace-nowrap">
                  {diaMes(s.semana)} a {diaMes(fimDaSemana(s.semana))}
                  {!s.fechada && <span className="text-ink-muted"> · contando</span>}
                </th>
                <td className="py-1.5 pr-4 text-right tabular-nums">{formatarNumero(s.pessoas)}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums">
                  {s.pessoas > 0 ? (
                    <>
                      <strong className="font-semibold">{pct(s.em_7_dias, s.pessoas)}</strong>{" "}
                      <span className="text-ink-muted">({formatarNumero(s.em_7_dias)})</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums">
                  {s.pessoas > 0 ? `${pct(s.com_curriculo, s.pessoas)} (${formatarNumero(s.com_curriculo)})` : "—"}
                </td>
                <td className="py-1.5 text-right tabular-nums">{formatarNumero(s.lembradas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Secao>
  );
}
