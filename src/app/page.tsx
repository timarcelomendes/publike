import { Suspense } from "react";
import { BuscaEsqueleto, BuscaExplorar, Explorar, ExplorarEsqueleto } from "@/components/explorar/explorar";
import { EntendaOPublike, HeroInicio } from "@/components/inicio";
import { ContratacoesNaHome } from "@/components/social/secoes";
import { Container } from "@/components/ui/basicos";
import { SITE_URL } from "@/lib/config";
import { agoraDaRequisicao } from "@/lib/tempo";

// Quem é o Publike, para o Google (nome do site e da organização nos resultados).
const DADOS_SITE = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Publike",
    alternateName: "Publike Goiânia",
    url: `${SITE_URL}/`,
    inLanguage: "pt-BR",
  },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Publike",
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/logo/publike-icone-1024.png`,
    description:
      "Ferramenta gratuita para gerar emprego em Goiânia e região: vagas, diárias, freelances e profissionais do bairro.",
    areaServed: { "@type": "AdministrativeArea", name: "Região Metropolitana de Goiânia, GO" },
  },
];

export default function Inicio({ searchParams }: PageProps<"/">) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(DADOS_SITE) }} />
      {/* Título e busca no mesmo bloco: no celular, os anúncios começam logo abaixo */}
      <section className="border-b border-line pb-5 sm:pb-6">
        <Container className="pt-5 sm:pt-8">
          <HeroInicio />
          <Suspense fallback={<BuscaEsqueleto />}>
            <BuscaExplorar searchParams={searchParams} />
          </Suspense>
        </Container>
      </section>
      <Suspense fallback={<ExplorarEsqueleto />}>
        <Explorar searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={null}>
        <Contratados />
      </Suspense>
      <EntendaOPublike />
    </>
  );
}

/** Gente contratada pelo Publike (com o sim dos dois lados): aparece com 3 ou mais. */
async function Contratados() {
  return <ContratacoesNaHome agora={await agoraDaRequisicao()} />;
}
