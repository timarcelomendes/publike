import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Container, Esqueleto } from "@/components/ui/basicos";
import { ResponderEntrevistaVideo } from "@/components/video/responder-entrevista";
import { MODO_DEMO } from "@/lib/config";
import { minhaEntrevistaVideo } from "@/lib/servidor/entrevista-video";
import { exigirUsuario } from "@/lib/sessao";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Entrevista em vídeo", robots: { index: false } };

// A entrevista em vídeo que a empresa pediu (migração 20270105120000): só a própria pessoa abre.

export default function PaginaEntrevistaVideo({ params }: PageProps<"/entrevista-video/[anuncio]">) {
  return (
    <Container className="max-w-xl py-8">
      <Suspense fallback={<Esqueleto className="h-96 w-full rounded-lg" />}>
        <Conteudo params={params} />
      </Suspense>
    </Container>
  );
}

async function Conteudo({ params }: { params: PageProps<"/entrevista-video/[anuncio]">["params"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const { anuncio } = await params;
  if (!UUID.test(anuncio)) notFound();
  const usuario = await exigirUsuario(`/entrevista-video/${anuncio}`);
  const entrevista = await minhaEntrevistaVideo(anuncio);
  if (!entrevista) {
    return (
      <Aviso tipo="info" titulo="Nenhuma entrevista em vídeo para esta vaga">
        Quando a empresa pedir, o aviso chega no sino e por e-mail.{" "}
        <Link href={`/anuncio/${anuncio}`} className="text-label underline">
          Ver a vaga
        </Link>
      </Aviso>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-body-sm text-ink-muted">
          {entrevista.empresa} · {entrevista.vaga}
        </p>
        <h1 className="mt-1 text-h2">Entrevista em vídeo</h1>
      </div>
      <ResponderEntrevistaVideo entrevista={entrevista} anuncioId={anuncio} euId={usuario.id} />
    </div>
  );
}
