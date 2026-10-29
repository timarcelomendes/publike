import { ChevronRight, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BAIRROS } from "@/lib/bairros";
import { SITE_URL } from "@/lib/config";
import type { Cidade } from "@/lib/constantes";
import { distanciaKm } from "@/lib/descobrir";
import { nomeDoBairro } from "@/lib/formato";
import { caminhoDaBusca, caminhoDoBairro, cidadeDoSlug, slugDaCidade } from "@/lib/paginas-busca";
import { anunciosNoAr, type AnuncioNoAr } from "@/lib/servidor/paginas-busca";
import { agoraDaRequisicao } from "@/lib/tempo";
import { CardAnuncio } from "./card-anuncio";
import { DadosEstruturados } from "./dados-estruturados";
import { BotaoLink } from "./ui/botao";
import { Container } from "./ui/basicos";

// Página para o Google e as IAs: as vagas de um bairro (/vagas/goiania/bairro/setor-bueno), com as dos bairros
// perto (até 4 km) quando o bairro tem poucas. O bairro sai das vagas no ar ou da lista de bairros da cidade.

const PERTO_KM = 4;

type Bairro = { cidade: string; slug: string };

function lerBairro(slugCidade: string, slugBairro: string): Bairro {
  const cidade = cidadeDoSlug(slugCidade);
  if (!cidade || !/^[a-z0-9-]{2,80}$/.test(slugBairro)) notFound();
  return { cidade, slug: slugBairro };
}

/** As vagas da cidade, as do bairro e o nome do bairro (das vagas ou da lista da cidade). */
async function dadosDoBairro({ cidade, slug }: Bairro) {
  const daCidade = (await anunciosNoAr("vaga", cidade)).filter((a) => a.cidade === cidade);
  const doBairro = daCidade.filter((a) => a.bairro && slugDaCidade(a.bairro) === slug);
  const conhecido = (BAIRROS[cidade as Cidade] ?? []).find((b) => slugDaCidade(b) === slug);
  const nome = doBairro[0]?.bairro ? nomeDoBairro(doBairro[0].bairro) : (conhecido ?? null);
  return { daCidade, doBairro, nome };
}

/** As vagas de outros bairros a até 4 km do meio das vagas deste, as mais perto primeiro (no máximo 12). */
function vagasPerto(daCidade: AnuncioNoAr[], doBairro: AnuncioNoAr[]) {
  const pontos = doBairro.filter((a) => a.lat !== null && a.lng !== null);
  if (!pontos.length) return [];
  const lat = pontos.reduce((s, a) => s + (a.lat as number), 0) / pontos.length;
  const lng = pontos.reduce((s, a) => s + (a.lng as number), 0) / pontos.length;
  const ids = new Set(doBairro.map((a) => a.id));
  return daCidade
    .filter((a) => !ids.has(a.id) && a.lat !== null && a.lng !== null)
    .map((a) => ({ a, km: distanciaKm(lat, lng, a.lat as number, a.lng as number) }))
    .filter((x) => x.km <= PERTO_KM)
    .sort((x, y) => x.km - y.km)
    .slice(0, 12)
    .map((x) => x.a);
}

export async function metadadosDoBairro(slugCidade: string, slugBairro: string): Promise<Metadata> {
  const b = lerBairro(slugCidade, slugBairro);
  const { doBairro, nome } = await dadosDoBairro(b);
  if (!nome) return { title: `Vagas em ${b.cidade}`, robots: { index: false, follow: true } };
  const total = doBairro.length;
  const titulo = `Vagas de emprego no ${nome}, ${b.cidade}`;
  const descricao = `${total > 0 ? `${total === 1 ? "1 vaga" : `${total} vagas`} no ${nome}` : `Vagas perto do ${nome}`}, ${b.cidade} (GO): carteira assinada, diárias e freelances perto de casa. Candidate-se grátis pelo Publike.`;
  const caminho = caminhoDoBairro(b.cidade, nome);
  return {
    title: titulo,
    description: descricao,
    alternates: { canonical: caminho },
    openGraph: { title: `${titulo} · Publike`, description: descricao, url: caminho, type: "website" },
    // bairro sem vaga: o Google não precisa listar
    robots: total === 0 ? { index: false, follow: true } : undefined,
  };
}

/** A rota: lê a cidade e o bairro dentro de um Suspense (o Next 16 exige, para pré-montar a página). */
export function RotaDoBairro({ params }: { params: Promise<{ cidade: string; bairro: string }> }) {
  return (
    <Container className="py-8 sm:py-10">
      <Suspense fallback={<div aria-hidden className="h-96 animate-pulse rounded-lg bg-surface-300" />}>
        <PaginaDoBairro params={params} />
      </Suspense>
    </Container>
  );
}

async function PaginaDoBairro({ params }: { params: Promise<{ cidade: string; bairro: string }> }) {
  const { cidade: slugCidade, bairro: slugBairro } = await params;
  const b = lerBairro(slugCidade, slugBairro);
  const [{ daCidade, doBairro, nome }, agora] = await Promise.all([dadosDoBairro(b), agoraDaRequisicao()]);
  if (!nome) notFound();
  const perto = doBairro.length < 6 ? vagasPerto(daCidade, doBairro) : [];
  const total = doBairro.length;
  const dados = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Início", item: `${SITE_URL}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: `Vagas em ${b.cidade}`,
          item: `${SITE_URL}${caminhoDaBusca("vaga", b.cidade)}`,
        },
        { "@type": "ListItem", position: 3, name: nome, item: `${SITE_URL}${caminhoDoBairro(b.cidade, nome)}` },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: [...doBairro, ...perto].slice(0, 50).map((a, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_URL}/anuncio/${a.id}`,
        name: a.titulo,
      })),
    },
  ];
  return (
    <>
      <DadosEstruturados dados={dados} />
      <nav aria-label="Você está em" className="text-body-sm text-ink-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/" className="hover:text-ink hover:underline">
              Início
            </Link>
          </li>
          <ChevronRight aria-hidden className="size-4" />
          <li>
            <Link href={caminhoDaBusca("vaga", b.cidade)} className="hover:text-ink hover:underline">
              Vagas em {b.cidade}
            </Link>
          </li>
          <ChevronRight aria-hidden className="size-4" />
          <li aria-current="page">{nome}</li>
        </ol>
      </nav>
      <h1 className="mt-3 max-w-4xl text-h2 sm:text-h1">
        Vagas de emprego no {nome}, {b.cidade}
      </h1>
      <p className="mt-2 max-w-3xl text-body text-ink-muted">
        {total === 0
          ? `Ainda não há vaga no ar no ${nome}.`
          : `${total === 1 ? "1 vaga" : `${total} vagas`} no ar no ${nome} agora.`}{" "}
        Curtir é se candidatar, de graça. Se quem publicou aceitar, o WhatsApp dos dois aparece.
      </p>
      {total > 0 && (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {doBairro.map((a) => (
            <li key={a.id} className="grid">
              <CardAnuncio anuncio={a} agora={agora} usuarioId={null} />
            </li>
          ))}
        </ul>
      )}
      {perto.length > 0 && (
        <section aria-labelledby="perto" className="mt-10">
          <h2 id="perto" className="text-h3">
            Perto do {nome}
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {perto.map((a) => (
              <li key={a.id} className="grid">
                <CardAnuncio anuncio={a} agora={agora} usuarioId={null} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="mt-8 flex flex-wrap gap-3">
        <BotaoLink href="/?tipo=vaga" variante="primario">
          <MapPin aria-hidden />
          Ver no mapa, perto de casa
        </BotaoLink>
        <BotaoLink href={caminhoDaBusca("vaga", b.cidade)}>Todas as vagas em {b.cidade}</BotaoLink>
      </div>
    </>
  );
}
