import { ArrowLeft, ChevronRight, Download, Eye, List, Pencil, Send, Sparkles, UserPlus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { CopiarLinkDaVaga } from "@/components/painel/links-para-mandar";
import { QuadroCandidatos } from "@/components/painel/quadro-candidatos";
import { SaudeDaVaga } from "@/components/painel/saude-vaga";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO, SITE_URL } from "@/lib/config";
import { STATUS_ANUNCIO } from "@/lib/constantes";
import { copilotoLiberado, obterAnuncio, obterMeuPerfil } from "@/lib/dados";
import { formatarLugar } from "@/lib/formato";
import { clienteDaVagaComNome } from "@/lib/servidor/clientes";
import { montarQuadro } from "@/lib/servidor/quadro";
import { saudeDasVagas } from "@/lib/servidor/saude";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { StatusAnuncio } from "@/lib/tipos";

export const metadata: Metadata = { title: "Quadro de candidatos" };

export default function Quadro({ params, searchParams }: PageProps<"/painel/anuncio/[id]/quadro">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({
  params,
  searchParams,
}: {
  params: PageProps<"/painel/anuncio/[id]/quadro">["params"];
  searchParams: PageProps<"/painel/anuncio/[id]/quadro">["searchParams"];
}) {
  if (MODO_DEMO) return <SoComSupabase />;
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  // ?candidato=<id>: abre já o cartão dessa pessoa (link da tela Candidatos)
  const abrir = typeof sp.candidato === "string" ? sp.candidato : null;
  const usuario = await exigirUsuario(`/painel/anuncio/${id}/quadro`);
  const [anuncio, perfil, copiloto] = await Promise.all([obterAnuncio(id), obterMeuPerfil(), copilotoLiberado()]);
  if (!anuncio || anuncio.autor_id !== usuario.id || anuncio.tipo !== "vaga") notFound();
  const agora = await agoraDaRequisicao();
  const { cartoes, modelos } = await montarQuadro(anuncio, agora);
  const saude = (
    await saudeDasVagas(
      [anuncio],
      cartoes.map((c) => ({
        anuncio_id: id,
        status: c.status,
        aceita_em: c.aceita ? c.curtido_em : null,
        curtido_em: c.curtido_em,
      })),
      agora,
    )
  ).get(id);
  const status = anuncio.status as StatusAnuncio;
  const agencia = anuncio.autor_tipo === "agencia";
  const finalistas = cartoes.filter((c) => c.finalista).length;
  const endereco = [anuncio.endereco, formatarLugar(anuncio.bairro, anuncio.cidade)].filter(Boolean).join(", ");

  // agência: quem deu match e ainda não está na lista de finalistas (pode ir para o cliente)
  const prontos = cartoes.filter(
    (c) => c.status === "match" && !c.finalista && c.etapa !== "contratado" && c.etapa !== "nao_seguiu",
  ).length;
  const cliente = agencia ? await clienteDaVagaComNome(id) : null;
  const urlDaVaga = `${SITE_URL}/anuncio/${id}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <nav aria-label="Trilha" className="flex flex-wrap items-center gap-1 text-label text-ink-muted">
          <Link href="/painel/anuncios?tipo=vaga" className="inline-flex min-h-11 items-center gap-1.5 hover:text-ink">
            <ArrowLeft aria-hidden className="size-4" />
            Vagas
          </Link>
          {cliente && (
            <>
              <ChevronRight aria-hidden className="size-4" />
              <Link
                href={`/painel/clientes/${cliente.id}`}
                className="inline-flex min-h-11 items-center hover:text-ink"
              >
                {cliente.nome}
              </Link>
            </>
          )}
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Selo variante={status === "ativo" ? "match" : "contorno"}>{STATUS_ANUNCIO[status]?.nome ?? status}</Selo>
              <span className="text-body-sm text-ink-muted">
                {cartoes.length} {cartoes.length === 1 ? "candidato" : "candidatos"}
                {agencia && finalistas > 0 && ` · ${finalistas} com o cliente`}
              </span>
            </div>
            <h2 className="mt-2 text-h2">{anuncio.titulo}</h2>
            {agencia && anuncio.contratante_confidencial && (
              <p className="mt-1 text-body-sm text-ink-muted">O nome do cliente fica em sigilo na vaga.</p>
            )}
          </div>
          {agencia && (
            <BotaoLink
              href={`/painel/anuncio/${id}/finalistas`}
              tamanho="sm"
              variante={prontos ? "primario" : "secundario"}
            >
              <Send aria-hidden />
              {prontos
                ? `Mandar finalistas ao cliente · ${prontos} ${prontos === 1 ? "pronto" : "prontos"}`
                : finalistas
                  ? `Finalistas para o cliente (${finalistas})`
                  : "Finalistas para o cliente"}
            </BotaoLink>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-200 p-2.5">
          {status === "ativo" && <CopiarLinkDaVaga url={urlDaVaga} />}
          {status === "ativo" && (
            <BotaoLink href={`/painel/anuncio/${id}/convidar`} tamanho="sm">
              <UserPlus aria-hidden />
              Chamar candidato de fora
            </BotaoLink>
          )}
          {copiloto && (
            <BotaoLink href={`/painel/anuncio/${id}/copiloto`} tamanho="sm">
              <Sparkles aria-hidden />
              Copiloto
            </BotaoLink>
          )}
          <a
            href={`/painel/anuncio/${id}/planilha`}
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line-strong bg-surface-200 px-3.5 text-label hover:bg-surface-300"
          >
            <Download aria-hidden className="size-[18px]" />
            Planilha
          </a>
          <BotaoLink href={`/anuncio/${id}`} tamanho="sm" variante="fantasma">
            <Eye aria-hidden />
            Ver como o candidato vê
          </BotaoLink>
          <BotaoLink href={`/painel/anuncio/${id}`} tamanho="sm" variante="fantasma">
            <List aria-hidden />
            Ver em lista
          </BotaoLink>
          <BotaoLink href={`/painel/anuncio/${id}/editar`} tamanho="sm" variante="fantasma">
            <Pencil aria-hidden />
            Editar vaga
          </BotaoLink>
        </div>
      </div>
      {saude && <SaudeDaVaga s={saude} />}
      {cartoes.length === 0 ? (
        <Vazio icone={Users} titulo="Ninguém se candidatou ainda">
          Quem curtir a vaga aparece aqui, na coluna Novos. Copie o link da vaga ali em cima, ou mande a sua página de
          vagas (em Links para divulgar). Recebeu um currículo por fora? Use “Chamar candidato de fora”.
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
          abrir={abrir}
          agencia={agencia}
          contatoDireto={Boolean(anuncio.contato_direto)}
        />
      )}
    </div>
  );
}
