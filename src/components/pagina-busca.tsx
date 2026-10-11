import { ChevronRight, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SITE_URL } from "@/lib/config";
import { CATEGORIAS, type Categoria } from "@/lib/constantes";
import {
  areaDoSlug,
  caminhoDaBusca,
  cidadeDoSlug,
  CIDADES_PRINCIPAIS,
  descricaoDaBusca,
  introDaBusca,
  slugDaCidade,
  tituloDaBusca,
} from "@/lib/paginas-busca";
import { anunciosNoAr } from "@/lib/servidor/paginas-busca";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { AnuncioResumo, TipoAnuncio } from "@/lib/tipos";
import { CardAnuncio } from "./card-anuncio";
import { BotaoLink } from "./ui/botao";
import { Container } from "./ui/basicos";

type Busca = { tipo: TipoAnuncio; cidade: string; area: (typeof CATEGORIAS)[number] | null };

/** Confere o endereço (cidade e área que existem). "Outros" não tem página. */
export function lerBusca(tipo: TipoAnuncio, slugCidade: string, slugArea?: string): Busca {
  const cidade = cidadeDoSlug(slugCidade);
  const area = slugArea ? areaDoSlug(slugArea) : null;
  if (!cidade || (slugArea && (!area || area.slug === "outros"))) notFound();
  return { tipo, cidade, area };
}

function filtrar(lista: AnuncioResumo[], cidade: string, area: Categoria | null) {
  return lista.filter((a) => a.cidade === cidade && (!area || a.categoria === area));
}

export async function metadadosDaBusca({ tipo, cidade, area }: Busca): Promise<Metadata> {
  const total = filtrar(await anunciosNoAr(tipo), cidade, area?.slug ?? null).length;
  const titulo = tituloDaBusca(tipo, cidade, area?.nome ?? null);
  const descricao = descricaoDaBusca(tipo, cidade, area?.nome ?? null, total);
  const caminho = caminhoDaBusca(tipo, cidade, area?.slug);
  // página de área (ou de cidade pequena) sem nenhum anúncio: o Google não precisa listar
  const vazia = total === 0 && (area !== null || !CIDADES_PRINCIPAIS.includes(cidade));
  return {
    title: titulo,
    description: descricao,
    alternates: { canonical: caminho },
    openGraph: { title: `${titulo} · Publike`, description: descricao, url: caminho, type: "website" },
    robots: vazia ? { index: false, follow: true } : undefined,
  };
}

/**
 * A rota: lê a cidade e a área do endereço dentro de um Suspense (o Next 16 exige,
 * para pré-montar a página).
 */
export function RotaDeBusca({
  tipo,
  params,
}: {
  tipo: TipoAnuncio;
  params: Promise<{ cidade: string; area?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <Container className="py-8 sm:py-10">
          <ListaEsqueleto />
        </Container>
      }
    >
      <BuscaDoEndereco tipo={tipo} params={params} />
    </Suspense>
  );
}

async function BuscaDoEndereco({
  tipo,
  params,
}: {
  tipo: TipoAnuncio;
  params: Promise<{ cidade: string; area?: string }>;
}) {
  const { cidade, area } = await params;
  return <PaginaDeBusca {...lerBusca(tipo, cidade, area)} />;
}

/** A página toda: título, anúncios, áreas e cidades vizinhas. */
export function PaginaDeBusca(busca: Busca) {
  const { tipo, cidade, area } = busca;
  const titulo = tituloDaBusca(tipo, cidade, area?.nome ?? null);
  const vaga = tipo === "vaga";
  return (
    <Container className="py-8 sm:py-10">
      <nav aria-label="Você está em" className="text-body-sm text-ink-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/" className="hover:text-ink hover:underline">
              Início
            </Link>
          </li>
          <ChevronRight aria-hidden className="size-4" />
          <li>
            {area ? (
              <Link href={caminhoDaBusca(tipo, cidade)} className="hover:text-ink hover:underline">
                {vaga ? "Vagas" : "Serviços"} em {cidade}
              </Link>
            ) : (
              <span aria-current="page">
                {vaga ? "Vagas" : "Serviços"} em {cidade}
              </span>
            )}
          </li>
          {area && (
            <>
              <ChevronRight aria-hidden className="size-4" />
              <li aria-current="page">{area.nome}</li>
            </>
          )}
        </ol>
      </nav>

      <h1 className="mt-3 max-w-4xl text-h1 sm:text-display">{titulo}</h1>

      <Suspense fallback={<ListaEsqueleto />}>
        <Conteudo {...busca} />
      </Suspense>
    </Container>
  );
}

async function Conteudo({ tipo, cidade, area }: Busca) {
  const [todos, agora] = await Promise.all([anunciosNoAr(tipo), agoraDaRequisicao()]);
  const daCidade = todos.filter((a) => a.cidade === cidade);
  const itens = area ? daCidade.filter((a) => a.categoria === area.slug) : daCidade;
  const vaga = tipo === "vaga";
  const caminho = caminhoDaBusca(tipo, cidade, area?.slug);

  // áreas com anúncio nesta cidade, e cidades com anúncio (para os links)
  const porArea = CATEGORIAS.filter((c) => c.slug !== "outros")
    .map((c) => ({ ...c, total: daCidade.filter((a) => a.categoria === c.slug).length }))
    .filter((c) => c.total > 0);
  const contagemCidades = new Map<string, number>();
  for (const a of todos) {
    if (!area || a.categoria === area.slug) contagemCidades.set(a.cidade, (contagemCidades.get(a.cidade) ?? 0) + 1);
  }
  const outrasCidades = [...new Set([...CIDADES_PRINCIPAIS, ...contagemCidades.keys()])]
    .filter((c) => c !== cidade && cidadeDoSlug(slugDaCidade(c)) !== null)
    .map((c) => ({ cidade: c, total: contagemCidades.get(c) ?? 0 }))
    .filter((c) => c.total > 0 || (!area && CIDADES_PRINCIPAIS.includes(c.cidade)));

  const verNoMapa = `/?tipo=${tipo}${area ? `&categoria=${area.slug}` : ""}`;
  const dados = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Início", item: `${SITE_URL}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: `${vaga ? "Vagas" : "Serviços"} em ${cidade}`,
          item: `${SITE_URL}${caminhoDaBusca(tipo, cidade)}`,
        },
        ...(area ? [{ "@type": "ListItem", position: 3, name: area.nome, item: `${SITE_URL}${caminho}` }] : []),
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: itens.slice(0, 50).map((a, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_URL}/anuncio/${a.id}`,
        name: a.titulo,
      })),
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(dados).replace(/</g, "\\u003c") }}
      />
      <p className="mt-3 max-w-3xl text-body-lg text-ink-muted">
        {introDaBusca(tipo, cidade, area?.nome ?? null, itens.length)}
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <BotaoLink href={verNoMapa} variante="primario">
          <MapPin aria-hidden />
          Ver no mapa, perto de casa
        </BotaoLink>
        <BotaoLink href={vaga ? "/publicar" : "/painel/servicos"}>
          {vaga ? "Publicar vaga grátis" : "Oferecer meus serviços"}
        </BotaoLink>
      </div>

      {itens.length > 0 ? (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {itens.map((a) => (
            <li key={a.id} className="grid">
              <CardAnuncio anuncio={a} agora={agora} usuarioId={null} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-8 rounded-lg border border-dashed border-line-strong p-6 text-body">
          <p>
            {vaga
              ? `Ainda não há vagas${area ? ` de ${area.nome.toLowerCase()}` : ""} em ${cidade} no Publike.`
              : `Ainda não há profissionais${area ? ` de ${area.nome.toLowerCase()}` : ""} em ${cidade} no Publike.`}{" "}
            {area ? (
              <Link href={caminhoDaBusca(tipo, cidade)} className="font-semibold underline underline-offset-2">
                Veja todas as {vaga ? "vagas" : "áreas"} em {cidade}
              </Link>
            ) : (
              <Link href={`/?tipo=${tipo}`} className="font-semibold underline underline-offset-2">
                Veja o que há na região
              </Link>
            )}
            .
          </p>
        </div>
      )}

      {porArea.length > 0 && (
        <section aria-labelledby="por-area" className="mt-12">
          <h2 id="por-area" className="text-h3">
            {vaga ? "Vagas" : "Serviços"} em {cidade} por área
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {porArea.map((c) => (
              <li key={c.slug}>
                <Link
                  href={caminhoDaBusca(tipo, cidade, c.slug)}
                  aria-current={area?.slug === c.slug ? "page" : undefined}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3.5 text-body-sm transition-colors ${
                    area?.slug === c.slug
                      ? "border-ink bg-ink text-surface-100"
                      : "border-line-strong bg-surface-200 hover:bg-surface-300"
                  }`}
                >
                  {c.nome}
                  <span className={area?.slug === c.slug ? "" : "text-ink-muted"}>({c.total})</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {outrasCidades.length > 0 && (
        <section aria-labelledby="outras-cidades" className="mt-10">
          <h2 id="outras-cidades" className="text-h3">
            {area ? `${area.nome} em` : vaga ? "Vagas em" : "Serviços em"} outras cidades
          </h2>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-body-sm">
            {outrasCidades.map(({ cidade: c, total }) => (
              <li key={c}>
                <Link
                  href={caminhoDaBusca(tipo, c, area?.slug)}
                  className="underline underline-offset-2 hover:text-terra-text"
                >
                  {c}
                </Link>
                {total > 0 && <span className="text-ink-muted"> ({total})</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-10 text-body-sm text-ink-muted">
        {vaga ? "Procurando quem faça um serviço? " : "Procurando trabalho? "}
        <Link
          href={caminhoDaBusca(vaga ? "servico" : "vaga", cidade, area?.slug)}
          className="text-ink underline underline-offset-2 hover:text-terra-text"
        >
          {vaga ? "Profissionais" : "Vagas"}
          {area ? ` de ${area.nome.toLowerCase()}` : ""} em {cidade}
        </Link>
      </p>
    </>
  );
}

function ListaEsqueleto() {
  return (
    <div aria-hidden className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-56 animate-pulse rounded-lg bg-surface-300" />
      ))}
    </div>
  );
}
