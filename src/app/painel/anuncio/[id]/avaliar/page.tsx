import { ChevronRight, CircleAlert, CircleCheck, CircleDashed, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { IntroDaAba } from "@/components/painel/cabecalho-da-pagina";
import { CabecalhoDaVaga, ICONE_DA_FERRAMENTA } from "@/components/painel/cabecalho-da-vaga";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SeloCortesia } from "@/components/selo-cortesia";
import { SoComSupabase } from "@/components/so-com-supabase";
import { MODO_DEMO } from "@/lib/config";
import { obterAnuncio, recursosPagos } from "@/lib/dados";
import { plural } from "@/lib/formato";
import { marcaDoRecurso, NOME_RECURSO, type FerramentaDeAvaliar } from "@/lib/recursos-pagos";
import { avaliacoesDoCopiloto, configDoCopiloto } from "@/lib/servidor/copiloto";
import { configVideo, videosDaVaga } from "@/lib/servidor/entrevista-video";
import { resultadosDosTestes, testesDaVaga } from "@/lib/servidor/testes";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Avaliar os candidatos" };

// A aba Avaliar da vaga (pedido de 01/11/2026: todas as abas à vista): a Triagem com IA, o Teste Prático e a
// Entrevista em vídeo numa página só, cada uma com o que está fazendo nesta vaga. Dentro de cada uma, a linha
// embaixo das abas leva às outras (CabecalhoDaVaga).

const O_QUE_FAZ: Record<FerramentaDeAvaliar, string> = {
  copiloto: "A IA lê os currículos contra o que a vaga pede e mostra o trecho que prova cada ponto.",
  testes: "Um teste curto do trabalho, que o candidato faz pelo celular antes da entrevista.",
  video: "O candidato grava as respostas pelo celular, e a IA resume o que ele disse.",
};

type Situacao = { texto: string; jeito: "ok" | "falta" | "parado" };

const ICONE_DA_SITUACAO: Record<Situacao["jeito"], { icone: LucideIcon; cor: string }> = {
  ok: { icone: CircleCheck, cor: "text-cerrado-text" },
  falta: { icone: CircleAlert, cor: "text-terra-text" },
  parado: { icone: CircleDashed, cor: "text-ink-muted" },
};

export default function Avaliar({ params }: PageProps<"/painel/anuncio/[id]/avaliar">) {
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
  const usuario = await exigirUsuario(`/painel/anuncio/${id}/avaliar`);
  const anuncio = await obterAnuncio(id);
  if (!anuncio || anuncio.autor_id !== usuario.id || anuncio.tipo !== "vaga") notFound();
  const [recursos, agora, copiloto, testes, resultados, video, videos] = await Promise.all([
    recursosPagos(),
    agoraDaRequisicao(),
    configDoCopiloto(id),
    testesDaVaga(id),
    resultadosDosTestes(id),
    configVideo(id),
    videosDaVaga(id),
  ]);
  // as leituras só existem com o recurso e os critérios
  const lidas =
    copiloto?.liberado && copiloto.criterios.length
      ? [...(await avaliacoesDoCopiloto(id)).values()].filter(
          (a) => a.origem === "candidato" && a.versao === copiloto.versao,
        ).length
      : 0;

  const situacao: Record<FerramentaDeAvaliar, Situacao | null> = {
    copiloto: !copiloto?.liberado
      ? null
      : !copiloto.criterios.length
        ? { texto: "Falta dizer o que a vaga pede", jeito: "falta" }
        : !copiloto.triagem
          ? { texto: "A leitura dos candidatos está desligada", jeito: "parado" }
          : {
              texto: `${plural(copiloto.criterios.length, "critério", "critérios")} · ${plural(lidas, "candidato lido", "candidatos lidos")}`,
              jeito: "ok",
            },
    testes: testesDaSituacao(testes.length, resultados),
    video: !video?.liberado
      ? null
      : !video.perguntas.length
        ? { texto: "Falta escolher as perguntas", jeito: "falta" }
        : {
            texto: [
              plural(video.perguntas.length, "pergunta", "perguntas"),
              plural(videos?.size ?? 0, "pedida", "pedidas"),
              plural(
                [...(videos?.values() ?? [])].filter((v) => v.situacao === "enviada").length,
                "respondida",
                "respondidas",
              ),
            ].join(" · "),
            jeito: "ok",
          },
  };
  // sem a migração 20270104120000, a Entrevista em vídeo não aparece
  const ferramentas: FerramentaDeAvaliar[] = [
    "copiloto",
    "testes",
    ...(recursos && !recursos.video.indisponivel ? ["video" as const] : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoDaVaga anuncio={anuncio} aba="avaliar" />
      <IntroDaAba>
        <p>
          Três jeitos de conhecer melhor quem se candidatou, antes de chamar para conversar. O resultado de cada um
          aparece no cartão do candidato, no quadro.
        </p>
      </IntroDaAba>
      {/* um cartão por jeito, lado a lado no computador */}
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 xl:grid-cols-3">
        {ferramentas.map((r) => {
          const Icone = ICONE_DA_FERRAMENTA[r];
          const s = situacao[r];
          const Sinal = s ? ICONE_DA_SITUACAO[s.jeito] : null;
          return (
            <li key={r}>
              <Link
                href={`/painel/anuncio/${id}/${r}`}
                scroll={false}
                className="group flex h-full items-start gap-4 rounded-lg border border-line bg-surface-200 p-4 shadow-card transition-colors hover:bg-surface-300 sm:p-5"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-surface-300 group-hover:bg-surface-200">
                  <Icone aria-hidden className="size-5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2 text-h3">
                    {NOME_RECURSO[r]}
                    <SeloCortesia curto texto={marcaDoRecurso(recursos?.[r], agora).curto} />
                  </span>
                  <span className="text-body-sm text-ink-muted">{O_QUE_FAZ[r]}</span>
                  {s && Sinal && (
                    <span className="mt-1 inline-flex items-center gap-1.5 text-body-sm">
                      <Sinal.icone aria-hidden className={`size-4 shrink-0 ${Sinal.cor}`} />
                      {s.texto}
                    </span>
                  )}
                </span>
                <ChevronRight
                  aria-hidden
                  className="mt-3 size-5 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Os testes da vaga: quantos estão nela, quantos foram feitos e quantos o candidato ainda tem para fazer. */
function testesDaSituacao(naVaga: number, resultados: { feita_em: string | null; vencida: boolean }[]): Situacao {
  if (!naVaga) return { texto: "Nenhum teste nesta vaga", jeito: "parado" };
  const feitos = resultados.filter((r) => r.feita_em).length;
  const esperando = resultados.filter((r) => !r.feita_em && !r.vencida).length;
  return {
    texto: [
      `${plural(naVaga, "teste", "testes")} na vaga`,
      plural(feitos, "feito", "feitos"),
      esperando ? `${esperando} por fazer` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    jeito: "ok",
  };
}
