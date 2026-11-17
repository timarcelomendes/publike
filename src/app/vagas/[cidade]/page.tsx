import { lerBusca, metadadosDaBusca, RotaDeBusca } from "@/components/pagina-busca";
import { CIDADES_PRINCIPAIS, slugDaCidade } from "@/lib/paginas-busca";

// Página para o Google: vagas de emprego numa cidade (ex.: /vagas/goiania).
// As cidades já montadas no build (17/11/2026, "deixe a performance invejável"): sem elas, a cidade do endereço só era
// lida na hora, e a página inteira chegava depois do topo, escondida no fim do HTML. Montada, sai pronta do cache.
export function generateStaticParams() {
  return CIDADES_PRINCIPAIS.map((c) => ({ cidade: slugDaCidade(c) }));
}

export async function generateMetadata({ params }: PageProps<"/vagas/[cidade]">) {
  const { cidade } = await params;
  return metadadosDaBusca(lerBusca("vaga", cidade));
}

export default function Pagina({ params }: PageProps<"/vagas/[cidade]">) {
  return <RotaDeBusca tipo="vaga" params={params} />;
}
