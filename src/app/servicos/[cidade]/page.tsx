import { lerBusca, metadadosDaBusca, RotaDeBusca } from "@/components/pagina-busca";

// Página para o Google: serviços e profissionais numa cidade (ex.: /servicos/goiania).
export async function generateMetadata({ params }: PageProps<"/servicos/[cidade]">) {
  const { cidade } = await params;
  return metadadosDaBusca(lerBusca("servico", cidade));
}

export default function Pagina({ params }: PageProps<"/servicos/[cidade]">) {
  return <RotaDeBusca tipo="servico" params={params} />;
}
