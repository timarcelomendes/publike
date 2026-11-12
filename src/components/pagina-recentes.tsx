import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SITE_URL } from "@/lib/config";
import {
  caminhoDaBusca,
  caminhoDasRecentes,
  cidadeDoSlug,
  CIDADES_PRINCIPAIS,
  DIAS_RECENTES,
} from "@/lib/paginas-busca";
import { anunciosNoAr } from "@/lib/servidor/paginas-busca";
import { agoraDaRequisicao } from "@/lib/tempo";
import { CardAnuncio } from "./card-anuncio";
import { DadosEstruturados } from "./dados-estruturados";
import { AvisarBusca } from "./explorar/avisar-busca";
import { Container } from "./ui/basicos";
import { IMAGEM_DO_SITE } from "@/lib/seo";

// As vagas novas da cidade (claude/plano-vagas-dos-ultimos-3-dias.md): "vagas de emprego em Senador Canedo nos
// últimos 3 dias". Mesmo endereço das páginas de área e de função (/vagas/goiania/ultimos-3-dias); a lista é a da
// busca (15 minutos de cache) e o corte dos 3 dias usa a hora da requisição.

const DIA = 24 * 60 * 60 * 1000;

/** A cidade do endereço (cidade inválida: 404). */
export function lerRecentes(slugCidade: string) {
  const cidade = cidadeDoSlug(slugCidade);
  if (!cidade) notFound();
  return cidade;
}

function titulo(cidade: string) {
  return `Vagas de emprego em ${cidade} nos últimos ${DIAS_RECENTES} dias`;
}

export function metadadosDasRecentes(cidade: string): Metadata {
  const caminho = caminhoDasRecentes(cidade);
  const descricao = `As vagas de emprego que abriram em ${cidade} (GO) nos últimos ${DIAS_RECENTES} dias: com carteira, temporárias e diárias, perto de casa. Candidate-se grátis pelo Publike.`;
  return {
    title: titulo(cidade),
    description: descricao,
    alternates: { canonical: caminho },
    openGraph: {
      images: [IMAGEM_DO_SITE],
      title: `${titulo(cidade)} · Publike`,
      description: descricao,
      url: caminho,
      type: "website",
    },
  };
}

export function PaginaDasRecentes({ cidade }: { cidade: string }) {
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
                name: `Últimos ${DIAS_RECENTES} dias`,
                item: `${SITE_URL}${caminhoDasRecentes(cidade)}`,
              },
            ],
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
          <li aria-current="page">Últimos {DIAS_RECENTES} dias</li>
        </ol>
      </nav>
      <h1 className="mt-3 max-w-4xl text-h2 sm:text-h1">{titulo(cidade)}</h1>
      <Suspense fallback={<div aria-hidden className="mt-6 h-56 animate-pulse rounded-lg bg-surface-300" />}>
        <Conteudo cidade={cidade} />
      </Suspense>
    </Container>
  );
}

async function Conteudo({ cidade }: { cidade: string }) {
  const [todas, agora] = await Promise.all([anunciosNoAr("vaga", cidade), agoraDaRequisicao()]);
  const daCidade = todas
    .filter((a) => a.cidade === cidade)
    .sort((x, y) => Date.parse(y.criado_em ?? "") - Date.parse(x.criado_em ?? ""));
  const corte = agora - DIAS_RECENTES * DIA;
  const novas = daCidade.filter((a) => a.criado_em && Date.parse(a.criado_em) >= corte);
  const lista = novas.length > 0 ? novas : daCidade.slice(0, 6);
  const outras = CIDADES_PRINCIPAIS.filter((c) => c !== cidade);

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-body text-ink-muted">
        <span>
          {novas.length === 0
            ? `Nenhuma vaga nova nos últimos ${DIAS_RECENTES} dias em ${cidade}.`
            : `${novas.length === 1 ? "1 vaga nova" : `${novas.length} vagas novas`} nos últimos ${DIAS_RECENTES} dias. Curtir é se candidatar, de graça.`}
        </span>
        <AvisarBusca caminho="/?tipo=vaga" salvaId={null} logado={false} />
      </div>

      {lista.length > 0 ? (
        <>
          {novas.length === 0 && <h2 className="mt-6 text-h3">As vagas mais recentes em {cidade}</h2>}
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lista.map((a) => (
              <li key={a.id} className="grid">
                <CardAnuncio anuncio={a} agora={agora} usuarioId={null} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-line-strong p-6 text-body">
          Ainda não há vagas no ar em {cidade}. Toque em “Me avise de vagas assim” e o Publike avisa quando abrir.
        </p>
      )}

      <p className="mt-8 text-body">
        Veja também{" "}
        <Link href={caminhoDaBusca("vaga", cidade)} className="font-semibold underline underline-offset-2">
          todas as vagas em {cidade}
        </Link>
        , por área, função e bairro.
      </p>

      <section aria-labelledby="outras-cidades" className="mt-10">
        <h2 id="outras-cidades" className="text-h3">
          Vagas dos últimos {DIAS_RECENTES} dias em outras cidades
        </h2>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-body-sm">
          {outras.map((c) => (
            <li key={c}>
              <Link href={caminhoDasRecentes(c)} className="underline underline-offset-2 hover:text-terra-text">
                {c}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
