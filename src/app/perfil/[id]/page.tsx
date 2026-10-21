import { FileText, MapPinned, Megaphone, Pencil, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { ListaAvaliacoes, NotaDoProfissional } from "@/components/avaliacoes";
import { CardAnuncio } from "@/components/card-anuncio";
import { CnpjDoPerfil } from "@/components/cnpj-agencia";
import { SecaoRecados } from "@/components/recados/secao-recados";
import { BotaoConectar } from "@/components/conexoes/botao-conectar";
import { BotaoSeguir } from "@/components/social/botoes";
import { SecaoContratacoes, SecaoRecomendacoes } from "@/components/social/secoes";
import { Avatar, Aviso, Container, Esqueleto, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { descreverAtendimento, TEXTO_SEGUIR, TIPOS_CONTA } from "@/lib/constantes";
import {
  listarAvaliacoesPublicas,
  obterMeuCurriculo,
  obterMeuPerfil,
  obterNotaDoProfissional,
  obterPerfilPublico,
  obterUsuario,
} from "@/lib/dados";
import { meusSeguidos } from "@/lib/dados-social";
import { formatarLugar, formatarMesAno, urlDaFotoTrabalho } from "@/lib/formato";
import { estadosDeConexao } from "@/lib/servidor/conexoes";
import { textoDoQueFaz } from "@/lib/modo-painel";
import { modosMarcados } from "@/lib/servidor/modo";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { TipoConta } from "@/lib/tipos";
import { SeloVerificado } from "@/components/selo-verificado";

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
  const [dados, usuario, avaliacoes, nota, seguidos] = await Promise.all([
    obterPerfilPublico(id),
    obterUsuario(),
    listarAvaliacoesPublicas(id),
    obterNotaDoProfissional(id),
    meusSeguidos(),
  ]);
  if (!dados) notFound();
  const { perfil, anuncios } = dados;
  const agora = await agoraDaRequisicao();
  const meu = usuario?.id === perfil.id;
  const pessoa = perfil.tipo === "pessoa";
  // a própria pessoa: o que ela faz (o que marcou no perfil e o título do currículo)
  const [modos, curriculo] =
    meu && pessoa ? await Promise.all([modosMarcados(), obterMeuCurriculo().catch(() => null)]) : [null, null];
  const oQueFaz = modos ? textoDoQueFaz(modos, curriculo?.titulo) : null;
  const tipo = TIPOS_CONTA[(perfil.tipo as TipoConta) in TIPOS_CONTA ? (perfil.tipo as TipoConta) : "pessoa"];
  const suspensa = Boolean(perfil.suspenso_ate && new Date(perfil.suspenso_ate).getTime() > agora);
  const agencia = perfil.tipo === "agencia";
  const servicos = anuncios.filter((a) => a.tipo === "servico");
  const vagas = anuncios.filter((a) => a.tipo !== "servico");
  // onde atende: junta o de todos os serviços, sem repetir
  const atende = [...new Set(servicos.flatMap((s) => s.atende))];
  // vitrine: as fotos de todos os serviços, cada uma levando ao seu serviço
  const trabalhos = servicos
    .flatMap((s) => s.fotos.map((f) => ({ url: urlDaFotoTrabalho(f), servico: s })))
    .filter((t): t is { url: string; servico: (typeof servicos)[number] } => Boolean(t.url))
    .slice(0, 12);

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
            {perfil.verificado && <SeloVerificado agencia={agencia} className="size-6" />}
          </h1>
          <p className="mt-1 text-body text-ink-muted">
            {oQueFaz ?? tipo.nome} · {formatarLugar(perfil.bairro, perfil.cidade)} · no Publike desde{" "}
            {formatarMesAno(perfil.criado_em)}
          </p>
          {perfil.cnpj && (
            <CnpjDoPerfil cnpj={perfil.cnpj} verificada={agencia && perfil.verificado} className="mt-1" />
          )}
          {nota.total > 0 && (
            <p className="mt-1">
              <a href="#avaliacoes" className="hover:underline">
                <NotaDoProfissional media={nota.media} total={nota.total} />
              </a>
            </p>
          )}
        </div>
        {meu ? (
          <div className="flex flex-wrap gap-2 self-start sm:self-center">
            {modos?.includes("trabalhar") && (
              <BotaoLink href="/perfil/curriculo" tamanho="sm">
                <FileText aria-hidden />
                Meu currículo
              </BotaoLink>
            )}
            <BotaoLink href="/perfil" tamanho="sm">
              <Pencil aria-hidden />
              Editar perfil
            </BotaoLink>
          </div>
        ) : (
          <div className="flex max-w-60 flex-col items-start gap-1 self-start sm:items-end sm:self-center sm:text-right">
            <BotaoSeguir
              alvo={{ perfil: perfil.id }}
              seguidoId={seguidos.find((s) => s.alvo_perfil === perfil.id)?.id ?? null}
              logado={usuario !== null}
              voltar={`/perfil/${perfil.id}`}
              rotulo="Seguir"
            />
            <p className="text-body-sm text-ink-muted">{TEXTO_SEGUIR}</p>
          </div>
        )}
      </div>

      {!meu && !suspensa && (
        <Suspense fallback={null}>
          <ConectarComPerfil
            outroId={perfil.id}
            nome={perfil.nome}
            empresa={perfil.tipo !== "pessoa"}
            logado={usuario !== null}
          />
        </Suspense>
      )}

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

      {servicos.length > 0 && (
        <section className="mt-10">
          <h2 className="flex items-center gap-2 text-h2">
            <Wrench aria-hidden className="size-6" />
            Serviços
          </h2>
          {atende.length > 0 && (
            <p className="mt-1 flex items-center gap-1.5 text-body text-ink-muted">
              <MapPinned aria-hidden className="size-4 shrink-0" />
              Atende {descreverAtendimento(atende)}
            </p>
          )}
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {servicos.map((a) => (
              <CardAnuncio
                key={a.id}
                anuncio={{ ...a, autor_foto: perfil.foto }}
                agora={agora}
                usuarioId={usuario?.id ?? null}
              />
            ))}
          </div>
          {trabalhos.length > 0 && (
            <>
              <h3 className="mt-8 text-h3">Trabalhos feitos</h3>
              <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {trabalhos.map((t, n) => (
                  <li key={t.url} className="relative aspect-square overflow-hidden rounded-md bg-surface-300">
                    <Link href={`/anuncio/${t.servico.id}`} className="block size-full">
                      <Image
                        src={t.url}
                        alt={`Trabalho ${n + 1}: ${t.servico.titulo}`}
                        fill
                        unoptimized
                        sizes="(min-width: 1024px) 16vw, (min-width: 640px) 25vw, 33vw"
                        className="object-cover"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {(servicos.length > 0 || avaliacoes.length > 0) && (
        <section id="avaliacoes" className="mt-10 scroll-mt-24">
          <h2 className="text-h2">Avaliações</h2>
          {avaliacoes.length ? (
            <>
              {nota.total < 3 && (
                <p className="mt-1 text-body-sm text-ink-muted">A nota média aparece a partir de 3 avaliações.</p>
              )}
              <div className="mt-4 max-w-3xl rounded-lg border border-line bg-surface-200 p-5 sm:p-6">
                <ListaAvaliacoes avaliacoes={avaliacoes} agora={agora} nomeProfissional={perfil.nome} />
              </div>
            </>
          ) : (
            <p className="mt-2 text-body-sm text-ink-muted">
              Ainda sem avaliações. Quem contrata pelo Publike pode avaliar depois do match.
            </p>
          )}
        </section>
      )}

      <Suspense fallback={null}>
        <SecaoRecados perfilId={perfil.id} logado={usuario !== null} meu={meu} agora={agora} />
      </Suspense>

      {perfil.tipo === "pessoa" && (
        <SecaoRecomendacoes perfilId={perfil.id} nome={perfil.nome} usuarioId={usuario?.id ?? null} agora={agora} />
      )}

      {perfil.tipo === "pessoa" ? (
        <SecaoContratacoes pessoa={perfil.id} agora={agora} />
      ) : (
        <SecaoContratacoes empresa={perfil.id} agora={agora} />
      )}

      {/* pessoa sem anúncio: sem a seção (quem procura trabalho não anuncia); só a dona que presta
          serviço vê o convite para montar a vitrine */}
      {(vagas.length > 0 || (servicos.length === 0 && (!pessoa || Boolean(modos?.includes("servicos"))))) && (
        <section className="mt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-h2">{servicos.length || agencia ? "Vagas abertas" : "Anúncios no ar"}</h2>
            {vagas.length > 0 && perfil.tipo !== "pessoa" && (
              <Link
                href={`/perfil/${perfil.id}/vagas`}
                className="text-label text-ink-muted underline underline-offset-2 hover:text-ink"
              >
                Página só das vagas
              </Link>
            )}
          </div>
          <div className="mt-4">
            {vagas.length ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {vagas.map((a) => (
                  <CardAnuncio
                    key={a.id}
                    anuncio={{ ...a, autor_foto: perfil.foto }}
                    agora={agora}
                    usuarioId={usuario?.id ?? null}
                  />
                ))}
              </div>
            ) : (
              <Vazio
                icone={Megaphone}
                titulo={agencia ? "Nenhuma vaga aberta agora" : "Nenhum anúncio no ar agora"}
                acao={
                  meu ? (
                    agencia ? (
                      <BotaoLink href="/publicar">Publicar vaga</BotaoLink>
                    ) : (
                      <BotaoLink href="/painel/servicos">Oferecer meus serviços</BotaoLink>
                    )
                  ) : undefined
                }
              />
            )}
          </div>
        </section>
      )}

      <p className="mt-8 text-body-sm text-ink-muted">
        {meu
          ? "Seu WhatsApp e seu e-mail só aparecem para quem tem um match ou uma conexão aceita com você."
          : `O contato de ${pessoa ? perfil.nome.split(" ")[0] : perfil.nome} aparece só depois de um match ou de uma conexão aceita.`}
      </p>
    </>
  );
}

/**
 * Pedir conexão com esta conta, mesmo sem vaga: qualquer conta com qualquer outra (pessoa com
 * pessoa, empresa com empresa, pessoa com empresa). Quem procura trabalho, na página de uma
 * empresa, vê "Quer trabalhar aqui?".
 */
async function ConectarComPerfil({
  outroId,
  nome,
  empresa,
  logado,
}: {
  outroId: string;
  nome: string;
  /** a página é de empresa, comércio ou agência */
  empresa: boolean;
  logado: boolean;
}) {
  const voltar = `/perfil/${outroId}`;
  const para = empresa ? "empresa" : "talento";
  const eu = logado ? await obterMeuPerfil().catch(() => null) : null;
  const estado = eu ? ((await estadosDeConexao([outroId])).get(outroId) ?? null) : null;
  const procuraTrabalho = empresa && (!eu || eu.tipo === "pessoa");
  const primeiro = empresa ? nome : nome.split(" ")[0];
  const conteudo: ReactNode = (
    <BotaoConectar
      outroId={outroId}
      outroNome={nome}
      estado={estado}
      logado={eu !== null}
      voltar={voltar}
      para={para}
    />
  );
  return (
    <section
      aria-labelledby="conectar-empresa"
      className="mt-6 flex max-w-2xl flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5"
    >
      <h2 id="conectar-empresa" className="text-h3">
        {procuraTrabalho ? "Quer trabalhar aqui?" : `Conectar com ${primeiro}`}
      </h2>
      <p className="text-body-sm text-ink-muted">
        {procuraTrabalho
          ? `Peça conexão com ${nome}, mesmo sem vaga aberta. Se aceitarem, aparecem o WhatsApp e o e-mail dos dois e vocês conversam pelo Publike.`
          : `Peça conexão com ${primeiro}. ${empresa ? "Se aceitarem" : "Se aceitar"}, aparecem o WhatsApp e o e-mail dos dois e vocês conversam pelo Publike.`}
      </p>
      {conteudo}
    </section>
  );
}
