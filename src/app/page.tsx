import { Suspense } from "react";
import { Explorar, ExplorarEsqueleto } from "@/components/explorar/explorar";
import { ComoFuncionaResumo, HeroInicio } from "@/components/inicio";

export default function Inicio({ searchParams }: PageProps<"/">) {
  return (
    <>
      <HeroInicio />
      <Suspense fallback={<ExplorarEsqueleto />}>
        <Explorar searchParams={searchParams} />
      </Suspense>
      <ComoFuncionaResumo />
    </>
  );
}
