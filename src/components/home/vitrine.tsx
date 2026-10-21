import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { formatarLugar, valorCurto, valorDoAnuncio } from "@/lib/formato";
import { anunciosNoAr, type AnuncioNoAr } from "@/lib/servidor/paginas-busca";
import { Avatar, Container, fundoDoNome, Selo } from "../ui/basicos";

// A home de quem não entrou na conta (direção B): a faixa escura com a busca e, no
// computador, três vagas novas inclinadas ao lado. A lista de sempre vem logo abaixo.

/** Quantas vagas e quantos serviços estão no ar (só com muitos, para não parecer vazio). */
async function NoAr() {
  const [vagas, servicos] = await Promise.all([anunciosNoAr("vaga"), anunciosNoAr("servico")]);
  if (vagas.length + servicos.length < 20) return null;
  // a leitura traz até 200 de cada
  const n = (x: number) => (x >= 200 ? "200+" : String(x));
  return (
    <span className="hidden lg:inline">
      {n(vagas.length)} vagas e {n(servicos.length)} serviços no ar.{" "}
    </span>
  );
}

/**
 * A faixa do topo: selo, título, a linha de apoio e a busca (num cartão claro). No
 * celular, baixa, para os anúncios aparecerem logo; os destaques só no computador.
 */
export function HeroVitrine({ busca }: { busca: ReactNode }) {
  return (
    <Container className="pt-3 sm:pt-6">
      <section className="grid items-center gap-8 rounded-lg bg-hero p-3 text-on-hero sm:p-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-10 lg:rounded-[28px] lg:px-12 lg:py-10">
        <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-1 pt-1 sm:gap-x-3 sm:p-0">
            {/* no celular, uma linha só */}
            <h1 className="font-display text-[20px] leading-[26px] font-extrabold tracking-tight sm:text-[44px] sm:leading-[48px] lg:text-display">
              Trabalho perto de você<span className="hidden sm:inline">, em Goiânia</span>.
            </h1>
            <Selo variante="novo" className="sm:order-first">
              Grátis<span className="hidden sm:inline"> para todo mundo</span>
            </Selo>
          </div>
          <p className="hidden text-body text-on-hero-muted sm:block sm:text-body-lg">
            Vagas com carteira, diárias, freelances e profissionais do bairro. Curtiu, deu match, vocês conversam.{" "}
            <Suspense fallback={null}>
              <NoAr />
            </Suspense>
            <a href="#entenda" className="whitespace-nowrap text-on-hero underline underline-offset-2 hover:text-ipe">
              Entenda como funciona
            </a>
          </p>
          <div className="text-ink sm:max-w-xl">{busca}</div>
        </div>
        <Suspense fallback={null}>
          <DestaquesDoHero />
        </Suspense>
      </section>
    </Container>
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

async function DestaquesDoHero() {
  const destaques = escolherDestaques(await anunciosNoAr("vaga"));
  if (destaques.length < 2) return null;
  return (
    <ul aria-label="Vagas novas" className="hidden flex-col gap-3 lg:flex">
      {destaques.map((v, i) => (
        <li key={v.id} className={`${GIROS[i]} transition-transform hover:rotate-0`}>
          <Link
            href={`/anuncio/${v.id}`}
            className="flex items-center gap-3 rounded-[18px] bg-surface-100 px-4 py-3.5 text-ink shadow-raised outline-offset-2 hover:bg-surface-200"
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

/** "Novas hoje": as 4 vagas mais novas, uma por empresa, com a capa na cor de quem publicou. */
export async function NovasHoje() {
  const vagas = escolherNovas(await anunciosNoAr("vaga"), 4);
  if (vagas.length < 2) return null;
  return (
    <Container className="mt-10 sm:mt-12">
      <section aria-labelledby="novas-hoje">
        <div className="flex items-end justify-between gap-3">
          <h2 id="novas-hoje" className="text-h2 sm:text-[28px] sm:leading-[34px]">
            Novas perto de você
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
