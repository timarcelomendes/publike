import { lerBusca, metadadosDaBusca, RotaDeBusca } from "@/components/pagina-busca";

// Página para o Google: uma área numa cidade (ex.: /servicos/goiania/limpeza).
export async function generateMetadata({ params }: PageProps<"/servicos/[cidade]/[area]">) {
  const { cidade, area } = await params;
  return metadadosDaBusca(lerBusca("servico", cidade, area));
}

export default function Pagina({ params }: PageProps<"/servicos/[cidade]/[area]">) {
  return <RotaDeBusca tipo="servico" params={params} />;
}
