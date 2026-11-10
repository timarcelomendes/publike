import { Avatar } from "@/components/ui/basicos";
import { SeloVerificado } from "@/components/selo-verificado";
import { STATUS_ANUNCIO } from "@/lib/constantes";
import { formatarNumero, urlDaFoto } from "@/lib/formato";
import { corLegivel, corValida } from "@/lib/marca";
import type { Relatorio } from "@/lib/relatorio-cliente";
import type { StatusAnuncio } from "@/lib/tipos";

const dataCurta = (iso: string) =>
  iso
    ? new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" })
        .format(new Date(`${iso.slice(0, 10)}T12:00:00-03:00`))
        .replace(" de ", " ")
        .replace(".", "")
    : "";

const dias = (n: number | null) =>
  n == null ? "—" : n < 1 ? "menos de 1 dia" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${n === 1 ? "dia" : "dias"}`;

/**
 * O relatório por cliente (migração 20270409120000), igual no painel da agência e no link do cliente: a marca da
 * agência, o funil do período (candidatos → triagem → entrevista → finalistas → contratados), o tempo até os
 * primeiros finalistas e a tabela por vaga. Só números. Imprime limpo (o topo e o rodapé do site somem).
 */
export function RelatorioDoCliente({ r }: { r: Relatorio }) {
  const cor = corValida(r.marca?.cor) ? r.marca.cor : null;
  const foto = r.marca?.foto ? urlDaFoto(r.marca.foto) : null;
  const destaque = cor ? corLegivel(cor) : undefined;
  const t = r.totais;
  const etapas = [
    { nome: "Candidatos", n: t.candidatos, ajuda: "pessoas que se candidataram" },
    { nome: "Atendem o obrigatório", n: t.triagem, ajuda: "pela Triagem com IA" },
    { nome: "Em entrevista", n: t.entrevista, ajuda: "agora na etapa de entrevista" },
    { nome: "Finalistas", n: t.finalistas, ajuda: "apresentados a você" },
    { nome: "Contratados", n: t.contratados, ajuda: "" },
  ];
  const maior = Math.max(1, ...etapas.map((e) => e.n));

  return (
    <article className="flex flex-col gap-6">
      <header
        className="flex flex-col gap-4 overflow-hidden rounded-lg border border-line bg-surface-200 p-5 sm:p-6"
        style={cor && !foto ? { borderTop: `6px solid ${cor}` } : undefined}
      >
        {foto && (
          // a foto é da Página de carreiras da agência (Storage público), sem o otimizador de imagens
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={foto}
            alt=""
            className="-mx-5 -mt-5 aspect-[4/1] w-[calc(100%+2.5rem)] max-w-none object-cover sm:-mx-6 sm:-mt-6 sm:w-[calc(100%+3rem)]"
            style={cor ? { borderBottom: `4px solid ${cor}` } : undefined}
          />
        )}
        <div className="flex items-center gap-3">
          <Avatar nome={r.agencia.nome} foto={r.agencia.foto} tamanho={48} />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-label">
              {r.agencia.nome}
              {r.agencia.verificado && <SeloVerificado agencia />}
            </p>
            <p className="text-body-sm text-ink-muted">Relatório de seleção</p>
          </div>
        </div>
        <div>
          <h1 className="text-h1 break-words" style={destaque ? { color: destaque } : undefined}>
            {r.cliente}
          </h1>
          <p className="mt-1 text-body-sm text-ink-muted">
            Vagas publicadas de {dataCurta(r.de)} a {dataCurta(r.ate)}
          </p>
        </div>
      </header>

      {t.vagas === 0 ? (
        <p className="rounded-lg border border-line bg-surface-200 p-5 text-body">
          Nenhuma vaga publicada para {r.cliente} neste período.
        </p>
      ) : (
        <>
          <section aria-labelledby="funil" className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="funil" className="text-h3">
                {t.vagas === 1 ? "1 vaga" : `${formatarNumero(t.vagas)} vagas`}, do candidato ao contratado
              </h2>
              <p className="text-body-sm text-ink-muted">
                Primeiros finalistas em <strong className="text-ink">{dias(t.dias_finalistas)}</strong>
                {t.dias_finalistas != null ? " (mediana)" : ""}
              </p>
            </div>
            <ol className="flex flex-col gap-3">
              {etapas.map((e, i) => (
                <li key={e.nome} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3">
                  <span className="text-body-sm">
                    <span className="text-label">{e.nome}</span>
                    {e.ajuda && <span className="block text-caption text-ink-muted">{e.ajuda}</span>}
                  </span>
                  <span className="h-3 overflow-hidden rounded-pill bg-surface-300" aria-hidden>
                    <span
                      className="block h-full rounded-pill"
                      style={{
                        width: `${Math.max(e.n ? 2 : 0, Math.round((e.n / maior) * 100))}%`,
                        background: cor ?? "var(--pk-cerrado)",
                        opacity: i === etapas.length - 1 ? 1 : 0.45 + i * 0.12,
                      }}
                    />
                  </span>
                  <span className="text-h3 tabular-nums" style={i === etapas.length - 1 && destaque ? { color: destaque } : undefined}>
                    {formatarNumero(e.n)}
                  </span>
                </li>
              ))}
            </ol>
            {t.finalistas > 0 && (
              <p className="text-body-sm text-ink-muted">
                Você respondeu {formatarNumero(t.respondidos)} de {formatarNumero(t.finalistas)} finalistas.
              </p>
            )}
          </section>

          <section aria-labelledby="por-vaga" className="flex flex-col gap-3">
            <h2 id="por-vaga" className="text-h3">
              Por vaga
            </h2>
            <div className="overflow-x-auto rounded-lg border border-line bg-surface-200">
              <table className="w-full min-w-[40rem] text-body-sm">
                <thead className="text-left text-ink-muted">
                  <tr className="border-b border-line">
                    <th scope="col" className="p-3 font-semibold">Vaga</th>
                    <th scope="col" className="p-3 text-right font-semibold">Candidatos</th>
                    <th scope="col" className="p-3 text-right font-semibold">Finalistas</th>
                    <th scope="col" className="p-3 text-right font-semibold">Contratados</th>
                    <th scope="col" className="p-3 text-right font-semibold">Até os finalistas</th>
                  </tr>
                </thead>
                <tbody>
                  {r.vagas.map((v, i) => (
                    <tr key={`${v.titulo}-${v.criado_em}-${i}`} className="border-b border-line last:border-0">
                      <td className="p-3">
                        <span className="text-label">{v.titulo}</span>
                        <span className="block text-caption text-ink-muted">
                          {dataCurta(v.criado_em)} · {v.preenchida_em ? "Preenchida" : (STATUS_ANUNCIO[v.status as StatusAnuncio]?.nome ?? v.status)}
                        </span>
                      </td>
                      <td className="p-3 text-right tabular-nums">{formatarNumero(v.candidatos)}</td>
                      <td className="p-3 text-right tabular-nums">{formatarNumero(v.finalistas)}</td>
                      <td className="p-3 text-right tabular-nums">{formatarNumero(v.contratados)}</td>
                      <td className="p-3 text-right tabular-nums">{dias(v.dias_finalistas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      <p className="text-caption text-ink-muted">
        Números do Publike, sem dados pessoais dos candidatos. Feito por {r.agencia.nome} com o Publike.
      </p>
    </article>
  );
}
