import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ApagarCurriculo, FormCurriculo } from "@/components/form-curriculo";
import { Aviso, Container, Esqueleto } from "@/components/ui/basicos";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { linkDoMeuPdf, obterMeuCurriculo } from "@/lib/dados";
import { caminhoSeguro, primeiro } from "@/lib/formato";
import { exigirPerfilCompleto } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = {
  title: "Meu currículo",
  robots: { index: false },
};

export default function PaginaCurriculo({ searchParams }: PageProps<"/perfil/curriculo">) {
  return (
    <Container className="max-w-2xl py-8">
      <Link href="/perfil" className="inline-flex min-h-11 items-center gap-2 text-label text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        Meu perfil
      </Link>
      <h1 className="mt-1 text-h2 sm:text-h1">Meu currículo</h1>
      <p className="mt-2 mb-6 text-body text-ink-muted">
        Para vagas com carteira, estágio e temporárias. Preencha uma vez: quando você curtir uma vaga, quem anunciou vê
        seu currículo junto com o seu perfil.
      </p>
      <Suspense fallback={<Esqueleto className="h-[56rem] w-full rounded-lg" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/perfil/curriculo">["searchParams"] }) {
  const sp = await searchParams;
  const hoje = new Date(await agoraDaRequisicao()).toISOString().slice(0, 7);
  const proximo = caminhoSeguro(primeiro(sp.next), "");

  if (MODO_DEMO) {
    return (
      <>
        <Aviso tipo="alerta" className="mb-6" titulo="Modo demonstração">
          {MENSAGEM_DEMO}
        </Aviso>
        <FormCurriculo
          inicial={null}
          usuarioId="00000000-0000-0000-0000-000000000000"
          linkPdf={null}
          hoje={hoje}
          demo
        />
      </>
    );
  }

  const { usuario } = await exigirPerfilCompleto(
    proximo ? `/perfil/curriculo?next=${encodeURIComponent(proximo)}` : "/perfil/curriculo",
  );
  const curriculo = await obterMeuCurriculo();
  const linkPdf = await linkDoMeuPdf(curriculo?.arquivo ?? null);

  return (
    <>
      {primeiro(sp.salvo) === "1" && (
        <Aviso tipo="sucesso" className="mb-6" titulo="Currículo salvo!">
          <p>
            Agora é só curtir as vagas que combinam com você. Quem anunciou vê seu currículo e, se curtir de volta, o
            WhatsApp dos dois aparece.
          </p>
          <p className="mt-3">
            <Link href="/?tipo=vaga" className="text-label underline">
              Ver vagas perto de mim
            </Link>
          </p>
        </Aviso>
      )}
      {primeiro(sp.apagado) === "1" && (
        <Aviso tipo="info" className="mb-6" titulo="Currículo apagado">
          Ninguém mais vê. Se quiser, preencha de novo abaixo.
        </Aviso>
      )}
      <FormCurriculo
        key={curriculo?.atualizado_em ?? "novo"}
        inicial={curriculo}
        usuarioId={usuario.id}
        linkPdf={linkPdf}
        proximo={proximo}
        hoje={hoje}
      />
      {curriculo && <ApagarCurriculo />}
    </>
  );
}
