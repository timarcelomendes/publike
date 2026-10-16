import { ArrowLeft, Megaphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BotaoCompartilhar } from "@/components/anuncio/compartilhar";
import { CardAnuncio } from "@/components/card-anuncio";
import { SeloVerificado } from "@/components/selo-verificado";
import { BotaoSeguir } from "@/components/social/botoes";
import { Avatar, Container, Esqueleto, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { TIPOS_CONTA } from "@/lib/constantes";
import { obterPerfilPublico, obterUsuario } from "@/lib/dados";
import { meusSeguidos } from "@/lib/dados-social";
import { formatarLugar, plural } from "@/lib/formato";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { TipoConta } from "@/lib/tipos";

// "Todas as vagas" de uma empresa, comércio ou agência: o link que ela põe na
// bio do Instagram, no status do WhatsApp ou no site. Só as vagas no ar.

export async function generateMetadata({ params }: PageProps<"/perfil/[id]/vagas">): Promise<Metadata> {
  const { id } = await params;
  const dados = await obterPerfilPublico(id);
  if (!dados) return { title: "Vagas não encontradas", robots: { index: false } };
  const total = dados.anuncios.filter((a) => a.tipo === "vaga").length;
  return {
    title: `Vagas de ${dados.perfil.nome}`,
    description: `${total ? plural(total, "vaga aberta", "vagas abertas") : "Vagas"} de ${dados.perfil.nome} no Publike: ${formatarLugar(dados.perfil.bairro, dados.perfil.cidade)}. Candidate-se de graça.`,
    alternates: { canonical: `/perfil/${id}/vagas` },
  };
}

export default function VagasDaEmpresa({ params }: PageProps<"/perfil/[id]/vagas">) {
  return (
    <Container className="py-8">
      <Suspense fallback={<Esqueleto className="h-80 w-full rounded-lg" />}>
        <Conteudo params={params} />
      </Suspense>
    </Container>
  );
}

async function Conteudo({ params }: { params: PageProps<"/perfil/[id]/vagas">["params"] }) {
  const { id } = await params;
  const [dados, usuario, seguidos] = await Promise.all([obterPerfilPublico(id), obterUsuario(), meusSeguidos()]);
  if (!dados) notFound();
  const { perfil } = dados;
  const agora = await agoraDaRequisicao();
  const vagas = dados.anuncios.filter((a) => a.tipo === "vaga");
  const meu = usuario?.id === perfil.id;
  const tipo = TIPOS_CONTA[(perfil.tipo as TipoConta) in TIPOS_CONTA ? (perfil.tipo as TipoConta) : "pessoa"];

  return (
    <>
      <Link
        href={`/perfil/${perfil.id}`}
        className="inline-flex min-h-11 items-center gap-2 text-label text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Perfil de {perfil.nome}
      </Link>
      <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar nome={perfil.nome} foto={perfil.foto} tamanho={64} />
        <div className="min-w-0 flex-1">
          <h1 className="text-h2 sm:text-h1">
            Vagas de <span className="break-words">{perfil.nome}</span>
            {perfil.verificado && (
              <SeloVerificado agencia={perfil.tipo === "agencia"} className="ml-2 inline size-6 align-[-0.15em]" />
            )}
          </h1>
          <p className="mt-1 text-body text-ink-muted">
            {tipo.nome} · {formatarLugar(perfil.bairro, perfil.cidade)} ·{" "}
            {vagas.length ? plural(vagas.length, "vaga aberta", "vagas abertas") : "nenhuma vaga aberta"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start sm:self-center">
          <BotaoCompartilhar
            titulo={`Vagas de ${perfil.nome}`}
            texto={`Vagas abertas de ${perfil.nome} no Publike. Candidate-se de graça:`}
          />
          {!meu && (
            <BotaoSeguir
              alvo={{ perfil: perfil.id }}
              seguidoId={seguidos.find((s) => s.alvo_perfil === perfil.id)?.id ?? null}
              logado={usuario !== null}
              voltar={`/perfil/${perfil.id}/vagas`}
              rotulo="Seguir"
            />
          )}
        </div>
      </div>

      <div className="mt-8">
        {vagas.length ? (
          <ul aria-label="Vagas abertas" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vagas.map((a) => (
              <li key={a.id} className="contents">
                <CardAnuncio anuncio={a} agora={agora} usuarioId={usuario?.id ?? null} />
              </li>
            ))}
          </ul>
        ) : (
          <Vazio
            icone={Megaphone}
            titulo="Nenhuma vaga aberta agora"
            acao={meu ? <BotaoLink href="/publicar">Publicar vaga</BotaoLink> : undefined}
          >
            {meu
              ? "Quando você publicar, as vagas aparecem aqui sozinhas. O link continua o mesmo."
              : `Siga ${perfil.nome} para saber quando abrir vaga nova.`}
          </Vazio>
        )}
      </div>

      <p className="mt-8 text-body-sm text-ink-muted">
        Para se candidatar, abra a vaga e toque no coração. O Publike é grátis para quem procura trabalho.
      </p>
    </>
  );
}
