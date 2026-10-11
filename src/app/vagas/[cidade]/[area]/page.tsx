import { lerBusca, metadadosDaBusca, RotaDeBusca } from "@/components/pagina-busca";

// Página para o Google: uma área numa cidade (ex.: /vagas/goiania/limpeza).
export async function generateMetadata({ params }: PageProps<"/vagas/[cidade]/[area]">) {
  const { cidade, area } = await params;
  return metadadosDaBusca(lerBusca("vaga", cidade, area));
}

export default function Pagina({ params }: PageProps<"/vagas/[cidade]/[area]">) {
  return <RotaDeBusca tipo="vaga" params={params} />;
}
