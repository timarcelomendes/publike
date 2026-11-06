import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SITE_URL } from "@/lib/config";
import { caminhoDaBusca, caminhoDosProgramas, CIDADES_PRINCIPAIS, REGIMES_PROGRAMAS } from "@/lib/paginas-busca";
import { anunciosNoAr } from "@/lib/servidor/paginas-busca";
import { agoraDaRequisicao } from "@/lib/tempo";
import { CardAnuncio } from "./card-anuncio";
import { DadosEstruturados } from "./dados-estruturados";
import { AvisarBusca } from "./explorar/avisar-busca";
import { BotaoLink } from "./ui/botao";
import { Container } from "./ui/basicos";

// Estágio e jovem aprendiz na cidade (claude/plano-estagio-e-jovem-aprendiz.md): as vagas no ar de estágio, aprendiz
// e trainee, o que é cada um para quem procura, e o caminho para quem contrata. Goiânia vai sempre para o Google; as
// outras cidades, só com vaga assim no ar.

const PERGUNTAS = [
  {
    p: "Qual a idade do jovem aprendiz?",
    r: "De 14 a 24 anos (para pessoa com deficiência, não há idade máxima). O aprendiz tem carteira assinada e faz um curso de aprendizagem junto com o trabalho, e quem ainda não terminou o ensino médio precisa estar estudando.",
  },
  {
    p: "Estágio tem carteira assinada?",
    r: "Não. O estágio é um contrato com a escola ou a faculdade, para quem está matriculado. Em geral paga bolsa e auxílio-transporte, a jornada vai até 6 horas por dia e há recesso de 30 dias por ano.",
  },
  {
    p: "Precisa de experiência?",
    r: "Não. Estágio e aprendiz são justamente para quem está começando. Conta mais mostrar o que você estuda, os cursos que fez e a vontade de aprender.",
  },
  {
    p: "Como me candidato pelo Publike?",
    r: "Curta a vaga. Quem publicou vê o seu currículo e, se aceitar, vocês conversam pelo chat do Publike. É grátis.",
  },
];

async function vagasDosProgramas(cidade: string) {
  return (await anunciosNoAr("vaga", cidade)).filter(
    (a) => a.cidade === cidade && REGIMES_PROGRAMAS.includes(a.regime ?? ""),
  );
}

function titulo(cidade: string) {
  return `Estágio e jovem aprendiz em ${cidade}`;
}

export async function metadadosDosProgramas(cidade: string): Promise<Metadata> {
  const vagas = await vagasDosProgramas(cidade);
  const caminho = caminhoDosProgramas(cidade);
  const quantas = vagas.length === 0 ? "Vagas" : vagas.length === 1 ? "1 vaga" : `${vagas.length} vagas`;
  const descricao = `${quantas} de estágio e jovem aprendiz em ${cidade} (GO), a diferença entre os dois e como se candidatar de graça. Para empresas: publique a vaga grátis no Publike.`;
  return {
    title: `${titulo(cidade)}: vagas abertas`,
    description: descricao,
    alternates: { canonical: caminho },
    openGraph: { title: `${titulo(cidade)} · Publike`, description: descricao, url: caminho, type: "website" },
    // fora de Goiânia, sem vaga assim no ar, a página abre mas o Google não precisa listar
    robots: cidade === "Goiânia" || vagas.length > 0 ? undefined : { index: false, follow: true },
  };
}

export function PaginaDosProgramas({ cidade }: { cidade: string }) {
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
                name: "Estágio e jovem aprendiz",
                item: `${SITE_URL}${caminhoDosProgramas(cidade)}`,
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
          <li aria-current="page">Estágio e jovem aprendiz</li>
        </ol>
      </nav>
      <h1 className="mt-3 max-w-4xl text-h2 sm:text-h1">{titulo(cidade)}</h1>
      <Suspense fallback={<div aria-hidden className="mt-6 h-56 animate-pulse rounded-lg bg-surface-300" />}>
        <Vagas cidade={cidade} />
      </Suspense>

      <div className="mt-12 grid max-w-5xl gap-8 md:grid-cols-2">
        <section aria-labelledby="para-quem-procura">
          <h2 id="para-quem-procura" className="text-h3">
            Para quem está começando
          </h2>
          <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-body">
            <li>
              <strong>Estágio:</strong> para quem está matriculado no ensino médio, técnico ou na faculdade. Paga bolsa,
              sem carteira assinada, e conta como parte dos estudos.
            </li>
            <li>
              <strong>Jovem aprendiz:</strong> de 14 a 24 anos, com carteira assinada e um curso de aprendizagem junto
              com o trabalho.
            </li>
          </ul>
          <p className="mt-3 text-body">
            Ainda sem currículo? Faça o{" "}
            <Link href="/curriculo-simples" className="font-semibold underline underline-offset-2">
              currículo simples grátis
            </Link>{" "}
            em minutos. E veja o guia{" "}
            <Link href="/conteudos/jovem-aprendiz-goiania" className="font-semibold underline underline-offset-2">
              Jovem aprendiz em Goiânia
            </Link>
            .
          </p>
        </section>
        <section aria-labelledby="para-quem-contrata" className="rounded-lg border border-line bg-surface-100 p-5">
          <h2 id="para-quem-contrata" className="text-h3">
            Sua empresa quer contratar?
          </h2>
          <p className="mt-2 text-body">
            Publique a vaga de estágio ou de aprendiz de graça. Quem mora perto curte, você vê o currículo e decide quem
            chama.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <BotaoLink href="/publicar" variante="primario">
              Publicar vaga grátis
            </BotaoLink>
            <BotaoLink href="/conteudos/contratar-jovem-aprendiz">Como contratar um aprendiz</BotaoLink>
          </div>
        </section>
      </div>

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

      <section aria-labelledby="outras-cidades" className="mt-10">
        <h2 id="outras-cidades" className="text-h3">
          Estágio e jovem aprendiz em outras cidades
        </h2>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-body-sm">
          {CIDADES_PRINCIPAIS.filter((c) => c !== cidade).map((c) => (
            <li key={c}>
              <Link href={caminhoDosProgramas(c)} className="underline underline-offset-2 hover:text-terra-text">
                {c}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </Container>
  );
}

async function Vagas({ cidade }: { cidade: string }) {
  const [vagas, agora] = await Promise.all([vagasDosProgramas(cidade), agoraDaRequisicao()]);
  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-body text-ink-muted">
        <span>
          {vagas.length === 0
            ? `Nenhuma vaga de estágio ou aprendiz no ar em ${cidade} agora.`
            : `${vagas.length === 1 ? "1 vaga no ar" : `${vagas.length} vagas no ar`}. Curtir é se candidatar, de graça.`}
        </span>
        <AvisarBusca caminho="/?tipo=vaga&q=est%C3%A1gio" salvaId={null} logado={false} />
      </div>
      {vagas.length > 0 ? (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vagas.map((a) => (
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
    </>
  );
}
