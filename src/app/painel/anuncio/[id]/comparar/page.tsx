import { ArrowLeft, Check, CircleHelp, Minus, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { AcoesDoComparar } from "@/components/painel/comparar-acoes";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { NotaAderencia } from "@/components/painel/nota-aderencia";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Avatar, Selo } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { atendeEmParte, maisEmParte, type Criterio } from "@/lib/aderencia";
import { MODO_DEMO } from "@/lib/config";
import { ETAPAS_CANDIDATO } from "@/lib/constantes";
import { textosDosEstudos } from "@/lib/estudos";
import { textoDoPeriodo } from "@/lib/experiencia";
import { DECISOES_CLIENTE } from "@/lib/finalistas";
import { formatarLugar } from "@/lib/formato";
import { obterAnuncio } from "@/lib/dados";
import { triagemDosCandidatos } from "@/lib/servidor/copiloto";
import { montarQuadro } from "@/lib/servidor/quadro";
import { resultadosDosTestes } from "@/lib/servidor/testes";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import { faixaDoTeste, NOME_FAIXA, nomeCurtoDoTeste } from "@/lib/testes";
import type { Curriculo } from "@/lib/tipos";

export const metadata: Metadata = { title: "Comparar candidatos" };

// Comparar de 2 a 4 candidatos da vaga lado a lado (plano do retorno, parte 4): o % de match, a Triagem com IA, o
// teste, os itens da vaga, as respostas, os últimos trabalhos e o estudo, com Entrevista e Não seguir em cada um.
// As linhas ficam alinhadas entre as colunas (subgrid); no celular, uma pessoa por vez, deslizando de lado.

const LINHAS = 9;

export default function Comparar({ params, searchParams }: PageProps<"/painel/anuncio/[id]/comparar">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      {Promise.all([params, searchParams]).then(([{ id }, sp]) => (
        <Conteudo id={id} p={typeof sp.p === "string" ? sp.p : ""} />
      ))}
    </Suspense>
  );
}

async function Conteudo({ id, p }: { id: string; p: string }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const usuario = await exigirUsuario(`/painel/anuncio/${id}/comparar${p ? `?p=${p}` : ""}`);
  const anuncio = await obterAnuncio(id);
  if (!anuncio || anuncio.autor_id !== usuario.id || anuncio.tipo !== "vaga") notFound();
  const agora = await agoraDaRequisicao();
  const [{ cartoes, curriculos }, resultados, triagem] = await Promise.all([
    montarQuadro(anuncio, agora),
    resultadosDosTestes(id),
    triagemDosCandidatos(id),
  ]);
  const pedidos = [...new Set(p.split(","))].slice(0, 4);
  const pessoas = pedidos.flatMap((pid) => cartoes.filter((c) => c.perfil_id === pid));

  const volta = (
    <Link
      href={`/painel/anuncio/${id}/quadro`}
      className="inline-flex min-h-11 items-center gap-2 text-label text-ink-muted hover:text-ink"
    >
      <ArrowLeft aria-hidden className="size-4" />
      Quadro de candidatos
    </Link>
  );

  if (pessoas.length < 2) {
    return (
      <div className="flex flex-col gap-4">
        {volta}
        <h2 className="text-h2">Comparar candidatos</h2>
        <p className="max-w-xl text-body text-ink-muted">
          No quadro, marque de 2 a 4 candidatos e toque em “Comparar”.
        </p>
        <BotaoLink href={`/painel/anuncio/${id}/quadro`} className="self-start">
          Abrir o quadro
        </BotaoLink>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        {volta}
        <h2 className="mt-1 flex flex-wrap items-center gap-2 text-h2">
          Comparar {pessoas.length} candidatos
          <Selo variante="novo">Novo</Selo>
        </h2>
        <p className="mt-1 text-body text-ink-muted">{anuncio.titulo}</p>
      </div>

      <div
        className="-mx-4 grid snap-x snap-mandatory auto-cols-[86%] grid-flow-col gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:auto-cols-[minmax(15rem,1fr)] sm:px-0"
        style={{ gridTemplateRows: `repeat(${LINHAS}, auto)` }}
      >
        {pessoas.map((c) => {
          const cv = (curriculos.get(c.perfil_id) ?? null) as Curriculo | null;
          const testes = resultados.filter((r) => r.perfil_id === c.perfil_id && r.status === "feita");
          const t = triagem?.get(c.perfil_id) ?? null;
          const decisao = c.finalista?.decisao ? DECISOES_CLIENTE[c.finalista.decisao] : null;
          const a = c.aderencia;
          const respostas = c.respostas.filter((r) => r.resposta);
          const trabalhos = (cv?.experiencias ?? []).slice(0, 2);
          const estudos = cv ? textosDosEstudos(cv).filter(Boolean) : [];
          return (
            <article
              key={c.perfil_id}
              aria-label={c.nome}
              className="grid snap-start grid-rows-subgrid gap-0 rounded-lg border border-line bg-surface-200"
              style={{ gridRow: `span ${LINHAS}` }}
            >
              <div className="flex items-start gap-3 border-b border-line p-4">
                <Avatar nome={c.nome} foto={c.foto} tamanho={48} />
                <div className="min-w-0 flex-1">
                  <p className="text-label break-words">{c.nome}</p>
                  <p className="text-body-sm text-ink-muted">{formatarLugar(c.bairro, c.cidade)}</p>
                  <p className="mt-1.5 flex flex-wrap gap-1.5">
                    <span className="text-body-sm text-ink-muted">Etapa: {ETAPAS_CANDIDATO[c.coluna].nome}</span>
                    {decisao && <Selo variante={decisao.selo}>{decisao.nome}</Selo>}
                  </p>
                </div>
              </div>

              <Celula titulo="Match com a vaga">
                <p className="flex flex-wrap items-center gap-2">
                  <NotaAderencia a={a} />
                </p>
                {a.conferidos > 0 && (
                  <p className="text-body-sm text-ink-muted">
                    Atende {a.atendidos} de {a.conferidos}
                    {maisEmParte(a.emParte)}
                  </p>
                )}
              </Celula>

              <Celula titulo="Triagem com IA">
                {t ? (
                  <p className="text-body-sm">
                    Atende {t.atende} de {t.total} critérios
                    {t.obrigatoriosOk ? "" : " · falta um obrigatório"}
                  </p>
                ) : (
                  <Nada>{triagem ? "Ainda não lido" : "Sem a Triagem nesta vaga"}</Nada>
                )}
              </Celula>

              <Celula titulo="Teste Prático">
                {testes.length ? (
                  <ul className="flex flex-col gap-1 text-body-sm">
                    {testes.map((r) => {
                      const f = faixaDoTeste(r.tipo, r.pontos, r.maximo);
                      return (
                        <li key={r.id}>
                          {nomeCurtoDoTeste(r.titulo)}:{" "}
                          <span className="font-semibold">{f ? NOME_FAIXA[f] : "feito"}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <Nada>Não fez</Nada>
                )}
              </Celula>

              <Celula titulo="Itens da vaga">
                {a.criterios.length ? (
                  <ul className="flex flex-col gap-1 text-body-sm">
                    {a.criterios.map((k) => (
                      <li key={k.nome} className="flex items-start gap-1.5">
                        <IconeDoItem k={k} />
                        <span className="min-w-0">
                          {k.nome}
                          {k.eliminatorio && k.ok === false && <span className="text-danger"> (eliminatória)</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Nada>A vaga não tem itens para conferir</Nada>
                )}
              </Celula>

              <Celula titulo="Respostas">
                {respostas.length ? (
                  <dl className="flex flex-col gap-1.5 text-body-sm">
                    {respostas.map((r) => (
                      <div key={r.pergunta}>
                        <dt className="text-ink-muted">{r.pergunta}</dt>
                        <dd>{r.resposta}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <Nada>Sem respostas</Nada>
                )}
              </Celula>

              <Celula titulo="Últimos trabalhos">
                {trabalhos.length ? (
                  <ul className="flex flex-col gap-1.5 text-body-sm">
                    {trabalhos.map((e, i) => (
                      <li key={i}>
                        <span className="font-semibold">{e.cargo}</span>
                        {e.onde ? `, ${e.onde}` : ""}
                        <span className="block text-ink-muted">{textoDoPeriodo(e)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Nada>{cv ? "Sem trabalhos no currículo" : "Sem currículo"}</Nada>
                )}
              </Celula>

              <Celula titulo="Estudo">
                {estudos.length ? <p className="text-body-sm">{estudos.join("; ")}</p> : <Nada>Não informado</Nada>}
              </Celula>

              <div className="border-t border-line p-4">
                <AcoesDoComparar anuncioId={id} perfilId={c.perfil_id} nome={c.nome} coluna={c.coluna} />
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Celula({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 border-b border-line px-4 py-3 last:border-b-0">
      <h3 className="text-caption text-ink-muted">{titulo}</h3>
      {children}
    </section>
  );
}

function Nada({ children }: { children: ReactNode }) {
  return <p className="text-body-sm text-ink-muted">{children}</p>;
}

function IconeDoItem({ k }: { k: Criterio }) {
  if (k.ok === null)
    return <CircleHelp aria-label="Não dá para saber" className="mt-0.5 size-4 shrink-0 text-ink-muted" />;
  if (atendeEmParte(k))
    return <Minus aria-label="Atende em parte" className="mt-0.5 size-4 shrink-0 text-terra-text" />;
  if (k.ok) return <Check aria-label="Atende" className="mt-0.5 size-4 shrink-0 text-cerrado-text" />;
  return <X aria-label="Não atende" className="mt-0.5 size-4 shrink-0 text-danger" />;
}
