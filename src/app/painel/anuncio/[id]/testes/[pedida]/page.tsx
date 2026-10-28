import { ArrowLeft, Check, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { MODO_DEMO } from "@/lib/config";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import {
  COMPETENCIAS,
  competenciasDoResultado,
  faixaDoResultado,
  questoesDoBanco,
  textoDoResultado,
} from "@/lib/testes";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Respostas do teste" };

export default function RespostasDoTeste({ params }: PageProps<"/painel/anuncio/[id]/testes/[pedida]">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: PageProps<"/painel/anuncio/[id]/testes/[pedida]">["params"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const { id, pedida } = await params;
  if (!UUID.test(pedida)) notFound();
  await exigirUsuario(`/painel/anuncio/${id}/testes/${pedida}`);
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("avaliacao_respostas", { p_id: pedida });
  if (error || !data) notFound();
  const r = data as {
    titulo: string;
    tipo: string;
    status: string;
    pontos: number | null;
    maximo: number | null;
    por_competencia: unknown;
    questoes: unknown;
  };
  const questoes = (Array.isArray(r.questoes) ? r.questoes : []) as { escolhida: string | null }[];
  const lista = questoesDoBanco(
    (Array.isArray(r.questoes) ? r.questoes : []).map((q: Record<string, unknown>, i: number) => ({
      ...q,
      id: `q${i}`,
    })),
  );
  return (
    <div className="flex flex-col gap-5">
      <Link
        href={`/painel/anuncio/${id}/testes`}
        className="inline-flex min-h-11 items-center gap-1.5 self-start text-label text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Testes da vaga
      </Link>
      <div>
        <h2 className="text-h2">{r.titulo}</h2>
        <p className="mt-1 text-body text-ink-muted">
          {r.status === "feita" ? textoDoResultado(r.tipo, r.pontos, r.maximo) : "Ainda não foi feito."}
        </p>
      </div>
      {competenciasDoResultado(r.por_competencia).length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {competenciasDoResultado(r.por_competencia).map((c) => (
            <li key={c.id} className="flex justify-between gap-3 rounded-md bg-surface-300 px-4 py-2.5 text-body-sm">
              <span className="font-semibold">{c.nome}</span>
              <span>
                {c.pontos} de {c.maximo} · {faixaDoResultado(c.pontos, c.maximo)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <ol className="flex flex-col gap-3">
        {lista.map((q, i) => {
          const escolhida = questoes[i]?.escolhida;
          const melhor = Math.max(...q.opcoes.map((o) => o.pontos));
          return (
            <li key={q.id} className="rounded-lg border border-line bg-surface-200 p-4">
              <p className="text-label">
                {i + 1}. {q.enunciado}
              </p>
              {q.competencia && (
                <p className="text-body-sm text-ink-muted">{COMPETENCIAS[q.competencia] ?? q.competencia}</p>
              )}
              <ul className="mt-2 flex flex-col gap-1 text-body-sm">
                {q.opcoes.map((o) => {
                  const marcada = o.id === escolhida;
                  const certa = o.pontos === melhor;
                  return (
                    <li key={o.id} className={`flex gap-2 ${marcada ? "font-semibold" : "text-ink-muted"}`}>
                      {certa ? (
                        <Check aria-label="melhor resposta" className="mt-0.5 size-4 shrink-0 text-cerrado-text" />
                      ) : marcada ? (
                        <X aria-label="resposta escolhida" className="mt-0.5 size-4 shrink-0" />
                      ) : (
                        <span className="w-4 shrink-0" />
                      )}
                      <span>
                        {o.texto}
                        {marcada && " (escolhida)"}
                        {r.tipo === "situacoes" && ` · ${o.pontos} ${o.pontos === 1 ? "ponto" : "pontos"}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
