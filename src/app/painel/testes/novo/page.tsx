import type { Metadata } from "next";
import { Suspense } from "react";
import { CabecalhoDaPagina } from "@/components/painel/cabecalho-da-pagina";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { OfertaRecurso } from "@/components/recurso-pago";
import { SoComSupabase } from "@/components/so-com-supabase";
import { EditorDeTeste } from "@/components/testes/editor-teste";
import { vagaDaVolta } from "@/components/testes/voltar-para-vaga";
import { MODO_DEMO } from "@/lib/config";
import { recursosPagos } from "@/lib/dados";
import { exigirUsuario } from "@/lib/sessao";

export const metadata: Metadata = { title: "Novo teste" };

export default function NovoTeste({ searchParams }: PageProps<"/painel/testes/novo">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/painel/testes/novo">["searchParams"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const sp = await searchParams;
  const usuario = await exigirUsuario("/painel/testes/novo");
  const [vaga, recursos] = await Promise.all([vagaDaVolta(sp.vaga, usuario.id), recursosPagos()]);
  const cabecalho = (
    <CabecalhoDaPagina
      voltar={
        vaga
          ? { href: `/painel/anuncio/${vaga.id}/testes`, nome: `Testes da vaga: ${vaga.titulo}` }
          : { href: "/painel/testes", nome: "Teste Prático" }
      }
      titulo="Novo teste da sua empresa"
    />
  );
  if (recursos && !recursos.testes.liberado)
    return (
      <div className="flex flex-col gap-6">
        {cabecalho}
        <OfertaRecurso recurso="testes" estado={recursos.testes} />
      </div>
    );
  return (
    <div className="flex flex-col gap-6">
      {cabecalho}
      {/* criado pela vaga: depois de salvar, volta para os testes dela com o teste novo escolhido */}
      <div className="max-w-3xl">
        <EditorDeTeste id={null} vaga={vaga?.id ?? null} />
      </div>
    </div>
  );
}
