import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FormDenuncia } from "@/components/form-denuncia";
import { Container, Esqueleto } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { obterAnuncio } from "@/lib/dados";
import { exigirUsuario } from "@/lib/sessao";

export const metadata: Metadata = {
  title: "Denunciar anúncio",
  robots: { index: false },
};

export default function Denunciar({ params }: PageProps<"/anuncio/[id]/denunciar">) {
  return (
    <Container className="max-w-2xl py-8">
      <Suspense fallback={<Esqueleto className="h-96 w-full" />}>
        <Conteudo params={params} />
      </Suspense>
    </Container>
  );
}

async function Conteudo({ params }: { params: PageProps<"/anuncio/[id]/denunciar">["params"] }) {
  const { id } = await params;
  if (!MODO_DEMO) await exigirUsuario(`/anuncio/${id}/denunciar`);
  const anuncio = await obterAnuncio(id);
  if (!anuncio) notFound();

  return (
    <>
      <Link href={`/anuncio/${id}`} className="inline-flex min-h-11 items-center gap-2 text-label text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        Voltar para o anúncio
      </Link>
      <h1 className="mt-2 text-h2 sm:text-h1">Denunciar anúncio</h1>
      <p className="mt-2 mb-6 text-body text-ink-muted">“{anuncio.titulo}”, de {anuncio.autor_nome}</p>
      <FormDenuncia anuncioId={anuncio.id} />
    </>
  );
}
