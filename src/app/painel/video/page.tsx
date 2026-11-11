import { ChevronRight, Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CabecalhoDaPagina } from "@/components/painel/cabecalho-da-pagina";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { FaixaExperimento, OfertaRecurso } from "@/components/recurso-pago";
import { SeloCortesia } from "@/components/selo-cortesia";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { recursosPagos } from "@/lib/dados";
import { marcaDoRecurso } from "@/lib/recursos-pagos";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Entrevista em vídeo" };

// A Entrevista em vídeo (claude/plano-recursos-concorrentes.md, partes 1 e 2): a oferta dos 15 dias grátis, ou as
// vagas no ar, cada uma com a sua aba (as perguntas e quem respondeu).

export default function EntrevistaEmVideo() {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  const usuario = await exigirUsuario("/painel/video");
  const [recursos, agora, supabase] = await Promise.all([recursosPagos(), agoraDaRequisicao(), criarClienteServidor()]);
  const estado = recursos?.video ?? null;
  const liberado = Boolean(estado && !estado.indisponivel && estado.liberado);
  const cabecalho = (
    <CabecalhoDaPagina
      titulo="Entrevista em vídeo"
      selo={
        <>
          <Selo variante="novo">Novo</Selo>
          {liberado && <SeloCortesia texto={marcaDoRecurso(estado, agora).longo} />}
        </>
      }
      descricao="Monte de 2 a 6 perguntas na vaga. O candidato grava as respostas pelo celular, quando puder, e a IA transcreve e resume. Você assiste no quadro da vaga, na ficha de cada um."
    />
  );
  if (!estado || estado.indisponivel || !estado.liberado) {
    return (
      <div className="flex flex-col gap-6">
        {cabecalho}
        <OfertaRecurso recurso="video" estado={estado && !estado.indisponivel ? estado : null} />
      </div>
    );
  }
  const { data: vagas } = await supabase
    .from("anuncios")
    .select("id, titulo, status, expira_em")
    .eq("autor_id", usuario.id)
    .eq("tipo", "vaga")
    .eq("status", "ativo")
    .order("criado_em", { ascending: false })
    .limit(50);
  const noAr = (vagas ?? []).filter((v) => new Date(v.expira_em).getTime() > agora);
  return (
    <div className="flex flex-col gap-6">
      {cabecalho}
      <FaixaExperimento recurso="video" estado={estado} agora={agora} />
      {noAr.length === 0 ? (
        <Vazio
          icone={Video}
          titulo="Nenhuma vaga no ar"
          acao={
            <BotaoLink href="/publicar" tamanho="sm">
              Publicar vaga
            </BotaoLink>
          }
        >
          A entrevista em vídeo fica em cada vaga.
        </Vazio>
      ) : (
        <section aria-labelledby="vagas-video" className="flex flex-col gap-3">
          <h3 id="vagas-video" className="text-h3">
            Escolha a vaga
          </h3>
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
            {noAr.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/painel/anuncio/${v.id}/video`}
                  className="flex items-center gap-3 px-4 py-3 text-label hover:bg-surface-300"
                >
                  <Video aria-hidden className="size-5 shrink-0 text-ink-muted" />
                  <span className="min-w-0 flex-1 break-words">{v.titulo}</span>
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
