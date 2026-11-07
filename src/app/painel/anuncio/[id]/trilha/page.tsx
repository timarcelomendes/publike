import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CabecalhoDaVaga, VistaDosCandidatos } from "@/components/painel/cabecalho-da-vaga";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { TrilhaCandidatos, type FiltroDaTrilha, type LinhaDaTrilha } from "@/components/painel/trilha-candidatos";
import { SoComSupabase } from "@/components/so-com-supabase";
import { MODO_DEMO } from "@/lib/config";
import { listarEtapasDosCandidatos, listarInteressados, obterAnuncio } from "@/lib/dados";
import { etapasProprias, ondeEstaDesde } from "@/lib/servidor/etapas-proprias";
import { trilhaDaVaga } from "@/lib/servidor/trilha";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import { celulasDaTrilha, colunasDaTrilha, situacaoNaTrilha } from "@/lib/trilha";

export const metadata: Metadata = { title: "Trilha dos candidatos" };

// A trilha dos candidatos (claude/plano-trilha-dos-candidatos.md): a terceira forma de ver os candidatos da vaga,
// ao lado do Quadro e da Lista. Uma linha por pessoa e as etapas em colunas, com a data e o que aconteceu em cada uma.

const FILTROS: FiltroDaTrilha[] = ["todos", "andamento", "contratado", "parou"];

export default function Trilha({ params, searchParams }: PageProps<"/painel/anuncio/[id]/trilha">) {
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
  params: PageProps<"/painel/anuncio/[id]/trilha">["params"];
  searchParams: PageProps<"/painel/anuncio/[id]/trilha">["searchParams"];
}) {
  if (MODO_DEMO) return <SoComSupabase />;
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const usuario = await exigirUsuario(`/painel/anuncio/${id}/trilha`);
  const anuncio = await obterAnuncio(id);
  if (!anuncio || anuncio.autor_id !== usuario.id || anuncio.tipo !== "vaga") notFound();
  const pedido = typeof sp.ver === "string" ? sp.ver : "todos";
  const filtro = (FILTROS as string[]).includes(pedido) ? (pedido as FiltroDaTrilha) : "todos";

  const [agora, interessados, etapas, proprias, desde, passos] = await Promise.all([
    agoraDaRequisicao(),
    listarInteressados(id),
    listarEtapasDosCandidatos(id),
    // as etapas próprias e desde quando (migração 20270108120000) e os passos (20270228120000): sem elas, null
    etapasProprias(),
    ondeEstaDesde(id),
    trilhaDaVaga(id),
  ]);
  const colunas = colunasDaTrilha(proprias);
  const linhas: LinhaDaTrilha[] = interessados.map((i) => {
    const candidato = {
      perfil_id: i.perfil_id,
      status: i.status,
      aceita: i.status === "pendente" && Boolean(i.aceita_em),
      curtido_em: i.curtido_em,
      etapa: etapas.get(i.perfil_id)?.etapa ?? "novo",
      subetapa: desde?.get(i.perfil_id)?.subetapa ?? null,
      desde: desde?.get(i.perfil_id)?.desde ?? etapas.get(i.perfil_id)?.atualizado_em ?? null,
    };
    return {
      perfil_id: i.perfil_id,
      nome: i.nome,
      foto: i.foto,
      bairro: i.bairro,
      cidade: i.cidade,
      situacao: situacaoNaTrilha(candidato),
      celulas: celulasDaTrilha(candidato, passos?.get(i.perfil_id) ?? [], colunas),
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoDaVaga anuncio={anuncio} aba="candidatos" />
      <VistaDosCandidatos id={id} atual="trilha" />
      <TrilhaCandidatos anuncioId={id} colunas={colunas} linhas={linhas} filtro={filtro} agora={agora} />
    </div>
  );
}
