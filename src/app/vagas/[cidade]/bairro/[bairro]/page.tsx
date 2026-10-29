import { metadadosDoBairro, RotaDoBairro } from "@/components/pagina-bairro";

// Página para o Google e as IAs: as vagas de um bairro (ex.: /vagas/goiania/bairro/setor-bueno).
export async function generateMetadata({ params }: PageProps<"/vagas/[cidade]/bairro/[bairro]">) {
  const { cidade, bairro } = await params;
  return metadadosDoBairro(cidade, bairro);
}

export default function Pagina({ params }: PageProps<"/vagas/[cidade]/bairro/[bairro]">) {
  return <RotaDoBairro params={params} />;
}
