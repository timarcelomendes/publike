import { BriefcaseBusiness } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { iaLigadaNoSite } from "@/lib/dados";
import { formatarLugar, valorCurto, valorDoAnuncio } from "@/lib/formato";
import { anunciosNoAr, type AnuncioNoAr } from "@/lib/servidor/paginas-busca";
import { Avatar, Container, fundoDoNome, Selo } from "../ui/basicos";
import { cidadeDaVisita } from "@/lib/servidor/cidade";
import { distanciaKm } from "@/lib/descobrir";
import { type Local, pontoDoLocal } from "@/lib/regioes";
import { destaquesDaVisita } from "@/lib/servidor/banners";
import { GiroDoHero } from "./giro-do-hero";

// A home de quem não entrou na conta (direção B): a faixa clara (papel da marca) com a busca e, no
// computador, três vagas novas inclinadas ao lado (com destaques do admin no ar, girando com eles). A lista
// de sempre vem logo abaixo.

/**
 * Quantas vagas estão no ar na praça, só com 20 ou mais (número pequeno passa a ideia de vazio). Os serviços
 * saíram da conta (02/11/2026, claude/plano-home-visitante.md, item 5): "e 6 serviços" diminuía a frase.
 */
async function NoAr({ cidade }: { cidade: string }) {
  const vagas = await anunciosNoAr("vaga", cidade);
  if (vagas.length < 20) return null;
  // a leitura traz até 200
  return <span className="hidden lg:inline">{vagas.length >= 200 ? "200+" : vagas.length} vagas no ar. </span>;
}

/**
 * A faixa do topo: selo, título, a linha de apoio e a busca (num cartão claro). No
 * celular, baixa, para os anúncios aparecerem logo; os destaques só no computador.
 * O título diz a cidade de quem está vendo (onde mora, pelo endereço de internet ou a
 * cidade principal da praça).
 */
export async function HeroVitrine({ busca }: { busca: ReactNode }) {
  const { cidade } = await cidadeDaVisita();
  return (
    <Container className="pt-3 sm:pt-6">
      <section className="grid items-center gap-8 rounded-lg bg-surface-300 p-3 text-ink sm:p-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-10 lg:rounded-[28px] lg:px-12 lg:py-10">
        <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-1 pt-1 sm:gap-x-3 sm:p-0">
            {/* no celular, uma linha só */}
            <h1 className="font-display text-[20px] leading-[26px] font-extrabold tracking-tight sm:text-[44px] sm:leading-[48px] lg:text-display">
              Trabalho perto de você<span className="hidden sm:inline">, em {cidade}</span>.
            </h1>
            <Selo variante="novo" className="sm:order-first">
              Grátis<span className="hidden sm:inline"> para todo mundo</span>
            </Selo>
          </div>
          <p className="hidden text-body text-ink-muted sm:block sm:text-body-lg">
            Vagas com carteira, diárias, freelances e profissionais do bairro. Curtir é se candidatar: deu match, vocês
            conversam.{" "}
            <Suspense fallback={null}>
              <NoAr cidade={cidade} />
            </Suspense>
            <a
              href="#entenda"
              className="whitespace-nowrap text-ink underline underline-offset-2 hover:text-terra-text"
            >
              Entenda como funciona
            </a>
          </p>
          <div className="text-ink sm:max-w-xl">{busca}</div>
          <Suspense fallback={null}>
            <PortaDeQuemContrata />
          </Suspense>
        </div>
        <Suspense fallback={null}>
          <ColunaDoHero cidade={cidade} />
        </Suspense>
      </section>
    </Container>
  );
}

/**
 * A porta de quem contrata na faixa do alto (02/11/2026, claude/plano-home-visitante.md): a faixa fala com quem
 * procura trabalho, e o "Mande a foto da vaga" ficava lá no fim da página. Só a partir do tablet: no celular,
 * nada entre o título e os anúncios (o Publicar fica na barra de baixo).
 */
async function PortaDeQuemContrata() {
  const foto = await iaLigadaNoSite().catch(() => false);
  return (
    <p className="hidden items-center gap-2 text-body text-ink-muted sm:flex">
      <BriefcaseBusiness aria-hidden className="size-5 shrink-0 text-terra-text" />
      <span>
        Está contratando?{" "}
        <Link href="/publicar" className="font-semibold text-ink underline underline-offset-2 hover:text-terra-text">
          Publique a vaga grátis
        </Link>
        {foto && (
          <>
            {" "}
            ou{" "}
            <Link
              href={`/entrar?next=${encodeURIComponent("/publicar#arte")}`}
              className="font-semibold text-ink underline underline-offset-2 hover:text-terra-text"
            >
              mande a foto da vaga
            </Link>
          </>
        )}
        .
      </span>
    </p>
  );
}

/** As 3 vagas mais novas, de quem publicou cada uma (uma por empresa), para dar vida à faixa. */
function escolherDestaques(vagas: AnuncioNoAr[]) {
  const vistos = new Set<string>();
  const escolhidas: AnuncioNoAr[] = [];
  // primeiro quem diz o valor; quem não diz entra só se faltar
  for (const comValor of [true, false]) {
    for (const v of vagas) {
      if (escolhidas.length === 3) break;
      if (vistos.has(v.autor_id) || (v.pagamento_valor != null) !== comValor) continue;
      vistos.add(v.autor_id);
      escolhidas.push(v);
    }
  }
  return escolhidas;
}

const GIROS = ["-rotate-2", "rotate-[1.5deg]", "-rotate-1"];

/**
 * A coluna da direita (só no computador): as 3 vagas novas e, com destaques no ar (Admin › Banners, formato
 * "Destaque no alto da inicial"), o giro entre elas e até 4 destaques, começando pelas vagas.
 */
async function ColunaDoHero({ cidade }: { cidade: string }) {
  const [vagas, banners] = await Promise.all([anunciosNoAr("vaga", cidade), destaquesDaVisita().catch(() => [])]);
  const escolhidas = escolherDestaques(vagas);
  const pilha = escolhidas.length >= 2 ? <PilhaDeVagas destaques={escolhidas} /> : null;
  if (!banners.length) return pilha;
  return <GiroDoHero vagas={pilha} destaques={banners} />;
}

function PilhaDeVagas({ destaques }: { destaques: AnuncioNoAr[] }) {
  return (
    <ul aria-label="Vagas novas" className="hidden flex-col gap-3 lg:flex">
      {destaques.map((v, i) => (
        <li key={v.id} className={`${GIROS[i]} transition-transform hover:rotate-0`}>
          <Link
            href={`/anuncio/${v.id}`}
            className="flex items-center gap-3 rounded-[18px] border border-line bg-surface-200 px-4 py-3.5 text-ink shadow-raised outline-offset-2 hover:bg-surface-100"
          >
            <Avatar
              nome={v.autor_nome}
              foto={v.autor_foto}
              tamanho={44}
              forma={v.autor_tipo === "pessoa" ? "redonda" : "quadrada"}
              colorida
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-label">{v.titulo}</span>
              <span className="block truncate text-body-sm text-ink-muted">
                {v.autor_nome} · {formatarLugar(v.bairro, v.cidade)}
              </span>
            </span>
            <span className="shrink-0 rounded-pill bg-surface-300 px-2.5 py-0.5 text-[12px] leading-5 font-bold text-cerrado-text">
              {valorCurto(v.pagamento_valor, v.pagamento_unidade)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Novas": as 4 vagas mais novas, uma por empresa, com a capa na cor de quem publicou, sem as que
 * já estão no topo da página. Com o lugar de quem vê (CEP, bairro ou perfil), só as de perto (até
 * 10 km; com poucas, até 25 km) e o título diz "perto de você"; sem lugar, não aparece (02/11/2026).
 */
export async function NovasHoje({ local }: { local: Local | null }) {
  // sem lugar, a lista de cima já vem pelas mais novas (Explorar, semLugar): a seção só repetiria
  if (!local) return null;
  const { praca } = await cidadeDaVisita();
  const todas = await anunciosNoAr("vaga", praca.cidade);
  const noTopo = new Set(escolherDestaques(todas).map((v) => v.id));
  let restantes = todas.filter((v) => !noTopo.has(v.id));
  const ponto = local ? pontoDoLocal(local) : null;
  if (ponto) {
    const ate = (km: number) => restantes.filter((v) => distanciaKm(ponto.lat, ponto.lng, v.lat, v.lng) <= km);
    const pertinho = ate(10);
    restantes = pertinho.length >= 4 ? pertinho : ate(25);
  }
  const vagas = escolherNovas(restantes, 4);
  if (vagas.length < 2) return null;
  return (
    <Container className="mt-10 sm:mt-12">
      <section aria-labelledby="novas-hoje">
        <div className="flex items-end justify-between gap-3">
          <h2 id="novas-hoje" className="text-h2 sm:text-[28px] sm:leading-[34px]">
            {ponto ? "Novas perto de você" : `Novas em ${praca.nome}`}
          </h2>
          <a href="#vagas" className="text-label text-terra-text underline underline-offset-2 hover:text-ink">
            Ver todas
          </a>
        </div>
        <ul className="sem-barra -mx-4 mt-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
          {vagas.map((v) => (
            <li key={v.id} className="w-64 shrink-0 sm:w-auto">
              <article className="h-full">
                <Link
                  href={`/anuncio/${v.id}`}
                  className="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card transition-shadow hover:shadow-raised"
                >
                  <span aria-hidden className={`relative block h-20 ${fundoDoNome(v.autor_nome)}`}>
                    <span className="absolute -bottom-6 left-4 rounded-md bg-surface-200 p-0.5 shadow-card">
                      <Avatar
                        nome={v.autor_nome}
                        foto={v.autor_foto}
                        tamanho={44}
                        forma={v.autor_tipo === "pessoa" ? "redonda" : "quadrada"}
                        colorida
                      />
                    </span>
                  </span>
                  <span className="flex flex-1 flex-col gap-1 px-4 pt-9 pb-4">
                    <span className="font-display text-h3 leading-snug">{v.titulo}</span>
                    <span className="text-body-sm text-ink-muted">{v.autor_nome}</span>
                    <span className="text-body-sm font-semibold text-terra-text">
                      {formatarLugar(v.bairro, v.cidade)}
                    </span>
                    <span className="mt-auto pt-2 text-body font-bold">{valorDoAnuncio(v)}</span>
                  </span>
                </Link>
              </article>
            </li>
          ))}
        </ul>
      </section>
    </Container>
  );
}

function escolherNovas(vagas: AnuncioNoAr[], quantas: number) {
  const vistos = new Set<string>();
  const escolhidas: AnuncioNoAr[] = [];
  for (const v of vagas) {
    if (escolhidas.length === quantas) break;
    if (vistos.has(v.autor_id)) continue;
    vistos.add(v.autor_id);
    escolhidas.push(v);
  }
  // poucas empresas: completa com as outras vagas mais novas
  for (const v of vagas) {
    if (escolhidas.length === quantas) break;
    if (!escolhidas.includes(v)) escolhidas.push(v);
  }
  return escolhidas;
}
