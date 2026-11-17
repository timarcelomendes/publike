import { lerBusca, metadadosDaBusca, RotaDeBusca } from "@/components/pagina-busca";
import { CIDADES_PRINCIPAIS, slugDaCidade } from "@/lib/paginas-busca";

// Página para o Google: serviços e profissionais numa cidade (ex.: /servicos/goiania).
// As cidades já montadas no build (17/11/2026): a página sai pronta do cache, sem esperar a cidade do endereço
export function generateStaticParams() {
  return CIDADES_PRINCIPAIS.map((c) => ({ cidade: slugDaCidade(c) }));
}

export async function generateMetadata({ params }: PageProps<"/servicos/[cidade]">) {
  const { cidade } = await params;
  return metadadosDaBusca(lerBusca("servico", cidade));
}

export default function Pagina({ params }: PageProps<"/servicos/[cidade]">) {
  return <RotaDeBusca tipo="servico" params={params} />;
}
