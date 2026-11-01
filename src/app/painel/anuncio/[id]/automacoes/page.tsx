import { Workflow } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EditorAutomacoes } from "@/components/automacoes/editor-automacoes";
import { CabecalhoDaVaga } from "@/components/painel/cabecalho-da-vaga";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Selo } from "@/components/ui/basicos";
import { textoDoFeito } from "@/lib/automacoes";
import { MODO_DEMO } from "@/lib/config";
import { obterAnuncio } from "@/lib/dados";
import { tempoRelativo } from "@/lib/formato";
import { automacoesDaVaga } from "@/lib/servidor/automacoes";
import { configVideo } from "@/lib/servidor/entrevista-video";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Automações da vaga" };

// As regras da vaga e o registro do que fizeram (migração 20270109120000).

export default function AutomacoesDaVaga({ params }: PageProps<"/painel/anuncio/[id]/automacoes">) {
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
  const usuario = await exigirUsuario(`/painel/anuncio/${id}/automacoes`);
  const anuncio = await obterAnuncio(id);
  if (!anuncio || anuncio.autor_id !== usuario.id || anuncio.tipo !== "vaga") notFound();
  const supabase = await criarClienteServidor();
  const [regras, video, { data: modelos }, agora] = await Promise.all([
    automacoesDaVaga(id),
    configVideo(id),
    supabase.from("modelos_mensagem").select("id, nome").order("criado_em"),
    agoraDaRequisicao(),
  ]);
  const cabecalho = <CabecalhoDaVaga anuncio={anuncio} aba="candidatos" />;
  if (!regras) {
    return (
      <div className="flex flex-col gap-4">
        {cabecalho}
        <Aviso tipo="alerta" titulo="As automações ainda não estão disponíveis">
          Tente de novo em instantes.
        </Aviso>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {cabecalho}
      <section
        aria-labelledby="automacoes"
        className="flex max-w-3xl flex-col gap-4 rounded-lg border border-line bg-surface-200 p-5 sm:p-6"
      >
        <div className="flex flex-col gap-1">
          <h3 id="automacoes" className="flex flex-wrap items-center gap-2 text-h3">
            <Workflow aria-hidden className="size-5 text-ink-muted" />
            Automações da vaga
            <Selo variante="novo">Novo</Selo>
          </h3>
          <p className="text-body-sm text-ink-muted">
            O Publike faz sozinho o que você faria à mão, uma vez só por candidato, e anota aqui embaixo.
          </p>
        </div>
        <EditorAutomacoes anuncioId={id} inicial={regras} modelos={modelos ?? []} />
        {video?.liberado && (
          <p className="text-body-sm">
            Pedir a entrevista em vídeo a todo novo candidato:{" "}
            <span className="text-label">{video.pedir_a_todos ? "ligado" : "desligado"}</span>
          </p>
        )}
      </section>

      <section aria-labelledby="registro" className="flex max-w-3xl flex-col gap-3">
        <h3 id="registro" className="text-h3">
          O que as automações fizeram
        </h3>
        {regras.registro.length === 0 ? (
          <p className="text-body-sm text-ink-muted">Nada ainda.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
            {regras.registro.map((f, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2 px-4 py-3 text-body-sm">
                <Link
                  href={`/painel/anuncio/${id}/quadro?candidato=${f.perfil_id}`}
                  className="text-label underline-offset-2 hover:underline"
                >
                  {f.nome}
                </Link>
                <span>{textoDoFeito(f)}</span>
                <span className="ml-auto text-caption text-ink-muted">{tempoRelativo(f.feito_em, agora)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
