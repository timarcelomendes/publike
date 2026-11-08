import { CalendarClock, ClipboardList, ExternalLink, Users } from "lucide-react";
import type { ReactNode } from "react";
import {
  dataCurta,
  NOME_SITUACAO,
  textoDoPrazo,
  type Pedido,
  type Prazo,
  type SituacaoPedido,
} from "@/lib/pedidos-do-cliente";
import { plural } from "@/lib/formato";

// Um pedido de vaga do cliente da agência: o que foi pedido, a situação, o prazo e o andamento da vaga. O mesmo
// cartão no link do cliente e no painel da agência (`acoes` traz os botões de cada lado).

const COR_SITUACAO: Record<SituacaoPedido, string> = {
  recebido: "bg-terra-soft text-terra-text",
  em_selecao: "bg-surface-300 text-ink",
  finalistas: "bg-cerrado/15 text-cerrado-text",
  concluido: "bg-cerrado/15 text-cerrado-text",
  cancelado: "bg-surface-300 text-ink-muted",
  recusado: "bg-surface-300 text-ink-muted",
};

const COR_PRAZO: Record<Prazo["tom"], string> = {
  bom: "text-cerrado-text",
  perto: "text-terra-text",
  atrasado: "text-danger",
  neutro: "text-ink-muted",
};

export function SeloSituacao({ situacao }: { situacao: SituacaoPedido }) {
  return (
    <span className={`inline-flex items-center rounded-pill px-2.5 py-1 text-body-sm font-semibold ${COR_SITUACAO[situacao]}`}>
      {NOME_SITUACAO[situacao]}
    </span>
  );
}

export function CartaoPedido({
  p,
  hoje,
  site,
  lado,
  acoes,
  destaque = false,
}: {
  p: Pedido;
  hoje: string;
  site: string;
  /** cliente: o link do cliente; agencia: o painel (com o nome do cliente e o link da vaga no painel) */
  lado: "cliente" | "agencia";
  acoes?: ReactNode;
  destaque?: boolean;
}) {
  const prazo = textoDoPrazo(p, hoje);
  const detalhes = [
    p.salario && ["Salário", p.salario],
    p.horario && ["Horário", p.horario],
    p.local && ["Local", p.local],
    p.para_quando && ["Para quando", dataCurta(p.para_quando, hoje)],
    p.requisitos && ["Requisitos", p.requisitos],
    p.observacoes && ["Observações", p.observacoes],
  ].filter(Boolean) as [string, string][];
  const v = p.vaga;
  return (
    <article
      id={`pedido-${p.id}`}
      className={`flex scroll-mt-28 flex-col gap-3 rounded-lg border bg-surface-200 p-4 shadow-card sm:p-5 ${
        destaque ? "border-terra" : "border-line"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          {lado === "agencia" && p.cliente && <p className="text-body-sm text-ink-muted">{p.cliente}</p>}
          <h3 className="text-h3 break-words">
            {p.cargo}
            {p.quantidade > 1 && <span className="text-ink-muted"> · {plural(p.quantidade, "pessoa", "pessoas")}</span>}
          </h3>
          <p className="text-body-sm text-ink-muted">
            Pedido em {dataCurta(p.criado_em.slice(0, 10), hoje)}
            {p.quem_pediu && ` por ${p.quem_pediu}`}
          </p>
        </div>
        <SeloSituacao situacao={p.situacao} />
      </div>

      {(prazo || p.finalistas_ate) && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm">
          <CalendarClock aria-hidden className="size-4 shrink-0 text-ink-muted" />
          {p.finalistas_ate && <span>Finalistas até {dataCurta(p.finalistas_ate, hoje)}</span>}
          {prazo && <span className={`font-semibold ${COR_PRAZO[prazo.tom]}`}>{prazo.texto}</span>}
        </p>
      )}

      {p.situacao === "recusado" && p.motivo && (
        <p className="rounded-md bg-surface-300 px-3 py-2 text-body-sm">
          <span className="text-label">Motivo:</span> {p.motivo}
        </p>
      )}
      {p.situacao === "cancelado" && p.motivo && (
        <p className="rounded-md bg-surface-300 px-3 py-2 text-body-sm">
          <span className="text-label">Por quê:</span> {p.motivo}
        </p>
      )}

      {v && (
        <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-100 p-3">
          <p className="flex flex-wrap items-center gap-2 text-body-sm">
            <ClipboardList aria-hidden className="size-4 shrink-0 text-ink-muted" />
            <span className="text-label">Vaga:</span>
            {lado === "agencia" ? (
              <a href={`/painel/anuncio/${v.id}/quadro`} className="underline underline-offset-2">
                {v.titulo}
              </a>
            ) : (
              <a href={`/anuncio/${v.id}`} className="underline underline-offset-2">
                {v.titulo}
              </a>
            )}
            <span className="text-ink-muted">{v.no_ar ? "(no ar)" : "(fora do ar)"}</span>
          </p>
          <ul aria-label="Andamento" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Candidatos", v.candidatos],
              ["Finalistas", v.finalistas],
              ["Entrevistas", v.entrevistas],
              ["Contratados", v.contratados],
            ].map(([nome, n]) => (
              <li key={nome} className="rounded-md bg-surface-200 px-3 py-2">
                <span className="font-display text-h3 leading-none tabular-nums">{n}</span>
                <span className="mt-1 block text-body-sm text-ink-muted">{nome}</span>
              </li>
            ))}
          </ul>
          {v.link_finalistas && (
            <a
              href={`${site.replace(/\/+$/, "")}/finalistas/${v.link_finalistas}`}
              className="inline-flex min-h-10 items-center gap-2 self-start text-label underline underline-offset-2"
            >
              <Users aria-hidden className="size-4" />
              {lado === "cliente" ? "Ver os finalistas e responder" : "A lista dos finalistas (como o cliente vê)"}
              <ExternalLink aria-hidden className="size-3.5" />
            </a>
          )}
        </div>
      )}

      {detalhes.length > 0 && (
        <details className="group">
          <summary className="flex min-h-10 cursor-pointer list-none items-center text-label text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
            O que foi pedido
          </summary>
          <dl className="mt-1 grid gap-x-4 gap-y-2 text-body-sm sm:grid-cols-[auto_1fr]">
            {detalhes.map(([k, valor]) => (
              <div key={k} className="contents">
                <dt className="text-ink-muted">{k}</dt>
                <dd className="break-words whitespace-pre-line">{valor}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      {acoes}
    </article>
  );
}
