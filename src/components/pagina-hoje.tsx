import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE_URL } from "@/lib/config";
import { formatarMoeda, formatarNumero } from "@/lib/formato";
import { comMaiuscula } from "@/lib/funcoes-das-paginas";
import {
  caminhoDaBusca,
  caminhoDasRecentes,
  caminhoDeHoje,
  cidadeDoSlug,
  CIDADES_PRINCIPAIS,
  DIAS_RECENTES,
} from "@/lib/paginas-busca";
import { IMAGEM_DO_SITE } from "@/lib/seo";
import { quantasVagas, resumoDoDia, type Contagem, type ResumoDoDia } from "@/lib/servidor/vagas-hoje";
import { CardAnuncio } from "./card-anuncio";
import { DadosEstruturados } from "./dados-estruturados";
import { Container } from "./ui/basicos";

// As vagas de hoje numa cidade (claude/plano-organico.md, item 2): /vagas/goiania/hoje. Os números do dia em frases
// que dá para citar ("Hoje, 18 de novembro, o Publike tem 124 vagas abertas em Goiânia..."), as funções e os bairros
// com mais vagas, as mais novas e as perguntas com resposta direta. É o tipo de página que as IAs citam e o que
// responde "vagas de emprego em Goiânia hoje". Os números saem de resumoDoDia (as vagas da busca, 15 minutos).

const FUSO = "America/Sao_Paulo";
const MAIS = 10;

/** A cidade do endereço (cidade inválida: 404). */
export function lerHoje(slugCidade: string) {
  const cidade = cidadeDoSlug(slugCidade);
  if (!cidade) notFound();
  return cidade;
}

const titulo = (cidade: string) => `Vagas de emprego em ${cidade} hoje`;
const dia = (ms: number) =>
  new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: FUSO }).format(ms);
const hora = (ms: number) =>
  new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: FUSO }).format(ms);

/** "80 com carteira assinada, 10 temporárias e 20 diárias e freelas" (só os grupos com vaga). */
function porRegime(r: ResumoDoDia) {
  const partes = r.porRegime.filter((g) => g.n > 0).map((g) => `${formatarNumero(g.n)} ${g.nome}`);
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} e ${partes.at(-1)}`;
}

/** A frase do dia, a mesma no começo da página, na descrição e na primeira pergunta. */
function fraseDoDia(r: ResumoDoDia) {
  if (r.total === 0) return `Hoje, ${dia(r.quando)}, não há vagas de emprego no ar no Publike em ${r.cidade}.`;
  const regime = porRegime(r);
  const em24h =
    r.novas24h === 0
      ? "Nenhuma foi publicada nas últimas 24 horas"
      : r.novas24h === 1
        ? "1 foi publicada nas últimas 24 horas"
        : `${formatarNumero(r.novas24h)} foram publicadas nas últimas 24 horas`;
  return (
    `Hoje, ${dia(r.quando)}, o Publike tem ${quantasVagas(r.total, r.noLimite)} em ${r.cidade}` +
    `${regime ? `: ${regime}` : ""}. ${em24h}, e ${formatarNumero(r.novas7d)} nos últimos 7 dias.`
  );
}

const listaCurta = (itens: Contagem[], quantos = 5) =>
  itens
    .slice(0, quantos)
    .map((c) => `${c.nome} (${c.n})`)
    .join(", ");

function perguntas(r: ResumoDoDia) {
  const lista = [
    { p: `Quantas vagas de emprego tem em ${r.cidade} hoje?`, r: fraseDoDia(r) },
    r.funcoes.length > 0 && {
      p: `Quais funções têm mais vagas em ${r.cidade}?`,
      r: `Hoje, no Publike: ${listaCurta(r.funcoes)}. O número entre parênteses é o de vagas no ar.`,
    },
    r.bairros.length > 0 && {
      p: `Em quais bairros de ${r.cidade} tem mais vaga?`,
      r: `Hoje: ${listaCurta(r.bairros)}. No Publike, cada vaga mostra a distância e o tempo de ônibus da sua casa.`,
    },
    r.salarioMensal && {
      p: `Quanto pagam as vagas em ${r.cidade}?`,
      r: `Nas ${formatarNumero(r.salarioMensal.vagas)} vagas com salário por mês informado, o salário do meio é ${formatarMoeda(r.salarioMensal.mediana)}: metade paga mais e metade paga menos.${r.diaria ? ` Nas diárias, o valor do meio é ${formatarMoeda(r.diaria.mediana)} por dia.` : ""}`,
    },
    {
      p: "Como se candidatar às vagas?",
      r: "No Publike, curtir a vaga é se candidatar. Quem publicou vê o seu perfil (e o currículo, se você tiver) e, se aceitar, dá match: o WhatsApp dos dois aparece para vocês conversarem.",
    },
    {
      p: "Precisa pagar alguma coisa?",
      r: "Não. Procurar e se candidatar no Publike é grátis. Vaga de verdade não cobra nada de quem se candidata: se pedirem dinheiro, denuncie o anúncio.",
    },
  ];
  return lista.filter((x): x is { p: string; r: string } => Boolean(x));
}

export async function metadadosDeHoje(cidade: string): Promise<Metadata> {
  const r = await resumoDoDia(cidade);
  const caminho = caminhoDeHoje(cidade);
  const descricao =
    r.total > 0
      ? `${comMaiuscula(quantasVagas(r.total, r.noLimite))} hoje em ${cidade} (GO), ${formatarNumero(r.novas24h)} novas em 24 horas: as funções e os bairros com mais vagas e o salário do meio. Candidate-se grátis.`
      : `As vagas de emprego abertas hoje em ${cidade} (GO), com as funções e os bairros com mais vagas. Candidate-se grátis pelo Publike.`;
  return {
    title: titulo(cidade),
    description: descricao,
    alternates: { canonical: caminho },
    // a cidade com poucas vagas não vira página no Google (repetiria a da cidade)
    robots: r.total < 3 ? { index: false, follow: true } : undefined,
    openGraph: {
      images: [IMAGEM_DO_SITE],
      title: `${titulo(cidade)} · Publike`,
      description: descricao,
      url: caminho,
      type: "website",
    },
  };
}

export function PaginaDeHoje({ cidade }: { cidade: string }) {
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
            <Link href={caminhoDaBusca("vaga", cidade)} className="hover:text-ink hover:underline">
              Vagas em {cidade}
            </Link>
          </li>
          <ChevronRight aria-hidden className="size-4" />
          <li aria-current="page">Hoje</li>
        </ol>
      </nav>
      <h1 className="mt-3 max-w-4xl text-h2 sm:text-h1">{titulo(cidade)}</h1>
      {/* sem Suspense, como as vagas novas: os números vêm do cache e a página sai pronta */}
      <Conteudo cidade={cidade} />
    </Container>
  );
}

async function Conteudo({ cidade }: { cidade: string }) {
  const r = await resumoDoDia(cidade);
  const faq = perguntas(r);
  const outras = CIDADES_PRINCIPAIS.filter((c) => c !== cidade);
  const fatos: { rotulo: string; valor: string; detalhe?: string }[] = [
    {
      rotulo: "Vagas abertas",
      valor: r.noLimite ? `${formatarNumero(r.total)}+` : formatarNumero(r.total),
      detalhe: r.regiao ? `${formatarNumero(r.regiao.total)} em ${r.regiao.nome}` : undefined,
    },
    { rotulo: "Novas em 24 horas", valor: formatarNumero(r.novas24h) },
    { rotulo: "Novas em 7 dias", valor: formatarNumero(r.novas7d) },
  ];
  if (r.salarioMensal) {
    fatos.push({
      rotulo: "Salário do meio",
      valor: formatarMoeda(r.salarioMensal.mediana),
      detalhe: `por mês, nas ${formatarNumero(r.salarioMensal.vagas)} vagas com salário`,
    });
  }

  return (
    <>
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
              { "@type": "ListItem", position: 3, name: "Hoje", item: `${SITE_URL}${caminhoDeHoje(cidade)}` },
            ],
          },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faq.map((q) => ({
              "@type": "Question",
              name: q.p,
              acceptedAnswer: { "@type": "Answer", text: q.r },
            })),
          },
        ]}
      />
      <p className="mt-3 max-w-3xl text-body-lg">{fraseDoDia(r)}</p>
      <p className="mt-1 text-body-sm text-ink-muted">
        Números de {dia(r.quando)}, às {hora(r.quando)} (horário de Brasília). Mudam a cada 15 minutos.
      </p>

      <dl className="mt-6 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
        {fatos.map((f) => (
          <div key={f.rotulo} className="rounded-lg border border-line bg-surface-200 p-4">
            <dt className="text-body-sm text-ink-muted">{f.rotulo}</dt>
            <dd className="mt-1">
              <span className="text-h2 tabular-nums">{f.valor}</span>
              {f.detalhe && <span className="mt-0.5 block text-body-sm text-ink-muted">{f.detalhe}</span>}
            </dd>
          </div>
        ))}
      </dl>

      {r.funcoes.length > 0 && <Ranking id="funcoes" titulo="As funções com mais vagas hoje" itens={r.funcoes} />}
      {r.bairros.length > 0 && <Ranking id="bairros" titulo={`Os bairros de ${cidade} com mais vagas`} itens={r.bairros} />}
      {r.areas.length > 0 && <Ranking id="areas" titulo="Por área" itens={r.areas} todos />}

      {r.vagas.length > 0 && (
        <section aria-labelledby="mais-novas" className="mt-10">
          <h2 id="mais-novas" className="text-h3">
            As vagas mais novas
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {r.vagas.slice(0, 6).map((a) => (
              <li key={a.id} className="grid">
                <CardAnuncio anuncio={a} agora={r.quando} usuarioId={null} />
              </li>
            ))}
          </ul>
          <p className="mt-4 text-body">
            Veja{" "}
            <Link href={caminhoDasRecentes(cidade)} className="font-semibold underline underline-offset-2">
              as vagas dos últimos {DIAS_RECENTES} dias
            </Link>{" "}
            ou{" "}
            <Link href={caminhoDaBusca("vaga", cidade)} className="font-semibold underline underline-offset-2">
              todas as vagas em {cidade}
            </Link>
            , no mapa e com o tempo de ônibus de casa.
          </p>
        </section>
      )}

      <section aria-labelledby="perguntas" className="mt-10 max-w-3xl">
        <h2 id="perguntas" className="text-h3">
          Perguntas frequentes
        </h2>
        <dl className="mt-3 flex flex-col gap-4">
          {faq.map((q) => (
            <div key={q.p}>
              <dt className="text-label">{q.p}</dt>
              <dd className="mt-1 text-body text-ink-muted">{q.r}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="numeros" className="mt-10 max-w-3xl">
        <h2 id="numeros" className="text-h3">
          De onde vêm os números
        </h2>
        <p className="mt-2 text-body text-ink-muted">
          São as vagas no ar no Publike em {cidade} agora, publicadas por empresas, comércios, agências de emprego e
          famílias, contadas a cada 15 minutos. Não entram vagas de outros sites. O salário do meio é a mediana das vagas
          que informam o salário por mês (numa faixa, conta o meio dela). A vaga sai da conta quando quem publicou a
          encerra ou quando ela vence.
        </p>
      </section>

      <section aria-labelledby="outras-cidades" className="mt-10">
        <h2 id="outras-cidades" className="text-h3">
          Vagas de hoje em outras cidades
        </h2>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-body-sm">
          {outras.map((c) => (
            <li key={c}>
              <Link href={caminhoDeHoje(c)} className="underline underline-offset-2 hover:text-terra-text">
                {c}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/** Uma lista com o número de vagas de cada item (as funções, os bairros, as áreas); com link quando tem página. */
function Ranking({ id, titulo, itens, todos = false }: { id: string; titulo: string; itens: Contagem[]; todos?: boolean }) {
  const lista = todos ? itens : itens.slice(0, MAIS);
  return (
    <section aria-labelledby={id} className="mt-10 max-w-4xl">
      <h2 id={id} className="text-h3">
        {titulo}
      </h2>
      <ol className="mt-3 grid gap-x-8 gap-y-2 text-body sm:grid-cols-2">
        {lista.map((c) => (
          <li key={c.nome} className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
            {c.caminho ? (
              <Link href={c.caminho} className="underline underline-offset-2 hover:text-terra-text">
                {c.nome}
              </Link>
            ) : (
              <span>{c.nome}</span>
            )}
            <span className="shrink-0 text-body-sm text-ink-muted tabular-nums">
              {c.n === 1 ? "1 vaga" : `${formatarNumero(c.n)} vagas`}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
