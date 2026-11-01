import { KanbanSquare, Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CabecalhoDaVaga } from "@/components/painel/cabecalho-da-vaga";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { FaixaExperimento, OfertaRecurso } from "@/components/recurso-pago";
import { SeloCortesia } from "@/components/selo-cortesia";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Avatar, Selo } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { FormPerguntasVideo } from "@/components/video/perguntas-video";
import { MODO_DEMO } from "@/lib/config";
import { listarInteressados, obterAnuncio, recursosPagos } from "@/lib/dados";
import { SITUACOES_VIDEO, sugestoesDePerguntas, textoDoTempo } from "@/lib/entrevista-video";
import { tempoRelativo } from "@/lib/formato";
import { marcaDoRecurso } from "@/lib/recursos-pagos";
import { configVideo, videosDaVaga } from "@/lib/servidor/entrevista-video";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Entrevista em vídeo da vaga" };

// A aba "Entrevista em vídeo" da vaga (migração 20270105120000): as perguntas e quem já respondeu. Pedir a
// entrevista a um candidato é pelo quadro (um ou vários de uma vez) ou pela regra "Pedir a todo novo candidato".

export default function VideoDaVaga({ params }: PageProps<"/painel/anuncio/[id]/video">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      {params.then(({ id }) => (
        <Conteudo id={id} />
      ))}
    </Suspense>
  );
}

async function Conteudo({ id }: { id: string }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const usuario = await exigirUsuario(`/painel/anuncio/${id}/video`);
  const anuncio = await obterAnuncio(id);
  if (!anuncio || anuncio.autor_id !== usuario.id || anuncio.tipo !== "vaga") notFound();
  const [config, videos, interessados, recursos, agora] = await Promise.all([
    configVideo(id),
    videosDaVaga(id),
    listarInteressados(id).catch(() => []),
    recursosPagos(),
    agoraDaRequisicao(),
  ]);
  const cabecalho = <CabecalhoDaVaga anuncio={anuncio} aba="video" />;
  if (!config || !videos) {
    return (
      <div className="flex flex-col gap-4">
        {cabecalho}
        <Aviso tipo="alerta" titulo="A entrevista em vídeo ainda não está disponível">
          Tente de novo em instantes.
        </Aviso>
      </div>
    );
  }
  const estado = recursos?.video ?? null;
  const nome = new Map(interessados.map((i) => [i.perfil_id, { nome: i.nome, foto: i.foto }]));
  const lista = [...videos.entries()].sort(
    (a, b) =>
      new Date(b[1].enviada_em ?? b[1].pedida_em).getTime() - new Date(a[1].enviada_em ?? a[1].pedida_em).getTime(),
  );
  const enviadas = lista.filter(([, v]) => v.situacao === "enviada").length;

  return (
    <div className="flex flex-col gap-6">
      {cabecalho}
      {!config.liberado ? (
        <OfertaRecurso recurso="video" estado={estado} />
      ) : (
        <>
          <FaixaExperimento recurso="video" estado={estado ?? undefined} agora={agora} />
          <section
            aria-labelledby="perguntas-video"
            className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-5 sm:p-6"
          >
            <div className="flex flex-col gap-1">
              <h3 id="perguntas-video" className="flex flex-wrap items-center gap-2 text-h3">
                <Video aria-hidden className="size-5 text-ink-muted" />
                Entrevista em vídeo
                <Selo variante="novo">Novo</Selo>
                <SeloCortesia texto={marcaDoRecurso(estado, agora).longo} />
              </h3>
              <p className="text-body-sm text-ink-muted">
                O candidato grava as respostas pelo celular, quando puder, em até 5 dias. A IA transcreve e resume o que
                ele disse, sem avaliar o rosto, a voz ou o jeito de falar. Quem decide é você.
              </p>
            </div>
            <FormPerguntasVideo anuncioId={id} config={config} sugestoes={sugestoesDePerguntas(anuncio.titulo)} />
          </section>
        </>
      )}

      <section aria-labelledby="respostas-video" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="respostas-video" className="text-h3">
            {lista.length ? `Pedidos (${lista.length})` : "Pedidos"}
          </h3>
          {enviadas > 0 && (
            <p className="text-body-sm text-ink-muted">
              {enviadas} {enviadas === 1 ? "respondeu" : "responderam"}
            </p>
          )}
        </div>
        {lista.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-line p-5">
            <p className="text-body-sm text-ink-muted">
              Ninguém recebeu o pedido ainda. No quadro, marque os candidatos e toque em “Pedir entrevista em vídeo”, ou
              ligue “Pedir a todo novo candidato” aqui em cima.
            </p>
            <BotaoLink href={`/painel/anuncio/${id}/quadro`} tamanho="sm">
              <KanbanSquare aria-hidden />
              Abrir o quadro
            </BotaoLink>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
            {lista.map(([perfilId, v]) => {
              const p = nome.get(perfilId);
              const s = SITUACOES_VIDEO[v.situacao];
              return (
                <li key={v.id}>
                  <Link
                    href={`/painel/anuncio/${id}/quadro?candidato=${perfilId}`}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface-300"
                  >
                    <Avatar nome={p?.nome ?? "Candidato"} foto={p?.foto ?? null} tamanho={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-label break-words">{p?.nome ?? "Candidato"}</span>
                      <span className="block text-body-sm text-ink-muted">
                        {v.enviada_em
                          ? `Respondeu ${tempoRelativo(v.enviada_em, agora)}`
                          : `Pedido ${tempoRelativo(v.pedida_em, agora)}`}
                        {v.resumo ? ` · ${v.resumo.resumo.slice(0, 90)}${v.resumo.resumo.length > 90 ? "…" : ""}` : ""}
                      </span>
                    </span>
                    <Selo variante={s.tom}>{s.nome}</Selo>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {config.liberado && config.perguntas.length > 0 && (
          <p className="text-caption text-ink-muted">
            {config.perguntas.length} perguntas, até {textoDoTempo(config.segundos)} cada.
          </p>
        )}
      </section>
    </div>
  );
}
