import { ArrowRight } from "lucide-react";
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
 * Visitante (direção B): a faixa escura com a busca, as vagas novas, as empresas contratando,
 * a faixa da arte da vaga, os serviços e, por fim, a lista completa (filtros e mapa).
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
      <Suspense fallback={null}>
        <SecoesDaVitrine searchParams={searchParams} />
      </Suspense>
      <div id="vagas" className="mt-6 scroll-mt-20 sm:mt-10">
        <Suspense fallback={<ExplorarEsqueleto />}>
          <Explorar searchParams={searchParams} />
        </Suspense>
      </div>
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
      <NovasHoje />
      <EmpresasContratando local={local} />
      <FaixaArte logado={false} />
      <ServicosDoBairro />
    </>
  );
}

/** Quem entrou: a home da conta, no modo do painel. */
async function HomeDaConta({ searchParams }: { searchParams: Parametros }) {
  const [modo, sp] = await Promise.all([modoDaConta(), searchParams]);
  // quem contrata abre direto no trabalho com os candidatos; com uma busca no endereço, a lista
  const comBusca = Object.keys(sp).some((k) => BUSCA.includes(k));
  if (modo === "contratar") return comBusca ? <BuscaDaEmpresa searchParams={searchParams} /> : <HomeEmpresa />;
  return <LinhaDaConta searchParams={searchParams} />;
}

/**
 * Quem procura trabalho ou oferece serviço: a linha do tempo. Em cima, o topo com a foto, as
 * novidades e as abas; embaixo, a linha (vagas, serviços e aceites, do mais novo para o mais
 * antigo) e, no computador, quem está contratando e o mapa numa coluna à direita.
 */
function LinhaDaConta({ searchParams }: { searchParams: Parametros }) {
  const contratando = (
    <Suspense fallback={null}>
      <ContratandoAcimaDoMapa />
    </Suspense>
  );
  return (
    <Container className="pt-4 pb-4 sm:pt-6">
      <Suspense fallback={<Esqueleto className="mb-6 h-56 rounded-[28px]" />}>
        <TopoDaConta searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<EsqueletoCards quantos={3} />}>
        <LinhaOuBusca searchParams={searchParams} contratando={contratando} />
      </Suspense>
      <Suspense fallback={null}>
        <Contratados />
      </Suspense>
    </Container>
  );
}

/**
 * Embaixo do topo: a linha do tempo; com uma busca por palavra ou uma ordem escolhida ("Combina
 * mais", "Mais perto"), a lista de resultados de sempre, na mesma moldura (o mapa à direita).
 */
async function LinhaOuBusca({ searchParams, contratando }: { searchParams: Parametros; contratando: ReactNode }) {
  const sp = await searchParams;
  if (primeiro(sp.q) || primeiro(sp.ordem)) {
    return (
      <div className="lg:grid lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] lg:gap-8">
        <div className="min-w-0">
          <Suspense fallback={<ExplorarEsqueleto />}>
            <Explorar searchParams={searchParams} variante="feed" acimaDoMapa={contratando} />
          </Suspense>
        </div>
        <ColunaDoMapa className="hidden min-w-0 flex-col gap-4 self-stretch lg:flex" />
      </div>
    );
  }
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] lg:gap-8">
      <div className="min-w-0 lg:self-start">
        <Suspense fallback={<EsqueletoCards quantos={3} />}>
          <LinhaDoTempo searchParams={searchParams} meio={contratando} />
        </Suspense>
      </div>
      <aside aria-label="Perto de você" className="hidden min-w-0 lg:block">
        <Suspense fallback={<Esqueleto className="aspect-[4/5] rounded-lg" />}>
          <LateralDaLinha searchParams={searchParams} acima={contratando} />
        </Suspense>
      </aside>
    </div>
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
