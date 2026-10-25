import type { AcessosSite } from "@/lib/admin/dados";
import { formatarNumero } from "@/lib/formato";

// Admin › Início › Quem abriu o site: os números do dia comparados do jeito certo (hoje até agora
// com ontem até a mesma hora; a média só com os dias inteiros) e as barras dos dias contados.

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function diaDaSemana(iso: string) {
  return SEMANA[new Date(`${iso}T12:00:00Z`).getUTCDay()];
}

function diaMes(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** +12% / −8% / igual, comparando a com b */
function variacao(a: number, b: number) {
  if (!b) return null;
  const p = Math.round(((a - b) / b) * 100);
  if (p === 0) return { texto: "igual", sobe: null };
  return { texto: `${p > 0 ? "+" : "−"}${Math.abs(p)}%`, sobe: p > 0 };
}

/** "antes (+12%)" ou "+12% depois", com a cor de subiu ou caiu */
function Variacao({ a, b, antes, depois }: { a: number; b: number; antes?: string; depois?: string }) {
  const v = variacao(a, b);
  if (!v) return antes ? <span>{antes}</span> : null;
  const numero = (
    <strong className={v.sobe === null ? "" : v.sobe ? "text-cerrado-text" : "text-danger"}>{v.texto}</strong>
  );
  return antes ? (
    <span>
      {antes} ({numero})
    </span>
  ) : (
    <span>
      {numero} {depois}
    </span>
  );
}

function Cartao({ rotulo, valor, children }: { rotulo: string; valor: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-body-sm text-ink-muted">{rotulo}</dt>
      <dd className="font-display text-h3">{valor}</dd>
      {children && <dd className="text-caption text-ink-muted">{children}</dd>}
    </div>
  );
}

/** A média dos dias inteiros (sem hoje e sem o primeiro dia, que começou no meio), quando o banco é antigo. */
function mediaDosDiasInteiros(acessos: AcessosSite, hoje: string) {
  const dias = acessos.por_dia.filter((d) => d.dia < hoje && (!acessos.desde || d.dia > acessos.desde)).slice(-7);
  if (!dias.length) return { media: 0, dias: 0 };
  return { media: Math.round(dias.reduce((s, d) => s + d.visitantes, 0) / dias.length), dias: dias.length };
}

export function AcessosDoSite({ acessos }: { acessos: AcessosSite | null }) {
  if (!acessos) {
    return (
      <p className="text-body-sm text-ink-muted">
        A contagem começa depois de rodar a migração <code>20261019250000_acessos_site.sql</code> no Supabase.
      </p>
    );
  }
  // só os dias desde o começo da contagem (antes dela, as barras vazias não dizem nada)
  const dias = acessos.por_dia.filter((d) => !acessos.desde || d.dia >= acessos.desde);
  const hoje = dias.at(-1)?.dia ?? "";
  const novo = acessos.dias_na_media !== undefined;
  const { media, dias: diasNaMedia } = novo
    ? { media: acessos.media_7d, dias: acessos.dias_na_media ?? 0 }
    : mediaDosDiasInteiros(acessos, hoje);
  const hora = acessos.hora;
  const temComConta = dias.some((d) => d.com_conta !== undefined);
  const maior = Math.max(...dias.map((d) => d.visitantes), 1);
  const comRotulos = dias.length <= 16;
  const pctConta = acessos.hoje ? Math.round((acessos.com_conta_hoje / acessos.hoje) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
        <Cartao
          rotulo={hora !== undefined ? `Hoje, até as ${hora}h` : "Hoje, até agora"}
          valor={formatarNumero(acessos.hoje)}
        >
          {acessos.ontem_ate_agora != null ? (
            <Variacao
              a={acessos.hoje}
              b={acessos.ontem_ate_agora}
              antes={`ontem até as ${hora}h: ${formatarNumero(acessos.ontem_ate_agora)}`}
            />
          ) : (
            "o dia ainda não fechou"
          )}
        </Cartao>
        <Cartao rotulo="Com conta hoje" valor={formatarNumero(acessos.com_conta_hoje)}>
          {acessos.hoje ? `${pctConta}% de quem abriu entrou na conta` : "entraram na conta"}
        </Cartao>
        <Cartao rotulo="Ontem" valor={formatarNumero(acessos.ontem)}>
          {media > 0 && diasNaMedia > 1 ? (
            <Variacao a={acessos.ontem} b={media} depois="sobre a média" />
          ) : (
            "dia inteiro"
          )}
        </Cartao>
        <Cartao rotulo="Média por dia" valor={formatarNumero(media)}>
          {diasNaMedia
            ? `${diasNaMedia === 1 ? "1 dia inteiro" : `${diasNaMedia} dias inteiros`}, sem hoje`
            : "ainda sem um dia inteiro"}
        </Cartao>
        {acessos.paginas_por_visitante != null && (
          <Cartao
            rotulo="Páginas por pessoa"
            valor={acessos.paginas_por_visitante.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
          >
            {acessos.so_uma_pagina != null && `${acessos.so_uma_pagina}% viram só uma página`}
          </Cartao>
        )}
      </dl>

      <figure className="flex flex-col gap-3">
        <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="text-label">Pessoas por dia</span>
          {temComConta && (
            <span className="flex items-center gap-3 text-caption text-ink-muted">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-[2px] bg-ink" />
                com conta
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-[2px] bg-line-strong" />
                sem conta
              </span>
            </span>
          )}
        </figcaption>
        <ol
          className="grid items-end gap-1 sm:gap-2"
          style={{ gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))` }}
        >
          {dias.map((d) => {
            const ehHoje = d.dia === hoje;
            const conta = d.com_conta ?? 0;
            const altura = (d.visitantes / maior) * 100;
            const parteConta = d.visitantes ? (conta / d.visitantes) * 100 : 0;
            const titulo = `${diaDaSemana(d.dia)} ${diaMes(d.dia)}: ${formatarNumero(d.visitantes)}${
              temComConta ? ` (${formatarNumero(conta)} com conta)` : ""
            }${ehHoje ? ", até agora" : ""}`;
            return (
              <li key={d.dia} className="flex min-w-0 flex-col items-center gap-1" title={titulo}>
                <span className="sr-only">{titulo}</span>
                {comRotulos && (
                  <span aria-hidden className={`text-caption tabular-nums ${ehHoje ? "text-ink-muted" : "text-ink"}`}>
                    {formatarNumero(d.visitantes)}
                  </span>
                )}
                <span aria-hidden className="flex h-28 w-full max-w-14 items-end">
                  <span
                    className={`flex w-full flex-col-reverse overflow-hidden rounded-t-[3px] ${
                      ehHoje ? "border border-dashed border-ink-muted bg-surface-300" : "bg-line-strong"
                    }`}
                    style={{ height: `${Math.max(altura, d.visitantes ? 2 : 0.5)}%` }}
                  >
                    {temComConta && (
                      <span className={ehHoje ? "bg-ink-muted" : "bg-ink"} style={{ height: `${parteConta}%` }} />
                    )}
                  </span>
                </span>
                {comRotulos ? (
                  <span aria-hidden className="flex flex-col items-center text-caption leading-tight text-ink-muted">
                    <span>{ehHoje ? "hoje" : diaDaSemana(d.dia)}</span>
                    <span>{diaMes(d.dia)}</span>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
        {!comRotulos && (
          <div aria-hidden className="flex justify-between text-caption text-ink-muted">
            <span>{dias[0] ? diaMes(dias[0].dia) : ""}</span>
            <span>hoje</span>
          </div>
        )}
      </figure>

      <p className="text-caption text-ink-muted">
        {acessos.desde &&
          `Contando desde ${acessos.desde.split("-").reverse().join("/")}; o primeiro dia começou no meio e fica fora da média. `}
        Robôs ficam de fora. A mesma pessoa em dois dias conta duas vezes: o site não guarda quem visitou.
      </p>
    </div>
  );
}
