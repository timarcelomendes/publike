import { lerBusca, metadadosDaBusca, RotaDeBusca } from "@/components/pagina-busca";
import { CATEGORIAS } from "@/lib/constantes";
import { CIDADES_PRINCIPAIS, slugDaCidade } from "@/lib/paginas-busca";

// Página para o Google: uma área numa cidade (ex.: /servicos/goiania/limpeza).
// As áreas das cidades principais já montadas no build (17/11/2026): a página sai pronta do cache
export function generateStaticParams() {
  return CIDADES_PRINCIPAIS.flatMap((c) => CATEGORIAS.map((a) => ({ cidade: slugDaCidade(c), area: a.slug })));
}

export async function generateMetadata({ params }: PageProps<"/servicos/[cidade]/[area]">) {
  const { cidade, area } = await params;
  return metadadosDaBusca(lerBusca("servico", cidade, area));
}

export default function Pagina({ params }: PageProps<"/servicos/[cidade]/[area]">) {
  return <RotaDeBusca tipo="servico" params={params} />;
}
