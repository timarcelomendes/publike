import { Clock, MessageSquareText, ShieldCheck, Sparkles, Star, Tag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AcoesModeracaoAnuncio } from "@/components/admin/acoes-anuncio";
import { AcoesModeracaoAvaliacao } from "@/components/admin/acoes-avaliacao";
import { AcoesModeracaoRecado, RevisarFilaAgora } from "@/components/admin/acoes-recado";
import { Estrelas } from "@/components/avaliacoes";
import { SeloStatus } from "@/components/admin/ui";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { Selo, Vazio } from "@/components/ui/basicos";
import { filaDaModeracao, filaDeAvaliacoes, filaDeRecados } from "@/lib/admin/dados";
import { CATEGORIAS_IA } from "@/lib/admin/textos";
import { MOTIVOS_DENUNCIA } from "@/lib/constantes";
import { formatarLugar, primeiro, tempoRelativo, urlDaFotoRecado } from "@/lib/formato";
import { acessoDaEquipe } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Denúncias" };

const NOME_MOTIVO: Record<string, string> = Object.fromEntries(MOTIVOS_DENUNCIA.map((m) => [m.valor, m.nome]));

// sub-abas: o que cada fila tem para uma pessoa olhar; "Esperando a IA" junta o que a revisão não pegou
const ABAS = [
  { id: "anuncios", nome: "Anúncios", icone: Tag },
  { id: "avaliacoes", nome: "Avaliações", icone: Star },
  { id: "recados", nome: "Recados", icone: MessageSquareText },
  { id: "esperando", nome: "Esperando a IA", icone: Clock },
] as const;
type Aba = (typeof ABAS)[number]["id"];

export default function Denuncias({ searchParams }: PageProps<"/admin/denuncias">) {
  return (
    <>
      <p className="mb-6 max-w-3xl text-body text-ink-muted">
        Anúncios com denúncias abertas, os que a IA tirou do ar e os que ela não conseguiu revisar, e as avaliações e os
        recados que precisam de uma pessoa. Com três denúncias de pessoas diferentes, de contas com pelo menos 3 dias, o
        anúncio sai do ar sozinho até alguém decidir. Denúncias de contas mais novas aparecem aqui, mas sozinhas não
        tiram do ar.
      </p>
      <Suspense fallback={<EsqueletoLista />}>
        {searchParams.then((sp) => {
          const pedida = primeiro(sp.aba);
          const aba = ABAS.some((a) => a.id === pedida) ? (pedida as Aba) : null;
          return <Conteudo pedida={aba} />;
        })}
      </Suspense>
    </>
  );
}

function SubAbas({ ativa, numeros }: { ativa: Aba; numeros: Record<Aba, number> }) {
  return (
    <nav aria-label="Moderação" className="sem-barra -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {ABAS.map(({ id, nome, icone: Icone }) => {
        const atual = id === ativa;
        const n = numeros[id];
        return (
          <Link
            key={id}
            href={`/admin/denuncias?aba=${id}`}
            aria-current={atual ? "page" : undefined}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-pill border px-3.5 text-label transition-colors ${
              atual
                ? "border-ink bg-ink text-surface-100"
                : "border-line bg-surface-300 text-ink hover:border-line-strong"
            }`}
          >
            <Icone aria-hidden className="size-4" />
            {nome}
            {n > 0 && (
              <span
                className={`rounded-pill px-1.5 text-caption tabular-nums ${
                  id === "esperando" ? "bg-danger text-on-terra" : atual ? "bg-surface-100 text-ink" : "bg-surface-100"
                }`}
              >
                {n}
                <span className="sr-only"> para olhar</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

async function Conteudo({ pedida }: { pedida: Aba | null }) {
  const acesso = await acessoDaEquipe();
  if (!acesso) notFound();
  const [fila, todasAvaliacoes, todosRecados, agora] = await Promise.all([
    filaDaModeracao(acesso.cliente),
    filaDeAvaliacoes(acesso.cliente),
    filaDeRecados(acesso.cliente),
    agoraDaRequisicao(),
  ]);
  const esperando = (s: string) => s === "esperando_ia";
  const avaliacoes = todasAvaliacoes.filter((a) => !esperando(a.situacao));
  const recados = todosRecados.filter((r) => !esperando(r.situacao));
  const avaliacoesEsperando = todasAvaliacoes.filter((a) => esperando(a.situacao));
  const recadosEsperando = todosRecados.filter((r) => esperando(r.situacao));
  const numeros: Record<Aba, number> = {
    anuncios: fila.length,
    avaliacoes: avaliacoes.length,
    recados: recados.length,
    esperando: avaliacoesEsperando.length + recadosEsperando.length,
  };
  // sem aba no endereço: a primeira com alguma coisa (o que espera a IA primeiro, porque está escondido)
  const aba: Aba =
    pedida ??
    (numeros.esperando
      ? "esperando"
      : ((["anuncios", "avaliacoes", "recados"] as const).find((a) => numeros[a] > 0) ?? "anuncios"));

  return (
    <div className="flex flex-col gap-6">
      <SubAbas ativa={aba} numeros={numeros} />
      {aba === "anuncios" && (
        <section className="flex flex-col gap-4">
          <h2 className="text-h3">Anúncios</h2>
          {fila.length === 0 ? (
            <Vazio icone={ShieldCheck} titulo="Nenhuma denúncia aberta">
              Tudo em ordem por aqui.
            </Vazio>
          ) : (
            <ul className="flex flex-col gap-4">
              {fila.map((item) => (
                <li
                  key={item.anuncio_id}
                  className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <SeloStatus status={item.status} />
                    {item.denuncias_abertas > 0 && (
                      <Selo variante="aviso">
                        {item.denuncias_abertas} {item.denuncias_abertas === 1 ? "denúncia" : "denúncias"}
                      </Selo>
                    )}
                    {item.ia_retido && (
                      <Selo variante="aviso">
                        <Sparkles aria-hidden />
                        Retido pela IA
                      </Selo>
                    )}
                    {item.ia_falhou && (
                      <Selo variante="contorno">
                        <Sparkles aria-hidden />A IA não conseguiu revisar
                      </Selo>
                    )}
                  </div>
                  <h2 className="text-h3">
                    <Link href={`/admin/anuncios/${item.anuncio_id}`} className="underline-offset-2 hover:underline">
                      {item.titulo}
                    </Link>
                  </h2>
                  <p className="text-body-sm text-ink-muted">
                    Por{" "}
                    {acesso.admin ? (
                      <Link href={`/admin/usuarios/${item.autor_id}`} className="underline">
                        {item.autor_nome}
                      </Link>
                    ) : (
                      item.autor_nome
                    )}{" "}
                    · {formatarLugar(item.bairro, item.cidade)} · publicado {tempoRelativo(item.criado_em, agora)}
                  </p>
                  {item.ia_falhou && (
                    <p className="rounded-md bg-surface-300 p-3 text-body-sm">
                      O anúncio continua no ar, mas ninguém conferiu o texto. Leia e, se estiver tudo certo, marque como
                      revisado.
                    </p>
                  )}
                  {item.ia_retido && (
                    <div className="flex flex-col gap-2 rounded-md bg-terra-soft p-3 text-body-sm">
                      <div className="flex flex-wrap gap-2">
                        {item.ia_categorias.map((c) => (
                          <Selo key={c} variante="contorno">
                            {CATEGORIAS_IA[c] ?? c}
                          </Selo>
                        ))}
                      </div>
                      {item.ia_explicacao && <p>IA: {item.ia_explicacao}</p>}
                    </div>
                  )}
                  {item.motivos.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {item.motivos.map((m) => (
                        <Selo key={m} variante="contorno">
                          {NOME_MOTIVO[m] ?? m}
                        </Selo>
                      ))}
                    </div>
                  )}
                  {item.detalhes.length > 0 && (
                    <ul className="flex flex-col gap-2">
                      {item.detalhes.map((d, i) => (
                        <li key={i} className="rounded-md bg-surface-300 p-3 text-body-sm">
                          “{d}”
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="border-t border-line pt-3">
                    <AcoesModeracaoAnuncio
                      anuncioId={item.anuncio_id}
                      status={item.status}
                      denunciasAbertas={item.denuncias_abertas}
                      iaFalhou={item.ia_falhou}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {aba === "esperando" && (
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-h3">Esperando a IA</h2>
            <p className="mt-1 max-w-3xl text-body-sm text-ink-muted">
              Recados e avaliações que estão na fila da IA há mais de 15 minutos. Enquanto esperam, só quem escreveu vê.
              Normalmente a IA libera em segundos: se eles param aqui, a revisão não está rodando no site publicado
              (confira a chave do servidor e a chave da IA na hospedagem). Dá para liberar ou remover à mão.
            </p>
          </div>
          {acesso.admin && numeros.esperando > 0 && <RevisarFilaAgora />}
          {numeros.esperando === 0 ? (
            <Vazio icone={ShieldCheck} titulo="Nada esperando a IA">
              A revisão está em dia.
            </Vazio>
          ) : (
            <>
              {recadosEsperando.length > 0 && (
                <ListaDeRecados recados={recadosEsperando} admin={acesso.admin} agora={agora} />
              )}
              {avaliacoesEsperando.length > 0 && (
                <ListaDeAvaliacoes avaliacoes={avaliacoesEsperando} admin={acesso.admin} agora={agora} />
              )}
            </>
          )}
        </section>
      )}

      {aba === "avaliacoes" && (
        <section id="avaliacoes" className="flex scroll-mt-24 flex-col gap-4">
          <div>
            <h2 className="text-h3">Avaliações</h2>
            <p className="mt-1 max-w-3xl text-body-sm text-ink-muted">
              Textos que a IA reteve (ofensa, ameaça, discriminação, dados pessoais), que ela não conseguiu revisar ou
              que o profissional denunciou. Publicar tira a advertência que a IA deu; remover mantém. Em caso grave ou
              repetido, suspenda ou bana a conta de quem escreveu.
            </p>
          </div>
          {avaliacoes.length === 0 ? (
            <Vazio icone={ShieldCheck} titulo="Nenhuma avaliação para revisar" />
          ) : (
            <ListaDeAvaliacoes avaliacoes={avaliacoes} admin={acesso.admin} agora={agora} />
          )}
        </section>
      )}

      {aba === "recados" && (
        <section id="recados" className="flex scroll-mt-24 flex-col gap-4">
          <div>
            <h2 className="text-h3">Recados</h2>
            <p className="mt-1 max-w-3xl text-body-sm text-ink-muted">
              Recados da linha do tempo que a IA reteve, que ela não conseguiu revisar ou que receberam denúncia. Com
              três denúncias de contas com pelo menos 3 dias, o recado sai do ar sozinho até alguém decidir. Remover
              tira de todo lugar e avisa quem escreveu com o motivo.
            </p>
          </div>
          {recados.length === 0 ? (
            <Vazio icone={ShieldCheck} titulo="Nenhum recado para revisar" />
          ) : (
            <ListaDeRecados recados={recados} admin={acesso.admin} agora={agora} />
          )}
        </section>
      )}
    </div>
  );
}

type ItemAvaliacao = Awaited<ReturnType<typeof filaDeAvaliacoes>>[number];
type ItemRecado = Awaited<ReturnType<typeof filaDeRecados>>[number];

function ListaDeAvaliacoes({
  avaliacoes,
  admin,
  agora,
}: {
  avaliacoes: ItemAvaliacao[];
  admin: boolean;
  agora: number;
}) {
  return (
    <ul className="flex flex-col gap-4">
      {avaliacoes.map((a) => (
        <li
          key={`${a.avaliacao_id}-${a.parte}`}
          className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Selo variante={a.situacao === "retida" ? "aviso" : "contorno"}>
              {a.situacao === "retida"
                ? "Retida pela IA"
                : a.situacao === "denunciada"
                  ? "Denunciada pelo profissional"
                  : a.situacao === "esperando_ia"
                    ? "Esperando a IA"
                    : "A IA não conseguiu revisar"}
            </Selo>
            <Selo variante="contorno">{a.parte === "resposta" ? "Resposta do profissional" : "Comentário"}</Selo>
            {a.escritor_advertencias > 0 && (
              <Selo variante="perigo">
                {a.escritor_advertencias} {a.escritor_advertencias === 1 ? "advertência" : "advertências"}
              </Selo>
            )}
          </div>
          <p className="flex flex-wrap items-center gap-2 text-body-sm text-ink-muted">
            <Estrelas nota={a.nota} tamanho={14} />
            {a.titulo_servico} · de{" "}
            {admin ? (
              <Link href={`/admin/usuarios/${a.escritor_id}`} className="underline">
                {a.escritor_nome}
              </Link>
            ) : (
              a.escritor_nome
            )}{" "}
            {a.parte === "resposta" ? "(o profissional)" : `para ${a.profissional_nome}`} ·{" "}
            {tempoRelativo(a.criado_em, agora)}
          </p>
          {a.texto && (
            <blockquote className="rounded-md bg-surface-300 p-3 text-body whitespace-pre-line">“{a.texto}”</blockquote>
          )}
          {(a.ia_categorias.length > 0 || a.ia_explicacao) && a.situacao === "retida" && (
            <div className="flex flex-col gap-2 rounded-md bg-terra-soft p-3 text-body-sm">
              <div className="flex flex-wrap gap-2">
                {a.ia_categorias.map((c) => (
                  <Selo key={c} variante="contorno">
                    {CATEGORIAS_IA[c] ?? c}
                  </Selo>
                ))}
              </div>
              {a.ia_explicacao && <p>IA: {a.ia_explicacao}</p>}
            </div>
          )}
          {a.motivo_denuncia && (
            <p className="rounded-md bg-surface-300 p-3 text-body-sm">Profissional: “{a.motivo_denuncia}”</p>
          )}
          <div className="flex flex-wrap items-start justify-between gap-3 border-t border-line pt-3">
            <AcoesModeracaoAvaliacao id={a.avaliacao_id} parte={a.parte === "resposta" ? "resposta" : "comentario"} />
            {admin && (
              <Link
                href={`/admin/usuarios/${a.escritor_id}`}
                className="text-label text-danger underline-offset-2 hover:underline"
              >
                Suspender ou banir quem escreveu
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ListaDeRecados({ recados, admin, agora }: { recados: ItemRecado[]; admin: boolean; agora: number }) {
  return (
    <ul className="flex flex-col gap-4">
      {recados.map((r) => {
        const foto = urlDaFotoRecado(r.foto);
        return (
          <li
            key={r.recado_id}
            className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Selo variante={r.situacao === "retido" ? "aviso" : "contorno"}>
                {r.situacao === "retido"
                  ? "Fora do ar"
                  : r.situacao === "denunciado"
                    ? "No ar, com denúncia"
                    : r.situacao === "esperando_ia"
                      ? "Esperando a IA (só quem escreveu vê)"
                      : "A IA não conseguiu revisar"}
              </Selo>
              {r.denuncias_abertas > 0 && (
                <Selo variante="aviso">
                  {r.denuncias_abertas} {r.denuncias_abertas === 1 ? "denúncia" : "denúncias"}
                </Selo>
              )}
            </div>
            <p className="text-body-sm text-ink-muted">
              De{" "}
              {admin ? (
                <Link href={`/admin/usuarios/${r.autor_id}`} className="underline">
                  {r.autor_nome}
                </Link>
              ) : (
                r.autor_nome
              )}{" "}
              · {formatarLugar(r.bairro, r.cidade)} · {tempoRelativo(r.criado_em, agora)}
              {r.anuncio_titulo && ` · cita “${r.anuncio_titulo}”`}
            </p>
            <blockquote className="rounded-md bg-surface-300 p-3 text-body whitespace-pre-line">“{r.texto}”</blockquote>
            {foto && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={foto} alt="Foto do recado" className="max-h-48 w-fit rounded-md object-cover" />
            )}
            {(r.ia_categorias.length > 0 || r.ia_explicacao) && (
              <div className="flex flex-col gap-2 rounded-md bg-terra-soft p-3 text-body-sm">
                <div className="flex flex-wrap gap-2">
                  {r.ia_categorias.map((c) => (
                    <Selo key={c} variante="contorno">
                      {CATEGORIAS_IA[c] ?? c}
                    </Selo>
                  ))}
                </div>
                {r.ia_explicacao && <p>IA: {r.ia_explicacao}</p>}
              </div>
            )}
            {r.motivos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {r.motivos.map((m) => (
                  <Selo key={m} variante="contorno">
                    {NOME_MOTIVO[m] ?? m}
                  </Selo>
                ))}
              </div>
            )}
            {r.detalhes.map((t, i) => (
              <p key={i} className="rounded-md bg-surface-300 p-3 text-body-sm">
                “{t}”
              </p>
            ))}
            <div className="border-t border-line pt-3">
              <AcoesModeracaoRecado id={r.recado_id} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
