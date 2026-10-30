import { ChevronRight, Send, Sparkles, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CabecalhoDaVaga, OrdemPeloCopiloto, VistaDosCandidatos } from "@/components/painel/cabecalho-da-vaga";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { QuadroCandidatos } from "@/components/painel/quadro-candidatos";
import { SeloCortesia } from "@/components/selo-cortesia";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { esperaResposta } from "@/lib/constantes";
import { obterAnuncio, obterMeuPerfil, recursosPagos } from "@/lib/dados";
import { formatarLugar } from "@/lib/formato";
import { marcaDoRecurso } from "@/lib/recursos-pagos";
import { clienteDaVagaComNome } from "@/lib/servidor/clientes";
import { ordemDoCopiloto } from "@/lib/servidor/copiloto";
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
  const [anuncio, perfil, recursos] = await Promise.all([obterAnuncio(id), obterMeuPerfil(), recursosPagos()]);
  if (!anuncio || anuncio.autor_id !== usuario.id || anuncio.tipo !== "vaga") notFound();
  const agora = await agoraDaRequisicao();
  const [{ cartoes: daVaga, modelos }, posicoes] = await Promise.all([
    montarQuadro(anuncio, agora),
    ordemDoCopiloto(id),
  ]);
  // "Ordenar pelo Copiloto": quem foi lido vem na ordem do ranking; quem não foi, depois, na ordem de sempre
  const peloCopiloto = Boolean(posicoes) && sp.ordem === "copiloto";
  const cartoes = daVaga.map((c) => ({ ...c, copiloto: peloCopiloto ? (posicoes?.get(c.perfil_id) ?? null) : null }));
  if (peloCopiloto) cartoes.sort((a, b) => (a.copiloto ?? Infinity) - (b.copiloto ?? Infinity));
  const marcaCopiloto = marcaDoRecurso(recursos?.copiloto, agora).curto;
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

  const paraResponder = cartoes.filter((c) =>
    esperaResposta({ status: c.status, aceita_em: c.aceita ? c.curtido_em : null }),
  ).length;
  const resumo = [
    `${cartoes.length} ${cartoes.length === 1 ? "candidato" : "candidatos"}`,
    paraResponder ? `${paraResponder} ${paraResponder === 1 ? "espera" : "esperam"} você` : null,
    agencia && finalistas > 0 ? `${finalistas} com o cliente` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoDaVaga
        anuncio={anuncio}
        aba="candidatos"
        resumo={resumo}
        saude={saude}
        cliente={cliente}
        nota={
          agencia && anuncio.contratante_confidencial ? (
            <p className="mt-1 text-body-sm text-ink-muted">O nome do cliente fica em sigilo na vaga.</p>
          ) : null
        }
        acoes={
          agencia ? (
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
          ) : null
        }
      />
      {cartoes.length === 0 && status === "ativo" && (
        <Link
          href={`/painel/anuncio/${id}/copiloto`}
          className="group flex items-center gap-3 rounded-lg border border-terra/40 bg-terra-soft p-4 hover:border-terra"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-surface-200">
            <Sparkles aria-hidden className="size-5 text-terra-text" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 text-label">
              Ninguém se candidatou ainda? O Copiloto busca para você.
              <SeloCortesia curto texto={marcaCopiloto} />
            </span>
            <span className="block text-body-sm text-ink-muted">
              Ele procura em Talentos quem combina com esta vaga e mostra o trecho do currículo que comprova.
            </span>
          </span>
          <ChevronRight aria-hidden className="size-4 shrink-0 text-terra-text" />
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <VistaDosCandidatos id={id} atual="quadro" />
        {posicoes ? (
          <OrdemPeloCopiloto
            ativo={peloCopiloto}
            href={peloCopiloto ? `/painel/anuncio/${id}/quadro` : `/painel/anuncio/${id}/quadro?ordem=copiloto`}
          />
        ) : (
          cartoes.length > 0 &&
          recursos?.copiloto.liberado && (
            <Link
              href={`/painel/anuncio/${id}/copiloto?ver=candidatos`}
              className="inline-flex min-h-10 items-center gap-1.5 text-label text-terra-text underline-offset-2 hover:underline"
            >
              <Sparkles aria-hidden className="size-4" />
              Ler os candidatos com o Copiloto
            </Link>
          )
        )}
      </div>
      {cartoes.length === 0 ? (
        <Vazio icone={Users} titulo="Ninguém se candidatou ainda">
          Quem curtir a vaga aparece aqui, na coluna Novos. Copie o link da vaga ali em cima, ou mande a sua página de
          vagas (em Links para divulgar). Recebeu um currículo por fora? Use “Chamar candidato de fora”, em Mais.
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
