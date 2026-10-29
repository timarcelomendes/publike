import type { Metadata } from "next";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { OfertaRecurso } from "@/components/recurso-pago";
import { SoComSupabase } from "@/components/so-com-supabase";
import { EditorDeTeste } from "@/components/testes/editor-teste";
import { vagaDaVolta, VoltarParaOsTestes, VoltarParaVaga } from "@/components/testes/voltar-para-vaga";
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
  if (recursos && !recursos.testes.liberado) return <OfertaRecurso recurso="testes" estado={recursos.testes} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <VoltarParaOsTestes vaga={vaga} />
        {vaga && <VoltarParaVaga vaga={vaga} />}
      </div>
      <h2 className="text-h2">Novo teste da sua empresa</h2>
      {/* criado pela vaga: depois de salvar, volta para os testes dela com o teste novo escolhido */}
      <EditorDeTeste id={null} vaga={vaga?.id ?? null} />
    </div>
  );
}
