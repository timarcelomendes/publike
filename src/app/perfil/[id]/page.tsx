import { BadgeCheck, Megaphone, Pencil } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CardAnuncio } from "@/components/card-anuncio";
import { Avatar, Aviso, Container, Esqueleto, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { TIPOS_CONTA } from "@/lib/constantes";
import { obterPerfilPublico, obterUsuario } from "@/lib/dados";
import { formatarLugar, formatarMesAno } from "@/lib/formato";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { TipoConta } from "@/lib/tipos";

export async function generateMetadata({ params }: PageProps<"/perfil/[id]">): Promise<Metadata> {
  const { id } = await params;
  const dados = await obterPerfilPublico(id);
  if (!dados) return { title: "Perfil não encontrado", robots: { index: false } };
  return {
    title: dados.perfil.nome,
    description: `${dados.perfil.nome} no Publike: ${formatarLugar(dados.perfil.bairro, dados.perfil.cidade)}.`,
  };
}

export default function PerfilPublico({ params }: PageProps<"/perfil/[id]">) {
  return (
    <Container className="py-8">
      <Suspense fallback={<Esqueleto className="h-80 w-full rounded-lg" />}>
        <Conteudo params={params} />
      </Suspense>
    </Container>
  );
}

async function Conteudo({ params }: { params: PageProps<"/perfil/[id]">["params"] }) {
  const { id } = await params;
  const [dados, usuario] = await Promise.all([obterPerfilPublico(id), obterUsuario()]);
  if (!dados) notFound();
  const { perfil, anuncios } = dados;
  const agora = await agoraDaRequisicao();
  const meu = usuario?.id === perfil.id;
  const tipo = TIPOS_CONTA[(perfil.tipo as TipoConta) in TIPOS_CONTA ? (perfil.tipo as TipoConta) : "pessoa"];
  const suspensa = Boolean(perfil.suspenso_ate && new Date(perfil.suspenso_ate).getTime() > agora);

  return (
    <>
      {suspensa && (
        <Aviso tipo="alerta" titulo="Esta conta está suspensa" className="mb-6">
          A moderação do Publike suspendeu esta conta. Os anúncios dela estão fora do ar.
        </Aviso>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar nome={perfil.nome} foto={perfil.foto} tamanho={88} />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-h2 sm:text-h1">
            <span className="truncate">{perfil.nome}</span>
            {perfil.verificado && <BadgeCheck aria-label="Perfil verificado" className="size-6 shrink-0 text-cerrado-text" />}
          </h1>
          <p className="mt-1 text-body text-ink-muted">
            {tipo.nome} · {formatarLugar(perfil.bairro, perfil.cidade)} · no Publike desde {formatarMesAno(perfil.criado_em)}
          </p>
        </div>
        {meu && (
          <BotaoLink href="/perfil" tamanho="sm" className="self-start sm:self-center">
            <Pencil aria-hidden />
            Editar perfil
          </BotaoLink>
        )}
      </div>

      {perfil.sobre && <p className="mt-6 max-w-2xl text-body whitespace-pre-line">{perfil.sobre}</p>}

      {perfil.servicos.length > 0 && (
        <section className="mt-6">
          <h2 className="text-h3">{perfil.tipo === "pessoa" ? "O que faz" : "Área de atuação"}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {perfil.servicos.map((s) => (
              <Selo key={s} variante="contorno">
                {s}
              </Selo>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-h2">Anúncios no ar</h2>
        <div className="mt-4">
          {anuncios.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {anuncios.map((a) => (
                <CardAnuncio key={a.id} anuncio={a} agora={agora} usuarioId={usuario?.id ?? null} />
              ))}
            </div>
          ) : (
            <Vazio icone={Megaphone} titulo="Nenhum anúncio no ar agora" />
          )}
        </div>
      </section>

      <p className="mt-8 text-body-sm text-ink-muted">
        O contato de {perfil.tipo === "pessoa" ? perfil.nome.split(" ")[0] : perfil.nome} aparece só depois de um
        match.
      </p>
    </>
  );
}
