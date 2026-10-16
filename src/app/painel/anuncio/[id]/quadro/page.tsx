import { ArrowLeft, Download, List, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { QuadroCandidatos } from "@/components/painel/quadro-candidatos";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { STATUS_ANUNCIO } from "@/lib/constantes";
import { obterAnuncio, obterMeuPerfil } from "@/lib/dados";
import { formatarLugar } from "@/lib/formato";
import { montarQuadro } from "@/lib/servidor/quadro";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { StatusAnuncio } from "@/lib/tipos";

export const metadata: Metadata = { title: "Quadro de candidatos" };

export default function Quadro({ params }: PageProps<"/painel/anuncio/[id]/quadro">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: PageProps<"/painel/anuncio/[id]/quadro">["params"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const { id } = await params;
  const usuario = await exigirUsuario(`/painel/anuncio/${id}/quadro`);
  const [anuncio, perfil] = await Promise.all([obterAnuncio(id), obterMeuPerfil()]);
  if (!anuncio || anuncio.autor_id !== usuario.id || anuncio.tipo !== "vaga") notFound();
  const agora = await agoraDaRequisicao();
  const { cartoes, modelos, temTriagem } = await montarQuadro(anuncio, agora);
  const status = anuncio.status as StatusAnuncio;
  const endereco = [anuncio.endereco, formatarLugar(anuncio.bairro, anuncio.cidade)].filter(Boolean).join(", ");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/painel/anuncios?tipo=vaga"
          className="inline-flex min-h-11 items-center gap-2 text-label text-ink-muted hover:text-ink"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Vagas
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Selo variante={status === "ativo" ? "match" : "contorno"}>{STATUS_ANUNCIO[status]?.nome ?? status}</Selo>
              <span className="text-body-sm text-ink-muted">
                {cartoes.length} {cartoes.length === 1 ? "candidato" : "candidatos"}
              </span>
            </div>
            <h2 className="mt-2 text-h2">{anuncio.titulo}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <BotaoLink href={`/painel/anuncio/${id}`} tamanho="sm">
              <List aria-hidden />
              Ver em lista
            </BotaoLink>
            <a
              href={`/painel/anuncio/${id}/planilha`}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line-strong bg-surface-200 px-3.5 text-label hover:bg-surface-300"
            >
              <Download aria-hidden className="size-[18px]" />
              Planilha
            </a>
            <BotaoLink href={`/painel/anuncio/${id}/editar`} tamanho="sm" variante="fantasma">
              Editar vaga
            </BotaoLink>
          </div>
        </div>
        {!temTriagem && cartoes.length > 0 && (
          <p className="mt-3 rounded-md bg-surface-300 px-4 py-3 text-body-sm">
            Dica: no{" "}
            <Link href={`/painel/anuncio/${id}/editar`} className="font-semibold underline underline-offset-2">
              editar da vaga
            </Link>
            , diga a resposta que você procura em cada pergunta (e se ela elimina). A nota de aderência fica mais
            certeira.
          </p>
        )}
      </div>
      {cartoes.length === 0 ? (
        <Vazio icone={Users} titulo="Ninguém se candidatou ainda">
          Quem curtir a vaga aparece aqui, na coluna Novos. Compartilhe o link da vaga ou a sua página de vagas em “Meus
          anúncios”.
        </Vazio>
      ) : (
        <QuadroCandidatos
          anuncioId={id}
          vaga={anuncio.titulo}
          empresa={perfil?.nome ?? anuncio.autor_nome}
          endereco={endereco}
          cartoes={cartoes}
          modelos={modelos}
          agora={agora}
        />
      )}
    </div>
  );
}
