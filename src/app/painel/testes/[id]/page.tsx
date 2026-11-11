import { Check } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CabecalhoDaPagina } from "@/components/painel/cabecalho-da-pagina";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { OfertaRecurso } from "@/components/recurso-pago";
import { SoComSupabase } from "@/components/so-com-supabase";
import { EditorDeTeste } from "@/components/testes/editor-teste";
import { vagaDaVolta, VoltarParaOsTestes, VoltarParaVaga } from "@/components/testes/voltar-para-vaga";
import { MODO_DEMO } from "@/lib/config";
import { recursosPagos } from "@/lib/dados";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { COMPETENCIAS, questoesDoBanco } from "@/lib/testes";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Teste" };

export default function Teste({ params, searchParams }: PageProps<"/painel/testes/[id]">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/** O teste da Publike (para conhecer, com as respostas) ou o da casa (para editar). */
async function Conteudo({
  params,
  searchParams,
}: {
  params: PageProps<"/painel/testes/[id]">["params"];
  searchParams: PageProps<"/painel/testes/[id]">["searchParams"];
}) {
  if (MODO_DEMO) return <SoComSupabase />;
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const usuario = await exigirUsuario(`/painel/testes/${id}`);
  const [vaga, recursos] = await Promise.all([vagaDaVolta(sp.vaga, usuario.id), recursosPagos()]);
  // recurso pago (migração 20261215120000): sem ele, a oferta no lugar do teste
  const voltar = vaga
    ? { href: `/painel/anuncio/${vaga.id}/testes`, nome: `Testes da vaga: ${vaga.titulo}` }
    : { href: "/painel/testes", nome: "Teste Prático" };
  if (recursos && !recursos.testes.liberado)
    return (
      <div className="flex flex-col gap-6">
        <CabecalhoDaPagina voltar={voltar} titulo="Teste Prático" />
        <OfertaRecurso recurso="testes" estado={recursos.testes} />
      </div>
    );
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("avaliacao_modelo", { p_modelo: id });
  if (error || !data) notFound();
  const m = data as { titulo: string; descricao: string | null; tipo: string; da_casa: boolean; questoes: unknown };
  const questoes = questoesDoBanco(m.questoes);
  return (
    <div className="flex flex-col gap-6">
      {m.da_casa ? (
        <>
          <CabecalhoDaPagina voltar={voltar} titulo="Editar teste" />
          <div className="max-w-3xl">
            <EditorDeTeste
              id={id}
              inicial={{ titulo: m.titulo, descricao: m.descricao, questoes }}
              vaga={vaga?.id ?? null}
            />
          </div>
        </>
      ) : (
        <>
          <CabecalhoDaPagina
            voltar={voltar}
            titulo={m.titulo}
            descricao={
              <>
                {m.descricao && <p>{m.descricao}</p>}
                <p className="mt-1 text-body-sm">
                  Assim o candidato vê, com a ordem das questões e das respostas sorteada. O ✓ marca a melhor
                  resposta; ele não aparece para o candidato.
                </p>
              </>
            }
          />
          <ol className="flex max-w-3xl flex-col gap-3">
            {questoes.map((q, i) => {
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
                          {m.tipo === "situacoes" && <span className="text-ink-muted"> · {o.pontos}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
          {/* depois da última questão, a volta também, sem rolar até o alto */}
          <Voltar vaga={vaga} />
        </>
      )}
    </div>
  );
}

/** A volta para os testes e, quando a pessoa veio de uma vaga, para a vaga. */
function Voltar({ vaga }: { vaga: { id: string; titulo: string } | null }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <VoltarParaOsTestes vaga={vaga} />
      {vaga && <VoltarParaVaga vaga={vaga} />}
    </div>
  );
}
