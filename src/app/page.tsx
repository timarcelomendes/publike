import { Eye } from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { DadosEstruturados } from "@/components/dados-estruturados";
import { BuscaEsqueleto, BuscaExplorar, Explorar, ExplorarEsqueleto } from "@/components/explorar/explorar";
import { EmpresasContratando } from "@/components/home/empresas-contratando";
import { FaixaArte } from "@/components/home/faixa-arte";
import { ServicosDoBairro } from "@/components/home/servicos-do-bairro";
import { HeroVitrine, NovasHoje } from "@/components/home/vitrine";
import { CartaoDaConta } from "@/components/home/cartao-da-conta";
import { ContratandoPerto } from "@/components/home/coluna-direita";
import { NovosPerto } from "@/components/home/novos-perto";
import { LateralDaLinha } from "@/components/home/linha/lateral-da-linha";
import { LinhaDoTempo } from "@/components/home/linha/linha-do-tempo";
import { TopoDaConta } from "@/components/home/linha/topo-da-conta";
import { EsqueletoCards } from "@/components/card-anuncio";
import { ColunaDoMapa } from "@/components/explorar/visao-explorar";
import { primeiro } from "@/lib/formato";
import { EntendaOPublike } from "@/components/inicio";
import { ContratacoesNaHome } from "@/components/social/secoes";
import { Container, Esqueleto } from "@/components/ui/basicos";
import { SITE_URL } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { obterLocal } from "@/lib/local";
import { soOlharComoPessoa } from "@/lib/servidor/so-olhar";
import { agoraDaRequisicao } from "@/lib/tempo";
import { ONDE_FUNCIONA, PRACA_PADRAO, PRACAS } from "@/lib/pracas";

// Quem é o Publike, para o Google (nome do site e da organização nos resultados).
const DADOS_SITE = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Publike",
    alternateName: `Publike ${PRACA_PADRAO.cidade}`,
    url: `${SITE_URL}/`,
    inLanguage: "pt-BR",
  },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Publike",
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/logo/publike-icone-1024.png`,
    description: `Ferramenta gratuita para gerar emprego em ${ONDE_FUNCIONA}: vagas, diárias, freelances e profissionais do bairro.`,
    areaServed: PRACAS.map((p) => ({ "@type": "AdministrativeArea", name: `${p.nomeOficial}, ${p.uf}` })),
  },
];

type Parametros = PageProps<"/">["searchParams"];

export default function Inicio({ searchParams }: PageProps<"/">) {
  return (
    <>
      <DadosEstruturados dados={DADOS_SITE} />
      {/* A home muda com quem chega: o visitante vê a vitrine; quem entrou, a home da conta */}
      <Suspense fallback={<HomeEsqueleto />}>
        <HomeDaVisita searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function HomeEsqueleto() {
  return (
    <>
      <Container className="pt-4 sm:pt-6 lg:pt-8">
        <BuscaEsqueleto />
      </Container>
      <ExplorarEsqueleto />
    </>
  );
}

async function HomeDaVisita({ searchParams }: { searchParams: Parametros }) {
  const usuario = await obterUsuario();
  return usuario ? <HomeDaConta searchParams={searchParams} /> : <HomeVisitante searchParams={searchParams} />;
}

/**
 * Visitante (direção B): a faixa clara (papel da marca) com a busca e, logo embaixo, a lista completa (filtros e
 * mapa): quem chega vê as vagas primeiro. Depois, as vagas novas, as empresas contratando, a faixa
 * da arte da vaga e os serviços.
 */
function HomeVisitante({ searchParams }: { searchParams: Parametros }) {
  return (
    <>
      <HeroVitrine
        busca={
          <Suspense fallback={<BuscaEsqueleto />}>
            <BuscaExplorar searchParams={searchParams} className="" faixa />
          </Suspense>
        }
      />
      <div id="vagas" className="mt-2 scroll-mt-20 sm:mt-4">
        <Suspense fallback={<ExplorarEsqueleto />}>
          <Explorar searchParams={searchParams} />
        </Suspense>
      </div>
      <Suspense fallback={null}>
        <SecoesDaVitrine searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={null}>
        <Contratados />
      </Suspense>
      <EntendaOPublike />
    </>
  );
}

/** As vagas novas, quem está contratando, a faixa da arte da vaga e os serviços (leituras com cache). */
async function SecoesDaVitrine({ searchParams }: { searchParams: Parametros }) {
  // com uma busca no endereço, a lista vem logo depois da faixa (as seções ficam para a home limpa)
  const [local, sp] = await Promise.all([obterLocal(), searchParams]);
  if (Object.keys(sp).some((k) => BUSCA.includes(k))) return null;
  return (
    <>
      <NovasHoje local={local} />
      <EmpresasContratando local={local} />
      <Suspense fallback={null}>
        <NovosPerto jeito="vitrine" />
      </Suspense>
      <FaixaArte logado={false} />
      <ServicosDoBairro />
    </>
  );
}

/**
 * Quem entrou: o Início é o mesmo feed para todos, em qualquer modo do painel. Quem contrata vê, no
 * topo, a faixa das vagas e dos candidatos (FaixaDeQuemContrata); o trabalho com os candidatos fica no
 * painel. (Antes, o modo Contratar trocava o Início pelo Hoje do painel: quem publicava não via a vaga
 * em lugar nenhum e achava que ela não tinha saído.)
 */
async function HomeDaConta({ searchParams }: { searchParams: Parametros }) {
  // empresa, comércio ou agência vendo como pessoa ("só olhar", no Trocar do painel): sem as ações da conta
  const soOlhar = await soOlharComoPessoa();
  return <LinhaDaConta searchParams={searchParams} soOlhar={soOlhar} />;
}

/**
 * A linha do tempo de quem entrou, em três colunas no computador: à esquerda, o cartão da conta
 * (a foto, o nome e os atalhos: o currículo, ou o painel de vagas de quem contrata); no meio, o
 * topo (a saudação, o recado e as abas) e a linha; à direita, quem está contratando e o mapa.
 * No celular, uma coluna só.
 */
function LinhaDaConta({ searchParams, soOlhar = false }: { searchParams: Parametros; soOlhar?: boolean }) {
  const contratando = (
    <Suspense fallback={null}>
      <ContratandoAcimaDoMapa />
    </Suspense>
  );
  // no meio da linha (celular e tablet): quem está contratando e quem chegou perto, em faixas que rolam de lado
  const meio = (
    <div className="flex flex-col gap-6">
      <Suspense fallback={null}>
        <ContratandoAcimaDoMapa jeito="faixa" />
      </Suspense>
      {!soOlhar && (
        <div className="lg:hidden">
          <Suspense fallback={null}>
            <NovosPerto jeito="faixa" />
          </Suspense>
        </div>
      )}
    </div>
  );
  return (
    // no computador grande, até 1280 px: o meio fica com espaço para o tíquete inteiro
    <Container data-pagina-larga="" className="pt-4 pb-4 sm:pt-6 xl:max-w-7xl">
      <div className="lg:grid lg:grid-cols-[232px_minmax(0,1fr)] lg:items-start lg:gap-6 xl:grid-cols-[232px_minmax(0,1fr)_280px]">
        {/* as colunas dos lados ficam presas ao rolar (a grade é alta; a coluna, do tamanho dela) */}
        <aside className="hidden flex-col gap-4 lg:sticky lg:top-[88px] lg:flex">
          {soOlhar ? (
            <CartaoSoOlhar />
          ) : (
            <>
              <Suspense fallback={<Esqueleto className="h-72 rounded-lg" />}>
                <CartaoDaConta jeito="linha" />
              </Suspense>
              {/* quem entrou no Publike nos últimos 30 dias, do mais perto para o mais longe */}
              <Suspense fallback={null}>
                <NovosPerto />
              </Suspense>
            </>
          )}
        </aside>
        <div className="min-w-0">
          <Suspense fallback={<Esqueleto className="mb-6 h-40 rounded-lg" />}>
            <TopoDaConta searchParams={searchParams} soOlhar={soOlhar} />
          </Suspense>
          <Suspense fallback={<EsqueletoCards quantos={3} />}>
            <CentroDaLinha searchParams={searchParams} contratando={contratando} meio={meio} soOlhar={soOlhar} />
          </Suspense>
        </div>
        <Suspense fallback={null}>
          <LadoDaLinha searchParams={searchParams} contratando={contratando} />
        </Suspense>
      </div>
      <Suspense fallback={null}>
        <Contratados />
      </Suspense>
    </Container>
  );
}

/**
 * No meio, embaixo do topo: a linha do tempo; com uma busca por palavra ou uma ordem escolhida
 * ("Combina mais", "Mais perto"), a lista de resultados de sempre.
 */
/**
 * Na home de quem entrou, a busca e as ordens da lista (Mais perto, Novas, Para você) trocam a linha
 * do tempo pela lista. "Mais relevantes" não: ela só muda a ordem da própria linha.
 */
function ordemDeLista(sp: Awaited<Parametros>) {
  const ordem = primeiro(sp.ordem);
  return Boolean(ordem) && ordem !== "relevantes";
}

async function CentroDaLinha({
  searchParams,
  contratando,
  meio,
  soOlhar = false,
}: {
  searchParams: Parametros;
  contratando: ReactNode;
  meio: ReactNode;
  soOlhar?: boolean;
}) {
  const sp = await searchParams;
  if (primeiro(sp.q) || ordemDeLista(sp)) {
    return (
      <Suspense fallback={<ExplorarEsqueleto />}>
        <Explorar searchParams={searchParams} variante="feed" acimaDoMapa={contratando} abasDaBusca />
      </Suspense>
    );
  }
  return <LinhaDoTempo searchParams={searchParams} meio={meio} soOlhar={soOlhar} />;
}

/** "Só olhar", à esquerda no lugar do cartão da conta: o que é esta página e como as vagas da conta aparecem. */
function CartaoSoOlhar() {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-5 shadow-card">
      <span className="flex size-11 items-center justify-center rounded-pill bg-surface-300 text-ink">
        <Eye aria-hidden className="size-5" />
      </span>
      <h2 className="text-label">Vendo como pessoa</h2>
      <p className="text-body-sm text-ink-muted">
        Esta é a linha de quem procura trabalho por aqui: as vagas, os serviços e os recados. Abra uma vaga sua para ver
        como as pessoas a veem.
      </p>
    </section>
  );
}

/** À direita (computador grande): quem está contratando e o mapa (o da busca ou o da linha). */
async function LadoDaLinha({ searchParams, contratando }: { searchParams: Parametros; contratando: ReactNode }) {
  const sp = await searchParams;
  if (primeiro(sp.q) || ordemDeLista(sp)) {
    return <ColunaDoMapa className="hidden min-w-0 flex-col gap-4 self-stretch xl:flex" />;
  }
  return (
    <aside aria-label="Perto de você" className="hidden min-w-0 xl:sticky xl:top-[88px] xl:block">
      <Suspense fallback={<Esqueleto className="aspect-[4/5] rounded-lg" />}>
        <LateralDaLinha searchParams={searchParams} acima={contratando} />
      </Suspense>
    </aside>
  );
}

/** Os parâmetros de busca da home: com qualquer um, a vitrine de quem não entrou fica só com a lista. */
const BUSCA = [
  "q",
  "tipo",
  "categoria",
  "regime",
  "turno",
  "raio",
  "tempo",
  "ordem",
  "lat",
  "lng",
  "origem",
  "meus",
  "quem",
  "casa",
];

/** Quem contrata perto: em cima do mapa (computador) ou, em faixa, no meio da linha (celular). */
async function ContratandoAcimaDoMapa({ jeito = "coluna" }: { jeito?: "coluna" | "faixa" }) {
  return <ContratandoPerto local={await obterLocal()} jeito={jeito} />;
}

/** Gente contratada pelo Publike (com o sim dos dois lados): aparece com 3 ou mais. */
async function Contratados() {
  return <ContratacoesNaHome agora={await agoraDaRequisicao()} />;
}
