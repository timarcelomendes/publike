import { Gauge } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Filtros, linkCom, Secao } from "@/components/admin/ui";
import { Aviso, Vazio } from "@/components/ui/basicos";
import { formatarNumero, primeiro } from "@/lib/formato";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import { criarClienteAdmin, ehAdminLocal } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { formatarMedida, LIMITES, METRICAS, NOMES, notaDe, type Metrica, type Nota } from "@/lib/velocidade";

export const metadata: Metadata = { title: "Velocidade" };

// A velocidade de verdade de quem abre o site (migração 20270709120000; 17/11/2026, "deixe a performance invejável"):
// o p75 de cada medida (a conta do Google: 75% das visitas estão abaixo), no celular e no computador, por página, e os
// culpados mais comuns. As medidas vêm do navegador de quem usa o site (src/lib/velocidade-cliente.ts).

const PERIODOS = [
  { valor: "7", nome: "7 dias" },
  { valor: "28", nome: "28 dias" },
];
const BASE = "/admin/velocidade";

type Resumo = { metrica: Metrica; celular: boolean; n: number; p75: number; bom: number; medio: number; ruim: number };
type DaPagina = { pagina: string; metrica: Metrica; n: number; p75: number };
type Culpado = {
  metrica: Metrica;
  alvo: string;
  pagina: string;
  n: number;
  ruins: number;
  p75: number;
  tipo: string | null;
  script: string | null;
  parte: string | null;
};
type Dados = { desde: string | null; resumo: Resumo[]; paginas: DaPagina[]; culpados: Culpado[] };

const COR: Record<Nota, string> = {
  good: "text-cerrado-text",
  "needs-improvement": "text-terra-text",
  poor: "text-danger",
};
const NOME_NOTA: Record<Nota, string> = { good: "bom", "needs-improvement": "precisa melhorar", poor: "ruim" };
const PARTE: Record<string, string> = {
  "input-delay": "antes de começar (a tela ocupada)",
  "processing-duration": "no código do toque",
  "presentation-delay": "para desenhar a resposta",
};

export default function Velocidade({ searchParams }: PageProps<"/admin/velocidade">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/admin/velocidade">["searchParams"] }) {
  const admin = await ehAdminLocal();
  if (!admin && !(await possoVerTela(BASE))) notFound();
  const c = admin ? criarClienteAdmin() : await criarClienteServidor();
  const sp = await searchParams;
  const pedido = primeiro(sp.periodo) ?? "28";
  const periodo = PERIODOS.some((p) => p.valor === pedido) ? pedido : "28";
  const { data, error } = await c.rpc("admin_velocidade", { p_dias: Number(periodo) });
  if (error) {
    return (
      <Aviso tipo="alerta" titulo="Rode a migração da velocidade">
        Falta a migração 20270709120000_velocidade_real.sql neste banco.
      </Aviso>
    );
  }
  const d = data as unknown as Dados;
  const celular = d.resumo.filter((r) => r.celular);
  const computador = d.resumo.filter((r) => !r.celular);
  const porPagina = new Map<string, Partial<Record<Metrica, DaPagina>>>();
  for (const p of d.paginas) porPagina.set(p.pagina, { ...porPagina.get(p.pagina), [p.metrica]: p });
  const paginas = [...porPagina.entries()].sort(
    (a, b) => (b[1].LCP?.n ?? b[1].FCP?.n ?? 0) - (a[1].LCP?.n ?? a[1].FCP?.n ?? 0),
  );

  return (
    <div className="flex flex-col gap-6">
      <Secao
        titulo="Velocidade de verdade"
        descricao={
          <>
            As medidas de quem abre o site, no navegador de cada um (as mesmas que o Google usa na busca). O número é o
            p75: 75% das visitas ficam abaixo dele. Verde é bom; laranja, precisa melhorar; vermelho, ruim.
          </>
        }
        acoes={
          <Filtros
            rotulo="Período"
            opcoes={PERIODOS}
            atual={periodo}
            link={(v) => linkCom(BASE, { periodo }, { periodo: v })}
          />
        }
      >
        {!d.resumo.length ? (
          <Vazio icone={Gauge} titulo="Ainda sem medidas">
            As medidas chegam quando alguém abre o site e depois sai da página. Volte em algumas horas.
          </Vazio>
        ) : (
          <div className="flex flex-col gap-5">
            <Aparelho titulo="No celular" linhas={celular} />
            <Aparelho titulo="No computador" linhas={computador} />
          </div>
        )}
      </Secao>

      {paginas.length > 0 && (
        <Secao titulo="Por página, no celular" descricao="O p75 de cada página (com 3 medidas ou mais).">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-body-sm">
              <thead className="text-ink-muted">
                <tr>
                  <th className="py-2 pr-3 font-normal">Página</th>
                  {(["LCP", "INP", "CLS", "TTFB"] as Metrica[]).map((m) => (
                    <th key={m} className="py-2 pr-3 text-right font-normal">
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {paginas.map(([pagina, m]) => (
                  <tr key={pagina}>
                    <td className="py-2 pr-3 font-mono text-caption break-all">{pagina}</td>
                    {(["LCP", "INP", "CLS", "TTFB"] as Metrica[]).map((k) => (
                      <td key={k} className="py-2 pr-3 text-right tabular-nums">
                        {m[k] ? (
                          <span className={COR[notaDe(k, m[k]!.p75)]}>
                            {formatarMedida(k, m[k]!.p75)}
                            <span className="ml-1 text-caption text-ink-muted">({formatarNumero(m[k]!.n)})</span>
                          </span>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      )}

      {(["INP", "LCP", "CLS"] as Metrica[]).map((m) => {
        const lista = d.culpados.filter((x) => x.metrica === m);
        if (!lista.length) return null;
        return (
          <Secao
            key={m}
            titulo={`Os culpados: ${NOMES[m].nome}`}
            descricao={
              m === "INP"
                ? "Os toques mais lentos: onde a pessoa tocou, o tipo, onde o tempo foi e o código que mais demorou."
                : m === "LCP"
                  ? "O maior conteúdo da tela em cada visita: é ele que precisa aparecer cedo."
                  : "O que mais pulou na tela enquanto a página carregava."
            }
          >
            <ul className="flex flex-col divide-y divide-line">
              {lista.map((x) => (
                <li key={`${x.alvo}-${x.pagina}`} className="flex flex-col gap-0.5 py-2.5">
                  <span className="font-mono text-caption break-all text-ink">{x.alvo}</span>
                  <span className="text-body-sm text-ink-muted">
                    <span className={COR[notaDe(m, x.p75)]}>p75 {formatarMedida(m, x.p75)}</span> ·{" "}
                    {formatarNumero(x.n)} {x.n === 1 ? "vez" : "vezes"} ({formatarNumero(x.ruins)} fora do bom) · {x.pagina}
                    {x.tipo ? ` · ${x.tipo === "pointer" ? "toque/clique" : x.tipo === "keyboard" ? "tecla" : x.tipo}` : ""}
                    {x.parte ? ` · tempo ${PARTE[x.parte] ?? x.parte}` : ""}
                    {x.script ? ` · ${x.script}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Secao>
        );
      })}

      {d.desde && (
        <p className="text-caption text-ink-muted">
          Medindo desde {new Date(d.desde).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Os
          limites do Google: {METRICAS.map((m) => `${m} até ${formatarMedida(m, LIMITES[m][0])}`).join(", ")}.
        </p>
      )}
    </div>
  );
}

function Aparelho({ titulo, linhas }: { titulo: string; linhas: Resumo[] }) {
  if (!linhas.length) return null;
  const por = new Map(linhas.map((l) => [l.metrica, l]));
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-label">{titulo}</h3>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {METRICAS.map((m) => {
          const l = por.get(m);
          return (
            <div key={m} className="flex flex-col gap-0.5 rounded-md border border-line bg-surface-100 p-3">
              <dt className="text-caption text-ink-muted">{NOMES[m].nome}</dt>
              <dd className={`text-h3 tabular-nums ${l ? COR[notaDe(m, l.p75)] : "text-ink-muted"}`}>
                {l ? formatarMedida(m, l.p75) : "—"}
              </dd>
              {l && (
                <dd className="text-caption text-ink-muted">
                  {NOME_NOTA[notaDe(m, l.p75)]} · {formatarNumero(l.n)} {l.n === 1 ? "visita" : "visitas"} ·{" "}
                  {Math.round((100 * l.bom) / Math.max(1, l.n))}% boas
                </dd>
              )}
            </div>
          );
        })}
      </dl>
    </div>
  );
}
