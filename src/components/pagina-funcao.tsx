import { ChevronRight, HandCoins } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SITE_URL } from "@/lib/config";
import { CATEGORIAS } from "@/lib/constantes";
import { formatarNumero, nomeDoBairro } from "@/lib/formato";
import {
  caminhoDaFuncao,
  comMaiuscula,
  FUNCOES_DAS_PAGINAS,
  funcaoDaListaPeloCbo,
  tituloDaFuncao,
  type FuncaoDaPagina,
} from "@/lib/funcoes-das-paginas";
import { caminhoDaBusca, caminhoDoBairro, cidadeDoSlug, slugDaCidade } from "@/lib/paginas-busca";
import { fonteDaFaixa, nomeDaRegiao, reaisDaFaixa, type FaixaSalarial } from "@/lib/salarios";
import {
  faixaDaFuncaoNaCidade,
  funcaoDoEndereco,
  paginaDaFuncaoIndexavel,
  vagasDaFuncao,
} from "@/lib/servidor/paginas-funcao";
import { agoraDaRequisicao } from "@/lib/tempo";
import { CardAnuncio } from "./card-anuncio";
import { DadosEstruturados } from "./dados-estruturados";
import { AvisarBusca } from "./explorar/avisar-busca";
import { BotaoLink } from "./ui/botao";
import { Container } from "./ui/basicos";

// A página de vaga por função e cidade (claude/plano-vagas-por-funcao.md): "Vagas de frentista em Goiânia", com as
// vagas no ar, quanto se paga na região (Novo Caged), os bairros, as funções parecidas e o "me avise". Mesmo endereço
// da página de área (/vagas/goiania/frentista): a rota decide pelo nome.

type PaginaFuncao = { cidade: string; funcao: FuncaoDaPagina };

/** A cidade e a função do endereço; null quando o nome não é de função (aí a rota tenta a área). */
export async function lerFuncao(slugCidade: string, slug: string): Promise<PaginaFuncao | null> {
  const cidade = cidadeDoSlug(slugCidade);
  if (!cidade) notFound();
  const funcao = await funcaoDoEndereco(slug);
  return funcao ? { cidade, funcao } : null;
}

/** "de R$ 1.620 a R$ 2.100": a metade do meio das contratações. */
function faixaEmTexto(f: FaixaSalarial) {
  return `de ${reaisDaFaixa(f.p25)} a ${reaisDaFaixa(f.p75)}`;
}

/** A média por mês do que as vagas do Publike oferecem (com 3 vagas ou mais com salário por mês). */
function mediaDasVagas(vagas: { pagamento_valor: number | null; pagamento_unidade: string | null }[]) {
  const valores = vagas
    .filter((v) => v.pagamento_unidade === "mes" && v.pagamento_valor && v.pagamento_valor > 0)
    .map((v) => Number(v.pagamento_valor));
  if (valores.length < 3) return null;
  return { media: valores.reduce((s, v) => s + v, 0) / valores.length, n: valores.length };
}

export async function metadadosDaFuncao({ cidade, funcao }: PaginaFuncao): Promise<Metadata> {
  const [{ vagas }, faixa] = await Promise.all([
    vagasDaFuncao(funcao.cbo, cidade),
    faixaDaFuncaoNaCidade(funcao.cbo, cidade),
  ]);
  const caminho = caminhoDaFuncao(cidade, funcao.slug);
  const titulo = `${tituloDaFuncao(funcao.nome, cidade)}: salário e vagas abertas`;
  const quantas = vagas.length === 0 ? "Vagas" : vagas.length === 1 ? "1 vaga" : `${vagas.length} vagas`;
  const descricao = `${quantas} de ${funcao.nome} em ${cidade} (GO)${
    faixa ? ` e quanto se paga na região: ${faixaEmTexto(faixa)} por mês, pelo Novo Caged` : ""
  }. Candidate-se grátis pelo Publike, perto de casa.`;
  return {
    title: titulo,
    description: descricao,
    alternates: { canonical: caminho },
    openGraph: { title: `${titulo} · Publike`, description: descricao, url: caminho, type: "website" },
    // sem vaga e sem salário (ou só salário numa cidade vizinha): abre, mas o Google não precisa listar
    robots: paginaDaFuncaoIndexavel(funcao, cidade, vagas.length, faixa) ? undefined : { index: false, follow: true },
  };
}

export function PaginaDeFuncao({ cidade, funcao }: PaginaFuncao) {
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
          <li aria-current="page">{comMaiuscula(funcao.nome)}</li>
        </ol>
      </nav>
      <h1 className="mt-3 max-w-4xl text-h2 sm:text-h1">{tituloDaFuncao(funcao.nome, cidade)}</h1>
      <Suspense fallback={<Esqueleto />}>
        <Conteudo cidade={cidade} funcao={funcao} />
      </Suspense>
    </Container>
  );
}

async function Conteudo({ cidade, funcao }: PaginaFuncao) {
  const [{ vagas, funcoesDaCidade }, faixa, agora] = await Promise.all([
    vagasDaFuncao(funcao.cbo, cidade),
    faixaDaFuncaoNaCidade(funcao.cbo, cidade),
    agoraDaRequisicao(),
  ]);
  const nome = funcao.nome;
  const caminho = caminhoDaFuncao(cidade, funcao.slug);
  const avisar = `/?tipo=vaga&q=${encodeURIComponent(nome)}`;
  const media = mediaDasVagas(vagas);

  // os bairros com vaga da função
  const porBairro = new Map<string, { nome: string; total: number }>();
  for (const a of vagas) {
    if (!a.bairro || a.bairro === cidade) continue;
    const chave = slugDaCidade(a.bairro);
    porBairro.set(chave, {
      nome: porBairro.get(chave)?.nome ?? nomeDoBairro(a.bairro),
      total: (porBairro.get(chave)?.total ?? 0) + 1,
    });
  }
  const bairros = [...porBairro.values()].sort((x, y) => y.total - x.total || x.nome.localeCompare(y.nome, "pt-BR"));

  // a área das vagas (a mais comum), para o link de volta
  const contagemAreas = new Map<string, number>();
  for (const a of vagas) if (a.categoria) contagemAreas.set(a.categoria, (contagemAreas.get(a.categoria) ?? 0) + 1);
  const areaSlug = [...contagemAreas.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
  const area = CATEGORIAS.find((c) => c.slug === areaSlug && c.slug !== "outros") ?? null;

  // as parecidas: da mesma família da CBO (os 4 primeiros dígitos), e as outras funções com vaga na cidade
  const familia = FUNCOES_DAS_PAGINAS.filter(
    (f) => f.cbo !== funcao.cbo && f.cbo.slice(0, 4) === funcao.cbo.slice(0, 4),
  );
  const comVaga = [...funcoesDaCidade.entries()]
    .filter(([cbo]) => cbo !== funcao.cbo)
    .sort((x, y) => y[1] - x[1])
    .flatMap(([cbo, total]) => {
      const f = funcaoDaListaPeloCbo(cbo);
      return f ? [{ ...f, total }] : [];
    })
    .slice(0, 16);

  const perguntas = [
    ...(faixa
      ? [
          {
            p: `Quanto ganha um ${nome} em ${cidade}?`,
            r: `${faixa.regiao === "go" ? "Em Goiás" : `Em ${nomeDaRegiao(faixa.regiao)}`}, a metade das contratações de ${nome} com carteira paga ${faixaEmTexto(faixa)} por mês, e a do meio fica em ${reaisDaFaixa(faixa.p50)} (${fonteDaFaixa(faixa)}).${media ? ` Nas vagas do Publike, a média oferecida é de ${reaisDaFaixa(media.media)}.` : ""}`,
          },
        ]
      : []),
    {
      p: `Tem vaga de ${nome} em ${cidade} agora?`,
      r:
        vagas.length > 0
          ? `Sim: ${vagas.length === 1 ? "1 vaga está" : `${vagas.length} vagas estão`} no ar no Publike, com a distância e o tempo de ônibus de casa. Novas vagas entram todo dia.`
          : `Agora não há vaga de ${nome} no ar em ${cidade} no Publike. Ative o aviso nesta página e você fica sabendo quando abrir.`,
    },
    {
      p: "Como me candidato?",
      r: "Toque em Curtir na vaga: curtir é se candidatar, de graça. Quando quem contrata aceita, dá match e vocês conversam pelo chat do Publike.",
    },
  ];

  const dados = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Início", item: `${SITE_URL}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: `Vagas em ${cidade}`,
          item: `${SITE_URL}${caminhoDaBusca("vaga", cidade)}`,
        },
        { "@type": "ListItem", position: 3, name: comMaiuscula(nome), item: `${SITE_URL}${caminho}` },
      ],
    },
    ...(vagas.length
      ? [
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            itemListElement: vagas.slice(0, 50).map((a, i) => ({
              "@type": "ListItem",
              position: i + 1,
              url: `${SITE_URL}/anuncio/${a.id}`,
              name: a.titulo,
            })),
          },
        ]
      : []),
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: perguntas.map((q) => ({
        "@type": "Question",
        name: q.p,
        acceptedAnswer: { "@type": "Answer", text: q.r },
      })),
    },
  ];

  return (
    <>
      <DadosEstruturados dados={dados} />
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-body text-ink-muted">
        <span>
          {vagas.length === 0
            ? `Nenhuma vaga de ${nome} no ar agora.`
            : `${vagas.length === 1 ? "1 vaga no ar" : `${vagas.length} vagas no ar`}. Curtir é se candidatar, de graça.`}
        </span>
        <AvisarBusca caminho={avisar} salvaId={null} logado={false} />
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
        <div className="mt-4 rounded-lg border border-dashed border-line-strong p-6 text-body">
          <p>
            Ainda não há vaga de {nome} no ar em {cidade}. Toque em “Me avise de vagas assim” e o Publike avisa quando
            abrir. Enquanto isso, veja{" "}
            <Link href={caminhoDaBusca("vaga", cidade)} className="font-semibold underline underline-offset-2">
              todas as vagas em {cidade}
            </Link>
            .
          </p>
        </div>
      )}

      {faixa && (
        <section aria-labelledby="quanto-ganha" className="mt-10 max-w-3xl">
          <h2 id="quanto-ganha" className="flex items-center gap-2 text-h3">
            <HandCoins aria-hidden className="size-6 text-cerrado-text" />
            Quanto ganha um {nome} em {cidade}
          </h2>
          <div className="mt-3 rounded-lg border border-line bg-surface-200 p-5">
            <p className="text-h2">
              {reaisDaFaixa(faixa.p25)} a {reaisDaFaixa(faixa.p75)}
              <span className="text-body text-ink-muted"> por mês</span>
            </p>
            <p className="mt-1 text-body text-ink-muted">
              A metade das contratações com carteira{" "}
              {faixa.regiao === "go" ? "em Goiás" : `em ${nomeDaRegiao(faixa.regiao)}`} fica nessa faixa; a do meio paga{" "}
              {reaisDaFaixa(faixa.p50)}.
              {media &&
                ` Nas ${formatarNumero(media.n)} vagas de ${nome} do Publike com salário, a média oferecida é ${reaisDaFaixa(media.media)}.`}
            </p>
            <p className="mt-3 text-caption text-ink-muted">Fonte: {fonteDaFaixa(faixa)}.</p>
          </div>
        </section>
      )}

      {bairros.length > 0 && (
        <section aria-labelledby="por-bairro" className="mt-10">
          <h2 id="por-bairro" className="text-h3">
            Bairros com vaga de {nome}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-body-sm">
            {bairros.map((b) => (
              <li key={b.nome}>
                <Link
                  href={caminhoDoBairro(cidade, b.nome)}
                  className="underline underline-offset-2 hover:text-terra-text"
                >
                  {b.nome}
                </Link>
                <span className="text-ink-muted"> ({b.total})</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(familia.length > 0 || comVaga.length > 0) && (
        <section aria-labelledby="parecidas" className="mt-10">
          <h2 id="parecidas" className="text-h3">
            Outras funções em {cidade}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {[...familia.map((f) => ({ ...f, total: funcoesDaCidade.get(f.cbo) ?? 0 })), ...comVaga]
              .filter((f, i, todas) => todas.findIndex((x) => x.slug === f.slug) === i)
              .map((f) => (
                <li key={f.slug}>
                  <Link
                    href={caminhoDaFuncao(cidade, f.slug)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-pill border border-line-strong bg-surface-200 px-3.5 text-body-sm transition-colors hover:bg-surface-300"
                  >
                    {comMaiuscula(f.nome)}
                    {f.total > 0 && <span className="text-ink-muted">({f.total})</span>}
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="perguntas" className="mt-10 max-w-3xl">
        <h2 id="perguntas" className="text-h3">
          Perguntas sobre vagas de {nome}
        </h2>
        <dl className="mt-3 flex flex-col gap-4">
          {perguntas.map((q) => (
            <div key={q.p}>
              <dt className="text-label">{q.p}</dt>
              <dd className="mt-1 text-body text-ink-muted">{q.r}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        {area && (
          <BotaoLink href={caminhoDaBusca("vaga", cidade, area.slug)}>
            Vagas de {area.nome.toLowerCase()} em {cidade}
          </BotaoLink>
        )}
        <BotaoLink href="/publicar">Contratando {nome}? Publique a vaga grátis</BotaoLink>
      </div>
    </>
  );
}

function Esqueleto() {
  return (
    <div aria-hidden className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="h-56 animate-pulse rounded-lg bg-surface-300" />
      ))}
    </div>
  );
}
