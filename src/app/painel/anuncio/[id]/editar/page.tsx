import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FormAnuncio } from "@/components/form-anuncio";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Esqueleto } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { obterAnuncio } from "@/lib/dados";
import { exigirUsuario } from "@/lib/sessao";
import type { TipoAnuncio } from "@/lib/tipos";

export const metadata: Metadata = { title: "Editar anúncio" };

export default function EditarAnuncio({ params }: PageProps<"/painel/anuncio/[id]/editar">) {
  return (
    <div className="max-w-3xl">
      <Suspense fallback={<Esqueleto className="h-[60rem] w-full rounded-lg" />}>
        <Conteudo params={params} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ params }: { params: PageProps<"/painel/anuncio/[id]/editar">["params"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const { id } = await params;
  const usuario = await exigirUsuario(`/painel/anuncio/${id}/editar`);
  const anuncio = await obterAnuncio(id);
  if (!anuncio || anuncio.autor_id !== usuario.id) notFound();

  return (
    <>
      <Link
        href={`/painel/anuncio/${id}`}
        className="inline-flex min-h-11 items-center gap-2 text-label text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Voltar
      </Link>
      <h2 className="mt-1 mb-6 text-h2">Editar anúncio</h2>
      {anuncio.status === "em_analise" || anuncio.status === "removido" ? (
        <Aviso tipo="alerta" titulo="Este anúncio está com a moderação">
          Ele não pode ser alterado até a moderação analisar as denúncias.
        </Aviso>
      ) : (
        <FormAnuncio
          inicial={{
            id: anuncio.id,
            tipo: anuncio.tipo as TipoAnuncio,
            titulo: anuncio.titulo,
            descricao: anuncio.descricao,
            categoria: anuncio.categoria,
            regime: anuncio.regime,
            pagamento_valor: anuncio.pagamento_valor,
            pagamento_unidade: anuncio.pagamento_unidade,
            beneficios: anuncio.beneficios,
            horario: anuncio.horario,
            vagas: anuncio.vagas,
            cidade: anuncio.cidade,
            bairro: anuncio.bairro,
            lat: anuncio.lat,
            lng: anuncio.lng,
          }}
        />
      )}
    </>
  );
}
