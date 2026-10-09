import { Suspense } from "react";
import { BuscaEsqueleto, BuscaExplorar, Explorar, ExplorarEsqueleto } from "@/components/explorar/explorar";
import { ComoFuncionaResumo, HeroInicio } from "@/components/inicio";
import { Container } from "@/components/ui/basicos";

export default function Inicio({ searchParams }: PageProps<"/">) {
  return (
    <>
      {/* Título e busca no mesmo bloco: no celular, os anúncios começam logo abaixo */}
      <section className="border-b border-line pb-5 sm:pb-6">
        <Container className="pt-6 sm:pt-12">
          <HeroInicio />
          <Suspense fallback={<BuscaEsqueleto />}>
            <BuscaExplorar searchParams={searchParams} />
          </Suspense>
        </Container>
      </section>
      <Suspense fallback={<ExplorarEsqueleto />}>
        <Explorar searchParams={searchParams} />
      </Suspense>
      <ComoFuncionaResumo />
    </>
  );
}
