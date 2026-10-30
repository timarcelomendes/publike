import { ClipboardCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { CabecalhoDaVaga } from "@/components/painel/cabecalho-da-vaga";
import { FaixaExperimento, OfertaRecurso } from "@/components/recurso-pago";
import { SeloCortesia } from "@/components/selo-cortesia";
import { SoComSupabase } from "@/components/so-com-supabase";
import { PedirTeste } from "@/components/testes/pedir-teste";
import { TestesDaVaga } from "@/components/testes/testes-da-vaga";
import { Aviso, Avatar, Selo } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { listarInteressados, obterAnuncio, recursosPagos } from "@/lib/dados";
import { tempoRelativo } from "@/lib/formato";
import { bibliotecaDeTestes, resultadosDosTestes, testesDaVaga } from "@/lib/servidor/testes";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import { competenciasDoResultado, faixaDoResultado, NAO_E_PSICOLOGICO, textoDoResultado } from "@/lib/testes";
import { marcaDoRecurso } from "@/lib/recursos-pagos";

export const metadata: Metadata = { title: "Testes da vaga" };

export default function TestesDaVagaPagina({ params, searchParams }: PageProps<"/painel/anuncio/[id]/testes">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({
  params,
  searchParams,
}: {
  params: PageProps<"/painel/anuncio/[id]/testes">["params"];
  searchParams: PageProps<"/painel/anuncio/[id]/testes">["searchParams"];
}) {
  if (MODO_DEMO) return <SoComSupabase />;
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const usuario = await exigirUsuario(`/painel/anuncio/${id}/testes`);
  const anuncio = await obterAnuncio(id);
  if (!anuncio || anuncio.autor_id !== usuario.id || anuncio.tipo !== "vaga") notFound();
  const [biblioteca, naVaga, resultados, interessados, agora, recursos] = await Promise.all([
    bibliotecaDeTestes(),
    testesDaVaga(id),
    resultadosDosTestes(id),
    listarInteressados(id).catch(() => []),
    agoraDaRequisicao(),
    recursosPagos(),
  ]);
  // recurso pago (migração 20261215120000): sem ele, a oferta no lugar da escolha; os resultados continuam
  const fechado = recursos !== null && !recursos.testes.liberado;
  const cabecalho = <CabecalhoDaVaga anuncio={anuncio} aba="testes" />;
  if (biblioteca === null) {
    return (
      <div className="flex flex-col gap-4">
        {cabecalho}
        <Aviso tipo="alerta" titulo="Os testes ainda não estão disponíveis">
          Tente de novo em instantes.
        </Aviso>
      </div>
    );
  }
  const obrigatorios = naVaga.filter((t) => t.obrigatoria);
  const candidatos = interessados.filter((p) => p.status !== "dispensada");

  return (
    <div className="flex flex-col gap-6">
      {cabecalho}
      <FaixaExperimento recurso="testes" estado={recursos?.testes} agora={agora} />
      {fechado && <OfertaRecurso recurso="testes" estado={recursos?.testes ?? null} />}
      <div className="flex flex-wrap items-center gap-2">
        <SeloCortesia texto={marcaDoRecurso(recursos?.testes, agora).longo} />
        <p className="text-body-sm text-ink-muted">
          Testes da marca Publike e os da sua empresa. Quem curtir a vaga faz pelo celular.
        </p>
      </div>

      {!fechado && (
        <section aria-labelledby="titulo-escolha" className="rounded-lg border border-line bg-surface-200 p-4 sm:p-5">
          <h3 id="titulo-escolha" className="mb-3 flex items-center gap-2 text-h3">
            <ClipboardCheck aria-hidden className="size-5 text-ink-muted" />
            Testes desta vaga
          </h3>
          <TestesDaVaga
            // de novo do zero quando a biblioteca muda (o teste que acabou de ser criado já vem escolhido)
            key={`${biblioteca.length}-${typeof sp.novo === "string" ? sp.novo : ""}`}
            anuncioId={id}
            biblioteca={biblioteca}
            iniciais={naVaga.map((t) => ({ modelo_id: t.modelo_id, obrigatoria: t.obrigatoria }))}
            novo={typeof sp.novo === "string" ? sp.novo : null}
          />
          {biblioteca.length > 0 && (
            <p className="mt-3 text-body-sm">
              <Link href={`/painel/testes?vaga=${id}`} className="font-semibold underline underline-offset-2">
                Ver a biblioteca e criar os testes da sua empresa
              </Link>
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="titulo-resultados" className="flex flex-col gap-3">
        <h3 id="titulo-resultados" className="text-h3">
          Candidatos e resultados
        </h3>
        {candidatos.length === 0 ? (
          <p className="text-body-sm text-ink-muted">Ninguém curtiu a vaga ainda.</p>
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Candidatos e testes">
            {candidatos.map((p) => {
              const deles = resultados.filter((r) => r.perfil_id === p.perfil_id);
              const faltam = obrigatorios.filter(
                (t) => !deles.some((r) => r.modelo_id === t.modelo_id && r.status === "feita"),
              );
              // os obrigatórios que ainda nem foram mandados (curtiu antes de o teste entrar na vaga)
              const naoRecebeu = faltam.filter((t) => !deles.some((r) => r.modelo_id === t.modelo_id));
              const fez = deles.filter((r) => r.status === "feita").length;
              // no "Mandar teste", os obrigatórios que faltam vêm primeiro (já escolhidos)
              const paraMandar = biblioteca
                .filter((m) => !deles.some((r) => r.modelo_id === m.id))
                .sort(
                  (a, b) =>
                    Number(naoRecebeu.some((t) => t.modelo_id === b.id)) -
                    Number(naoRecebeu.some((t) => t.modelo_id === a.id)),
                )
                .map((m) => ({ id: m.id, titulo: m.titulo }));
              return (
                <li key={p.perfil_id} className="rounded-lg border border-line bg-surface-200 p-4 shadow-card">
                  <div className="flex items-center gap-3">
                    <Avatar nome={p.nome} foto={p.foto} tamanho={40} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/painel/anuncio/${id}/quadro?candidato=${p.perfil_id}`}
                          className="text-label hover:underline"
                        >
                          {p.nome}
                        </Link>
                        {faltam.length > 0 ? (
                          <Selo variante="contorno">
                            {faltam.length === 1 ? "Falta 1 obrigatório" : `Faltam ${faltam.length} obrigatórios`}
                          </Selo>
                        ) : (
                          fez > 0 && <Selo variante="match">{fez === 1 ? "Fez o teste" : "Fez os testes"}</Selo>
                        )}
                      </p>
                      <p className="text-body-sm text-ink-muted">curtiu {tempoRelativo(p.curtido_em, agora)}</p>
                    </div>
                  </div>
                  {deles.length + naoRecebeu.length > 0 && (
                    <ul className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
                      {deles.map((r) => (
                        <li key={r.id} className="flex flex-col gap-1">
                          <p className="flex flex-wrap items-center justify-between gap-2 text-body-sm">
                            <span className="font-semibold">{r.titulo}</span>
                            {r.status === "feita" ? (
                              <Link href={`/painel/anuncio/${id}/testes/${r.id}`} className="text-label underline">
                                {textoDoResultado(r.tipo, r.pontos, r.maximo)} · ver respostas
                              </Link>
                            ) : (
                              <span className="text-ink-muted">{r.vencida ? "o prazo acabou" : "ainda não fez"}</span>
                            )}
                          </p>
                          {r.status === "feita" && competenciasDoResultado(r.por_competencia).length > 0 && (
                            <p className="text-body-sm text-ink-muted">
                              {competenciasDoResultado(r.por_competencia)
                                .map((c) => `${c.nome}: ${faixaDoResultado(c.pontos, c.maximo)}`)
                                .join(" · ")}
                            </p>
                          )}
                        </li>
                      ))}
                      {naoRecebeu.map((t) => (
                        <li key={t.modelo_id}>
                          <p className="flex flex-wrap items-center justify-between gap-2 text-body-sm">
                            <span className="font-semibold">{t.titulo}</span>
                            <span className="text-ink-muted">obrigatório · ainda não recebeu</span>
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                  {paraMandar.length > 0 && (
                    <div className="mt-3">
                      <PedirTeste anuncioId={id} perfilId={p.perfil_id} nome={p.nome} opcoes={paraMandar} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-body-sm text-ink-muted">{NAO_E_PSICOLOGICO}</p>
      </section>
    </div>
  );
}
