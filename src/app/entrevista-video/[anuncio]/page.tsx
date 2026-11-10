import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Avatar, Aviso, Container, Esqueleto } from "@/components/ui/basicos";
import { ResponderEntrevistaVideo } from "@/components/video/responder-entrevista";
import { MODO_DEMO } from "@/lib/config";
import { obterAnuncio } from "@/lib/dados";
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
  const [entrevista, vaga] = await Promise.all([
    minhaEntrevistaVideo(anuncio),
    // o logo de quem contrata, o mesmo da página da vaga (vaga fora do ar: as iniciais)
    obterAnuncio(anuncio).catch(() => null),
  ]);
  const logo = vaga?.autor_foto ?? null;
  if (!entrevista) {
    // quem publicou abriu o link do candidato (logado como a empresa): a página é de quem foi chamado
    if (vaga && vaga.autor_id === usuario.id) {
      return (
        <Aviso tipo="info" titulo="Esta página é de quem foi chamado">
          Você está entrando como quem publicou a vaga. O candidato abre este link com a conta dele, e você acompanha o
          pedido na ficha de cada pessoa.{" "}
          <Link href={`/painel/anuncio/${anuncio}/quadro`} className="text-label underline">
            Ver os candidatos
          </Link>
        </Aviso>
      );
    }
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
      <div className="flex items-center gap-3">
        <Avatar nome={entrevista.empresa} foto={logo} tamanho={56} forma="quadrada" />
        <div className="min-w-0">
          <p className="text-body-sm text-ink-muted">
            {entrevista.empresa} · {entrevista.vaga}
          </p>
          <h1 className="mt-0.5 text-h2">Entrevista em vídeo</h1>
        </div>
      </div>
      <ResponderEntrevistaVideo entrevista={entrevista} anuncioId={anuncio} euId={usuario.id} logo={logo} />
    </div>
  );
}
