import { ChevronRight, FileText, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/config";
import { caminhoDaAreaContabil, caminhoDaBusca, vagaDaAreaContabil } from "@/lib/paginas-busca";
import { anunciosNoAr } from "@/lib/servidor/paginas-busca";
import { agoraDaPaginaPublica } from "@/lib/tempo";
import { linkDasVagasContabeis } from "@/lib/whatsapp-oficial";
import { IMAGEM_DO_SITE } from "@/lib/seo";
import { CardAnuncio } from "./card-anuncio";
import { DadosEstruturados } from "./dados-estruturados";
import { AvisarBusca } from "./explorar/avisar-busca";
import { CARTOES_INTEIROS, ListaLeveDeAnuncios } from "./lista-leve-de-anuncios";
import { BotaoLink } from "./ui/botao";
import { Container } from "./ui/basicos";

// Contábil, fiscal e departamento pessoal na região (27/11/2026; Marcelo: "queria que os perfis mais qualificados
// também chegassem, contábil e fiscal tem muita vaga"): as vagas da área no ar na praça da cidade (em Goiânia, também
// Aparecida e as vizinhas), o caminho pelo WhatsApp com o currículo em PDF e as perguntas de quem é da área. É a página
// do Google, do anúncio da área e da lista que vai às faculdades, ao CRC-GO e ao Sescon-GO.

const PERGUNTAS = [
  {
    p: "Que vagas aparecem aqui?",
    r: "As vagas no ar no Publike de contabilidade, fiscal e tributário, departamento pessoal e folha de pagamento, faturamento, financeiro, contas a pagar e a receber e controladoria, de auxiliar a analista, em escritórios de contabilidade e em empresas da região.",
  },
  {
    p: "Já tenho currículo em PDF. Preciso preencher tudo de novo?",
    r: "Não. Mande o PDF pelo WhatsApp do Publike ou envie no site, em Meu currículo: o Publike lê o arquivo e monta o currículo para você só conferir. Também dá para mandar uma foto de cada página.",
  },
  {
    p: "Como me candidato?",
    r: "Curta a vaga. Quem publicou vê o seu currículo e, se aceitar, vocês conversam pelo chat do Publike ou pelo WhatsApp. É grátis para quem procura emprego, sempre.",
  },
  {
    p: "Sou estudante de Ciências Contábeis. Tem vaga para mim?",
    r: "Tem: as de auxiliar e as de estágio aparecem aqui quando estão no ar. Toque em “Me avise de vagas assim” para saber das novas.",
  },
];

async function vagasDaArea(cidade: string) {
  return (await anunciosNoAr("vaga", cidade)).filter((a) => vagaDaAreaContabil(a.titulo));
}

function titulo(cidade: string) {
  return `Vagas de contábil, fiscal e DP em ${cidade} e região`;
}

export async function metadadosDaAreaContabil(cidade: string): Promise<Metadata> {
  const vagas = await vagasDaArea(cidade);
  const caminho = caminhoDaAreaContabil(cidade);
  const quantas = vagas.length === 0 ? "Vagas" : vagas.length === 1 ? "1 vaga" : `${vagas.length} vagas`;
  const descricao = `${quantas} de auxiliar e analista contábil, fiscal, de departamento pessoal e financeiro em ${cidade} (GO) e região, com o salário. Candidate-se de graça, com o seu currículo em PDF.`;
  return {
    title: `${titulo(cidade)}: vagas abertas`,
    description: descricao,
    alternates: { canonical: caminho },
    openGraph: {
      images: [IMAGEM_DO_SITE],
      title: `${titulo(cidade)} · Publike`,
      description: descricao,
      url: caminho,
      type: "website",
    },
    robots: cidade === "Goiânia" || vagas.length > 0 ? undefined : { index: false, follow: true },
  };
}

export function PaginaDaAreaContabil({ cidade }: { cidade: string }) {
  return (
    <Container className="py-8 sm:py-10">
      <DadosEstruturados
        dados={[
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Início", item: SITE_URL },
              {
                "@type": "ListItem",
                position: 2,
                name: `Vagas em ${cidade}`,
                item: `${SITE_URL}${caminhoDaBusca("vaga", cidade)}`,
              },
              {
                "@type": "ListItem",
                position: 3,
                name: "Contábil, fiscal e DP",
                item: `${SITE_URL}${caminhoDaAreaContabil(cidade)}`,
              },
            ],
          },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: PERGUNTAS.map((q) => ({
              "@type": "Question",
              name: q.p,
              acceptedAnswer: { "@type": "Answer", text: q.r },
            })),
          },
        ]}
      />
      <nav aria-label="Você está em" className="text-body-sm text-ink-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/" className="hover:text-ink hover:underline">
              Início
            </Link>
          </li>
          <ChevronRight aria-hidden className="size-4" />
          <li>
            <Link href={caminhoDaBusca("vaga", cidade)} className="hover:text-ink hover:underline">
              Vagas em {cidade}
            </Link>
          </li>
          <ChevronRight aria-hidden className="size-4" />
          <li aria-current="page">Contábil, fiscal e DP</li>
        </ol>
      </nav>
      <h1 className="mt-3 max-w-4xl text-h2 sm:text-h1">{titulo(cidade)}</h1>
      <Vagas cidade={cidade} />

      <section
        aria-labelledby="pelo-whatsapp"
        className="mt-10 flex max-w-3xl flex-col gap-3 rounded-lg border border-line bg-surface-100 p-5"
      >
        <h2 id="pelo-whatsapp" className="flex items-center gap-2 text-h3">
          <FileText aria-hidden className="size-5 text-cerrado-text" />
          Tem o currículo em PDF? Mande e pronto
        </h2>
        <p className="text-body">
          Pelo WhatsApp do Publike, você recebe as vagas da área com o salário e manda o seu currículo em PDF: o Publike lê
          o arquivo e monta o seu perfil para as empresas da região acharem você. Sem formulário comprido.
        </p>
        <div>
          <BotaoLink href={linkDasVagasContabeis()} variante="primario">
            <MessageCircle aria-hidden />
            Receber as vagas no WhatsApp
          </BotaoLink>
        </div>
      </section>

      <section aria-labelledby="perguntas" className="mt-12 max-w-3xl">
        <h2 id="perguntas" className="text-h3">
          Perguntas frequentes
        </h2>
        <dl className="mt-3 flex flex-col gap-4">
          {PERGUNTAS.map((q) => (
            <div key={q.p}>
              <dt className="text-label">{q.p}</dt>
              <dd className="mt-1 text-body text-ink-muted">{q.r}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="para-quem-contrata" className="mt-10 max-w-3xl rounded-lg border border-line p-5">
        <h2 id="para-quem-contrata" className="text-h3">
          Escritório de contabilidade contratando?
        </h2>
        <p className="mt-2 text-body">
          Publique a vaga de graça. Quem é da área e mora perto curte, você vê o currículo e decide quem chama.
        </p>
        <div className="mt-4">
          <BotaoLink href="/publicar">Publicar vaga grátis</BotaoLink>
        </div>
      </section>
    </Container>
  );
}

async function Vagas({ cidade }: { cidade: string }) {
  const [vagas, agora] = await Promise.all([vagasDaArea(cidade), agoraDaPaginaPublica()]);
  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-body text-ink-muted">
        <span>
          {vagas.length === 0
            ? `Nenhuma vaga da área no ar em ${cidade} agora.`
            : `${vagas.length === 1 ? "1 vaga no ar" : `${vagas.length} vagas no ar`}, de auxiliar a analista. Curtir é se candidatar, de graça.`}
        </span>
        <AvisarBusca caminho="/?tipo=vaga&categoria=financeiro" salvaId={null} logado={false} />
      </div>
      {vagas.length > 0 ? (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vagas.slice(0, CARTOES_INTEIROS).map((a) => (
            <li key={a.id} className="grid">
              <CardAnuncio anuncio={a} agora={agora} usuarioId={null} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-line-strong p-6 text-body">
          Toque em “Me avise de vagas assim” e o Publike avisa quando abrir. Enquanto isso, veja{" "}
          <Link href={caminhoDaBusca("vaga", cidade)} className="font-semibold underline underline-offset-2">
            todas as vagas em {cidade}
          </Link>
          .
        </p>
      )}
      <ListaLeveDeAnuncios
        anuncios={vagas.slice(CARTOES_INTEIROS)}
        agora={agora}
        titulo={`Mais ${vagas.length - CARTOES_INTEIROS} vagas da área`}
      />
    </>
  );
}
