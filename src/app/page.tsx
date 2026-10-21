import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { DadosEstruturados } from "@/components/dados-estruturados";
import { BuscaEsqueleto, BuscaExplorar, Explorar, ExplorarEsqueleto } from "@/components/explorar/explorar";
import { EmpresasContratando } from "@/components/home/empresas-contratando";
import { FaixaArte } from "@/components/home/faixa-arte";
import { ServicosDoBairro } from "@/components/home/servicos-do-bairro";
import { HeroVitrine, NovasHoje } from "@/components/home/vitrine";
import { AtalhosDaConta, CartaoDaConta } from "@/components/home/cartao-da-conta";
import { ContratandoPerto, DoBlog } from "@/components/home/coluna-direita";
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

/** Quem entrou: a home da conta, no modo do painel (Trabalhar e Serviços: o feed). */
async function HomeDaConta({ searchParams }: { searchParams: Parametros }) {
  const [modo, sp] = await Promise.all([modoDaConta(), searchParams]);
  // quem contrata abre direto no trabalho com os candidatos; com uma busca no endereço, a lista
  const comBusca = Object.keys(sp).some((k) => BUSCA.includes(k));
  if (modo === "contratar" && !comBusca) return <HomeEmpresa />;
  const empresa = modo === "contratar";
  return (
    <>
      <h1 className="sr-only">Publike: trabalho perto de você</h1>
      <MolduraDaHome
        esquerda={
          <>
            <Suspense fallback={<Esqueleto className="h-56 rounded-lg" />}>
              <CartaoDaConta modo={modo} />
            </Suspense>
            <Suspense fallback={<Esqueleto className="h-64 rounded-lg" />}>
              {empresa ? <MenuDaConta /> : <AtalhosDaConta modo={modo} />}
            </Suspense>
          </>
        }
        direita={
          empresa ? null : (
            <Suspense fallback={null}>
              <ColunaDireita />
            </Suspense>
          )
        }
      >
        {empresa ? (
          <Suspense fallback={<BuscaEsqueleto />}>
            <BuscaExplorar searchParams={searchParams} className="mb-6" />
          </Suspense>
        ) : (
          // no computador, a busca fica no topo da página; no celular, aqui
          <form action="/" role="search" className="mb-4 lg:hidden">
            <label className="flex h-11 items-center gap-2 rounded-pill bg-surface-300 px-4 text-ink-muted focus-within:outline-2 focus-within:outline-focus">
              <Search aria-hidden className="size-4 shrink-0" />
              <span className="sr-only">Buscar vagas e serviços</span>
              <input
                type="search"
                name="q"
                enterKeyHint="search"
                placeholder="Buscar vaga: garçom, auxiliar…"
                maxLength={80}
                className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-muted"
              />
            </label>
          </form>
        )}
        {!empresa && (
          // onde a pessoa mora e o "Perto de mim" (o tempo de ônibus e a ordem saem daqui)
          <Suspense fallback={null}>
            <BuscaExplorar searchParams={searchParams} className="mb-4" soLugar />
          </Suspense>
        )}
        <Suspense fallback={<ExplorarEsqueleto />}>
          <Explorar searchParams={searchParams} variante="feed" />
        </Suspense>
      </MolduraDaHome>
      <Suspense fallback={null}>
        <Contratados />
      </Suspense>
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
              <CartaoDaConta modo="contratar" />
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

/** A coluna da direita do feed: quem contrata perto (com o Seguir) e os conteúdos. */
async function ColunaDireita() {
  const local = await obterLocal();
  return (
    <>
      <ContratandoPerto local={local} />
      <DoBlog />
    </>
  );
}

/** Gente contratada pelo Publike (com o sim dos dois lados): aparece com 3 ou mais. */
async function Contratados() {
  return <ContratacoesNaHome agora={await agoraDaRequisicao()} />;
}
