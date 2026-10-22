import { ArrowRight, Eye } from "lucide-react";
import Link from "next/link";
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
import { MolduraDaHome } from "@/components/home/moldura";
import { EntendaOPublike } from "@/components/inicio";
import { MenuPainelEsqueleto } from "@/components/painel/menu-painel";
import { MenuDaConta } from "@/components/painel/menu-da-conta";
import { ContratacoesNaHome } from "@/components/social/secoes";
import { Aviso, Container, Esqueleto } from "@/components/ui/basicos";
import { HojeContratar } from "@/components/painel/hoje-contratar";
import { SITE_URL } from "@/lib/config";
import { obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { minhasConexoes } from "@/lib/servidor/conexoes";
import { conversasPorPessoa } from "@/lib/servidor/conversas";
import { obterLocal } from "@/lib/local";
import { modoDaConta } from "@/lib/servidor/modo";
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

/** Quem entrou: a home da conta, no modo do painel. */
async function HomeDaConta({ searchParams }: { searchParams: Parametros }) {
  const [modo, sp, soOlhar] = await Promise.all([modoDaConta(), searchParams, soOlharComoPessoa()]);
  // empresa, comércio ou agência vendo como pessoa ("só olhar", no Trocar do painel): a linha de quem procura trabalho
  if (soOlhar) return <LinhaDaConta searchParams={searchParams} soOlhar />;
  // quem contrata abre direto no trabalho com os candidatos; com uma busca no endereço, a lista
  const comBusca = Object.keys(sp).some((k) => BUSCA.includes(k));
  if (modo === "contratar") return comBusca ? <BuscaDaEmpresa searchParams={searchParams} /> : <HomeEmpresa />;
  return <LinhaDaConta searchParams={searchParams} />;
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
  // no meio da linha (celular e tablet): quem está contratando e quem chegou perto
  const meio = (
    <div className="flex flex-col gap-6">
      {contratando}
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
    <Container className="pt-4 pb-4 sm:pt-6">
      <div className="lg:grid lg:grid-cols-[232px_minmax(0,1fr)] lg:items-start lg:gap-6 xl:grid-cols-[232px_minmax(0,1fr)_280px]">
        <aside className="hidden flex-col gap-4 lg:flex">
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
  if (primeiro(sp.q) || primeiro(sp.ordem)) {
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
  if (primeiro(sp.q) || primeiro(sp.ordem)) {
    return <ColunaDoMapa className="hidden min-w-0 flex-col gap-4 self-stretch xl:flex" />;
  }
  return (
    <aside aria-label="Perto de você" className="hidden min-w-0 xl:block">
      <Suspense fallback={<Esqueleto className="aspect-[4/5] rounded-lg" />}>
        <LateralDaLinha searchParams={searchParams} acima={contratando} />
      </Suspense>
    </aside>
  );
}

/** Quem contrata, com uma busca no endereço: a lista com filtros e mapa (como antes). */
function BuscaDaEmpresa({ searchParams }: { searchParams: Parametros }) {
  return (
    <>
      <h1 className="sr-only">Publike: trabalho perto de você</h1>
      <MolduraDaHome
        esquerda={
          <>
            <Suspense fallback={<Esqueleto className="h-56 rounded-lg" />}>
              <CartaoDaConta />
            </Suspense>
            <Suspense fallback={<Esqueleto className="h-64 rounded-lg" />}>
              <MenuDaConta />
            </Suspense>
          </>
        }
      >
        <Suspense fallback={<BuscaEsqueleto />}>
          <BuscaExplorar searchParams={searchParams} className="mb-6" />
        </Suspense>
        <Suspense fallback={<ExplorarEsqueleto />}>
          <Explorar searchParams={searchParams} variante="feed" />
        </Suspense>
      </MolduraDaHome>
    </>
  );
}

/** Os parâmetros de busca da home: com qualquer um, quem contrata vê a lista. */
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
  "casa",
];

/** Empresa, comércio e agência (modo Contratar): o Hoje do painel, com o cartão da empresa. */
async function HomeEmpresa() {
  const [usuario, perfil, conversas, conexoes, agora] = await Promise.all([
    obterUsuario(),
    obterMeuPerfil(),
    conversasPorPessoa(),
    minhasConexoes().catch(() => null),
    agoraDaRequisicao(),
  ]);
  if (!usuario || !perfil) return null;
  const suspensa = Boolean(perfil.suspenso_ate && new Date(perfil.suspenso_ate).getTime() > agora);
  return (
    <>
      <h1 className="sr-only">Publike: seus candidatos</h1>
      <MolduraDaHome
        esquerda={
          <>
            <Suspense fallback={<Esqueleto className="h-56 rounded-lg" />}>
              <CartaoDaConta />
            </Suspense>
            <Suspense fallback={<MenuPainelEsqueleto />}>
              <MenuDaConta />
            </Suspense>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          {suspensa && (
            <Aviso tipo="alerta" titulo="Sua conta está suspensa">
              Seus anúncios estão fora do ar e não dá para publicar, curtir ou responder. Veja o motivo no e-mail que
              enviamos.
            </Aviso>
          )}
          {/* no celular, o menu do painel fica em cima (como no Meu painel) */}
          <div className="lg:hidden">
            <Suspense fallback={<MenuPainelEsqueleto />}>
              <MenuDaConta />
            </Suspense>
          </div>
          <HojeContratar usuario={usuario} perfil={perfil} conversas={conversas} conexoes={conexoes} agora={agora} />
          {/* gente e empresas que chegaram perto: para contratar e para conectar */}
          <Suspense fallback={null}>
            <NovosPerto jeito="faixa" />
          </Suspense>
          <Link
            href="/?tipo=tudo"
            className="inline-flex items-center gap-1.5 self-start text-label text-ink underline underline-offset-2 hover:text-terra-text"
          >
            Ver as vagas do Publike
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      </MolduraDaHome>
    </>
  );
}

/** Quem contrata perto: em cima do mapa (computador) ou no meio da linha (celular). */
async function ContratandoAcimaDoMapa() {
  return <ContratandoPerto local={await obterLocal()} />;
}

/** Gente contratada pelo Publike (com o sim dos dois lados): aparece com 3 ou mais. */
async function Contratados() {
  return <ContratacoesNaHome agora={await agoraDaRequisicao()} />;
}
