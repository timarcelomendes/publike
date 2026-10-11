import { lerBusca, metadadosDaBusca, RotaDeBusca } from "@/components/pagina-busca";

// Página para o Google: vagas de emprego numa cidade (ex.: /vagas/goiania).
export async function generateMetadata({ params }: PageProps<"/vagas/[cidade]">) {
  const { cidade } = await params;
  return metadadosDaBusca(lerBusca("vaga", cidade));
}

export default function Pagina({ params }: PageProps<"/vagas/[cidade]">) {
  return <RotaDeBusca tipo="vaga" params={params} />;
}
