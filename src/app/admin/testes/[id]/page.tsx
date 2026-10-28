import { ArrowLeft, Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { BotaoPublicarTeste } from "@/components/admin/testes";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { COMPETENCIAS, questoesDoBanco } from "@/lib/testes";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Revisar teste" };

export default function RevisarTeste({ params }: PageProps<"/admin/testes/[id]">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: PageProps<"/admin/testes/[id]">["params"] }) {
  const c = await exigirAdminLocal();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { data } = await c.rpc("admin_avaliacao_modelo", { p_modelo: id });
  if (!data) notFound();
  const m = data as { titulo: string; descricao: string | null; tipo: string; publicado: boolean; questoes: unknown };
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin/testes"
        className="inline-flex min-h-11 items-center gap-2 self-start text-label text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Testes
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-h2">{m.titulo}</h2>
          {m.descricao && <p className="mt-1 text-body text-ink-muted">{m.descricao}</p>}
        </div>
        <BotaoPublicarTeste modeloId={id} publicado={m.publicado} />
      </div>
      <p className="text-body-sm text-ink-muted">
        Para mudar uma questão, me diga qual e o texto novo: o conteúdo fica na migração 20261204120000_avaliacoes.sql.
      </p>
      <ol className="flex flex-col gap-3">
        {questoesDoBanco(m.questoes).map((q, i) => {
          const melhor = Math.max(...q.opcoes.map((o) => o.pontos));
          return (
            <li key={q.id} className="rounded-lg border border-line bg-surface-200 p-4">
              <p className="text-label">
                {i + 1}. {q.enunciado}
              </p>
              {q.competencia && <p className="text-body-sm text-ink-muted">{COMPETENCIAS[q.competencia]}</p>}
              <ul className="mt-2 flex flex-col gap-1 text-body-sm">
                {q.opcoes.map((o) => (
                  <li key={o.id} className="flex gap-2">
                    {o.pontos === melhor ? (
                      <Check aria-label="melhor resposta" className="mt-0.5 size-4 shrink-0 text-cerrado-text" />
                    ) : (
                      <span className="w-4 shrink-0" />
                    )}
                    <span>
                      {o.texto}
                      <span className="text-ink-muted"> · {o.pontos}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
