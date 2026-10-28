import type { PresencaSite } from "@/lib/admin/dados";
import { formatarNumero } from "@/lib/formato";

// Admin › Painel (e /equipe): quem está on-line agora e quantas contas voltaram. "On-line" é quem abriu ou
// trocou de página nos últimos 5 minutos; "voltaram" só existe para quem tem conta (sem conta, o site não
// guarda quem visitou de um dia para o outro).

function Cartao({ rotulo, valor, children }: { rotulo: string; valor: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-body-sm text-ink-muted">{rotulo}</dt>
      <dd className="font-display text-h3 tabular-nums">{valor}</dd>
      {children && <dd className="text-caption text-ink-muted">{children}</dd>}
    </div>
  );
}

export function PresencaDoSite({ presenca }: { presenca: PresencaSite }) {
  const p = presenca;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "");
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
        <Cartao rotulo="On-line agora" valor={formatarNumero(p.online)}>
          <span className="inline-flex items-center gap-1.5">
            {p.online > 0 && <span aria-hidden className="size-2 rounded-pill bg-cerrado" />}
            {formatarNumero(p.online_com_conta)} com conta · últimos 5 min
          </span>
        </Cartao>
        <Cartao rotulo="Contas que entraram hoje" valor={formatarNumero(p.contas_hoje)}>
          {p.contas_hoje
            ? `${formatarNumero(p.contas_hoje - p.voltaram_hoje)} ${p.contas_hoje - p.voltaram_hoje === 1 ? "nova" : "novas"} hoje`
            : "ninguém com conta ainda"}
        </Cartao>
        <Cartao rotulo="Voltaram hoje" valor={formatarNumero(p.voltaram_hoje)}>
          {p.contas_hoje ? `${pct(p.voltaram_hoje, p.contas_hoje)} das contas de hoje` : "contas criadas antes de hoje"}
        </Cartao>
        <Cartao rotulo="Voltaram em 7 dias" valor={formatarNumero(p.voltaram_7d)}>
          {p.contas_7d
            ? `entraram em 2 dias ou mais: ${pct(p.voltaram_7d, p.contas_7d)} das contas da semana (${formatarNumero(p.contas_7d)})`
            : "contas que entraram em 2 dias ou mais"}
        </Cartao>
      </dl>
      {p.desde && (
        <p className="text-caption text-ink-muted">
          As contas que voltaram contam desde {p.desde.split("-").reverse().join("/")}: nos primeiros dias, o número de
          7 dias ainda está enchendo.
        </p>
      )}
    </div>
  );
}
