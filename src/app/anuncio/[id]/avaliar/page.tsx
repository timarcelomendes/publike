import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FormAvaliacao } from "@/components/form-avaliacao";
import { Aviso, Container, Esqueleto } from "@/components/ui/basicos";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { listarMeusDesfeitos, obterAnuncio, obterMinhaAvaliacao } from "@/lib/dados";
import { exigirUsuario } from "@/lib/sessao";

export const metadata: Metadata = {
  title: "Avaliar serviço",
  robots: { index: false },
};

export default function Avaliar({ params }: PageProps<"/anuncio/[id]/avaliar">) {
  return (
    <Container className="max-w-2xl py-8">
      <Suspense fallback={<Esqueleto className="h-96 w-full" />}>
        <Conteudo params={params} />
      </Suspense>
    </Container>
  );
}

async function Conteudo({ params }: { params: PageProps<"/anuncio/[id]/avaliar">["params"] }) {
  const { id } = await params;
  if (!MODO_DEMO) await exigirUsuario(`/anuncio/${id}/avaliar`);
  const anuncio = await obterAnuncio(id);
  if (!anuncio || anuncio.tipo !== "servico") notFound();
  const minha = await obterMinhaAvaliacao(id);
  // vale também quando foi o profissional quem desfez o match (ex.: não apareceu)
  const desfeito = anuncio.minha_curtida === "desfeito" ? (await listarMeusDesfeitos()).get(id) : undefined;
  const podeAvaliar = anuncio.minha_curtida === "match" || (desfeito !== undefined && !desfeito.porMim);
  const primeiroNome = anuncio.autor_nome.split(" ")[0];

  let conteudo;
  if (MODO_DEMO) {
    conteudo = (
      <>
        <Aviso tipo="alerta" className="mb-6" titulo="Modo demonstração">
          {MENSAGEM_DEMO}
        </Aviso>
        <FormAvaliacao anuncioId={anuncio.id} perfilProfissional={`/perfil/${anuncio.autor_id}`} inicial={null} />
      </>
    );
  } else if (!podeAvaliar) {
    conteudo = (
      <Aviso tipo="alerta" titulo="Só avalia quem deu match">
        Peça o serviço a {primeiroNome}. Depois do match e do trabalho feito, você pode avaliar aqui.
      </Aviso>
    );
  } else if (minha && (minha.status === "retida" || minha.status === "removida")) {
    conteudo = (
      <Aviso tipo="alerta" titulo="Sua avaliação está com a moderação">
        O que você escreveu não foi publicado porque parece não seguir as regras do Publike. A equipe vai analisar.
      </Aviso>
    );
  } else {
    conteudo = (
      <>
        {minha?.status === "pendente" && (
          <Aviso tipo="info" className="mb-6" titulo="Sua avaliação está na revisão automática">
            Ela aparece no perfil em instantes. Se quiser, ainda dá para mudar.
          </Aviso>
        )}
        <FormAvaliacao
          anuncioId={anuncio.id}
          perfilProfissional={`/perfil/${anuncio.autor_id}`}
          inicial={minha ? { nota: minha.nota, comentario: minha.comentario } : null}
        />
      </>
    );
  }

  return (
    <>
      <Link
        href={`/anuncio/${id}`}
        className="inline-flex min-h-11 items-center gap-2 text-label text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Voltar para o serviço
      </Link>
      <h1 className="mt-2 text-h2 sm:text-h1">{minha ? "Sua avaliação" : `Avaliar ${primeiroNome}`}</h1>
      <p className="mt-2 mb-6 text-body text-ink-muted">
        Sua avaliação ajuda os vizinhos a escolher. Serviço: “{anuncio.titulo}”.
      </p>
      {conteudo}
    </>
  );
}
