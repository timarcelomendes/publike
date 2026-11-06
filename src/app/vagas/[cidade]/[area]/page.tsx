import { notFound } from "next/navigation";
import { Suspense } from "react";
import { lerBusca, metadadosDaBusca, PaginaDeBusca } from "@/components/pagina-busca";
import { lerFuncao, metadadosDaFuncao, PaginaDeFuncao } from "@/components/pagina-funcao";
import { Container } from "@/components/ui/basicos";
import { areaDoSlug } from "@/lib/paginas-busca";

// Página para o Google: uma área numa cidade (ex.: /vagas/goiania/limpeza) ou, no mesmo lugar, uma função
// (/vagas/goiania/frentista; claude/plano-vagas-por-funcao.md). O nome decide: área primeiro, depois função.
export async function generateMetadata({ params }: PageProps<"/vagas/[cidade]/[area]">) {
  const { cidade, area } = await params;
  if (areaDoSlug(area)) return metadadosDaBusca(lerBusca("vaga", cidade, area));
  const funcao = await lerFuncao(cidade, area);
  if (!funcao) notFound();
  return metadadosDaFuncao(funcao);
}

export default function Pagina({ params }: PageProps<"/vagas/[cidade]/[area]">) {
  return (
    <Suspense
      fallback={
        <Container className="py-8 sm:py-10">
          <div aria-hidden className="h-56 animate-pulse rounded-lg bg-surface-300" />
        </Container>
      }
    >
      <AreaOuFuncao params={params} />
    </Suspense>
  );
}

async function AreaOuFuncao({ params }: { params: PageProps<"/vagas/[cidade]/[area]">["params"] }) {
  const { cidade, area } = await params;
  if (areaDoSlug(area)) return <PaginaDeBusca {...lerBusca("vaga", cidade, area)} />;
  const funcao = await lerFuncao(cidade, area);
  if (!funcao) notFound();
  return <PaginaDeFuncao {...funcao} />;
}
