import { ArrowLeft, FileText, Inbox, Plus, Search, Store, type LucideIcon } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { esperaResposta } from "@/lib/constantes";
import { COOKIE_CONVITE_RECADO, conviteRecadoFechado } from "@/lib/convite-recado";
import { forcaDoCurriculo } from "@/lib/curriculo-forca";
import { listarMeusAnuncios, listarMeusCandidatos, obterMeuCurriculo, obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { nomeDoTempo } from "@/lib/deslocamento";
import { filtrosMudados, hrefFiltros, SEM_FILTROS } from "@/lib/filtros";
import { plural, primeiro, tempoRelativo } from "@/lib/formato";
import { numeroDaAba, quandoFoi, saudacao } from "@/lib/linha-do-tempo";
import { chaveDaLinha, dadosDaLinha } from "@/lib/servidor/linha";
import { perfilDeUso, type PerfilDeUso } from "@/lib/servidor/perfil-de-uso";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { TextoDoConvite } from "../../recados/convite-recado";
import { BarraBusca, FiltrosLista } from "../../explorar/barra-busca";
import { FotoDaConta } from "../foto-da-conta";
import { AbasDaLinha, OrdemDaLinha } from "./abas-da-linha";
import { FaixaDeQuemContrata } from "./faixa-de-quem-contrata";
import { BuscaERecado } from "./busca-e-recado";
import { cidadeDaVisita } from "@/lib/servidor/cidade";
import { meuPdfNaoSalvo } from "@/lib/servidor/curriculo-pendente";
import { Aviso } from "../../ui/basicos";

type Parametros = Promise<Record<string, string | string[] | undefined>>;

/** `noCartao`: no computador o cartão da esquerda já tem esse atalho (o botão some de lá) */
type Acao = { texto: string; href: string; icone: LucideIcon; noCartao?: boolean };

/** A ação que mais pede a conta agora, pelo uso: quem contrata, quem presta serviço, quem procura. */
async function proximaAcao(): Promise<Acao | null> {
  const uso = await perfilDeUso();
  if (uso === "contratar") {
    const candidatos = await listarMeusCandidatos().catch(() => null);
    const esperam = (candidatos ?? []).filter(esperaResposta).length;
    return esperam
      ? {
          texto: `Responder ${plural(esperam, "candidato", "candidatos")}`,
          href: "/painel/caixa?aba=responder",
          icone: Inbox,
        }
      : { texto: "Publicar vaga", href: "/publicar", icone: Plus };
  }
  if (uso === "servicos") {
    const anuncios = await listarMeusAnuncios().catch(() => []);
    const servicos = anuncios.filter((a) => a.tipo === "servico");
    if (!servicos.length) return { texto: "Montar a vitrine", href: "/painel/servicos", icone: Store, noCartao: true };
    const pedidos = servicos.reduce((t, a) => t + (a.curtidas_novas ?? 0), 0);
    return pedidos
      ? {
          texto: `Responder ${plural(pedidos, "pedido", "pedidos")}`,
          href: "/painel/anuncios?tipo=servico",
          icone: Inbox,
          noCartao: true,
        }
      : null;
  }
  const curriculo = await obterMeuCurriculo().catch(() => null);
  const { pontos } = forcaDoCurriculo(curriculo);
  if (pontos >= 100) return null;
  return {
    texto: curriculo ? `Completar o currículo · ${pontos}%` : "Montar o currículo",
    href: "/perfil/curriculo",
    icone: FileText,
    noCartao: true,
  };
}

const TEXTOS_DO_CONVITE: Record<PerfilDeUso, TextoDoConvite> = {
  trabalho: {
    pedido: "Conte o que você procura.",
    exemplo: "Tenho experiência como garçom e procuro vaga aqui perto.",
    quemVe: "Quem contrata perto de você vê.",
  },
  servicos: {
    pedido: "Conte o serviço que você faz.",
    exemplo: "Sou eletricista e atendo aqui no bairro. Orçamento sem compromisso.",
    quemVe: "Quem precisa do serviço perto de você vê.",
  },
  contratar: {
    pedido: "Conte quem você está contratando.",
    exemplo: "Estamos contratando auxiliar de cozinha para o fim de semana.",
    quemVe: "Quem procura trabalho perto de você vê.",
  },
};

/**
 * O convite para o primeiro recado (em cima do campo): só para a conta que nunca deixou recado e
 * que não tocou em "Agora não" há pouco. O texto segue o uso da conta.
 */
async function conviteDoRecado(): Promise<TextoDoConvite | null> {
  const [usuario, jar, agora] = await Promise.all([obterUsuario(), cookies(), agoraDaRequisicao()]);
  if (!usuario || conviteRecadoFechado(jar.get(COOKIE_CONVITE_RECADO)?.value, agora)) return null;
  // os recados da própria conta (para a dona, também os em revisão)
  const [{ data, error }, uso] = await Promise.all([
    (await criarClienteServidor()).rpc("recados_do_perfil", { p_perfil: usuario.id, p_limite: 1 }),
    perfilDeUso(),
  ]);
  // sem dar para saber (ou já escreveu), sem convite
  if (error || (data ?? []).length > 0) return null;
  return TEXTOS_DO_CONVITE[uso];
}

/** A busca no celular e no tablet (no computador, ela fica no cabeçalho). */
function CampoDaBusca({ valor = "", className }: { valor?: string; className?: string }) {
  return (
    <form action="/" role="search" className={className}>
      <label className="flex h-12 items-center gap-2.5 rounded-pill border border-line bg-surface-200 px-4 text-ink focus-within:outline-2 focus-within:outline-focus">
        <Search aria-hidden className="size-5 shrink-0 text-terra-text" />
        <span className="sr-only">Buscar vagas e serviços</span>
        <input
          type="search"
          name="q"
          enterKeyHint="search"
          placeholder="Garçom, diarista, auxiliar…"
          maxLength={80}
          defaultValue={valor}
          className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-muted"
        />
      </label>
    </form>
  );
}

/**
 * O topo da home de quem entrou (no meio, ao lado do cartão da conta): a saudação com as novidades
 * desde a última visita e a ação que mais pede a conta; o campo do recado, numa linha só (abre ao
 * tocar); as abas da linha do tempo e os filtros. No celular, sem o cartão, a foto (que troca ali
 * mesmo) vai ao lado da saudação.
 */
export async function TopoDaConta({ searchParams, soOlhar = false }: { searchParams: Parametros; soOlhar?: boolean }) {
  const sp = await searchParams;
  // busca por palavra ("mecânico"): a página vira a dos resultados, com o título na lista; a saudação,
  // o recado e as abas da linha do tempo saem. Fica só o campo da busca no celular, já com a palavra.
  const q = primeiro(sp.q)?.trim().slice(0, 80);
  if (q) return <CampoDaBusca valor={q} className="mb-4 lg:hidden" />;
  // as listas ("Para você", "Mais perto", "Novas"): a lista tem a barra dela (os atalhos e o Filtros);
  // aqui, só a volta para a linha do tempo (e a busca, no celular)
  if (primeiro(sp.ordem) && primeiro(sp.ordem) !== "relevantes" && primeiro(sp.ordem) !== "ultimas") {
    return (
      <div className="mb-3 flex flex-col gap-3">
        <CampoDaBusca className="lg:hidden" />
        <Link
          href="/"
          className="inline-flex min-h-9 items-center gap-1.5 self-start text-label text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Linha do tempo
        </Link>
      </div>
    );
  }
  // "Informe seu CEP" (?casa=1): os filtros já abrem com o "Onde você mora?"
  const casa = primeiro(sp.casa) === "1";
  const [d, perfil, proxima, usuario, visita, convite, pdfNaoSalvo] = await Promise.all([
    dadosDaLinha(chaveDaLinha(sp)),
    obterMeuPerfil(),
    // só olhando (empresa vendo como pessoa), nada a fazer pela conta
    soOlhar ? Promise.resolve(null) : proximaAcao(),
    obterUsuario(),
    cidadeDaVisita(),
    soOlhar ? Promise.resolve(null) : conviteDoRecado().catch(() => null),
    // mandou o PDF do currículo e ele não foi salvo: o aviso fica aqui até salvar
    soOlhar ? Promise.resolve(null) : meuPdfNaoSalvo(),
  ]);
  const acao: Acao | null =
    pdfNaoSalvo && proxima?.href === "/perfil/curriculo" ? { ...proxima, texto: "Terminar o currículo" } : proxima;
  const empresa = Boolean(perfil && perfil.tipo !== "pessoa");
  // pessoa: o primeiro nome; empresa, comércio e agência: o nome inteiro
  const nome = (empresa ? perfil?.nome : perfil?.nome?.split(" ")[0])?.trim() ?? "";
  // "N novidades desde…" só quando a pessoa volta depois de mais de 30 min fora (a 1ª abertura da visita)
  const frase =
    d.marca === null || !d.visitaNova
      ? null
      : d.novas.tudo > 0
        ? `${d.novas.tudo === 1 ? "1 novidade" : `${d.novas.tudo > 99 ? "99+" : d.novas.tudo} novidades`} desde ${quandoFoi(d.marca, d.agora)}`
        : `Nada novo desde ${quandoFoi(d.marca, d.agora)}`;
  // os links das abas e dos filtros: com "Mais relevantes", ela continua; sem, a linha é a das últimas
  const base = { ...d.filtrosDaBusca, ordem: d.relevantes ? ("relevantes" as const) : ("ultimas" as const) };
  // a ordem fica à vista, fora dos Filtros: não conta como filtro mudado
  const mudados = filtrosMudados(d.filtrosDaBusca, true);
  const textoDoRaio = d.filtros.tempo ? nomeDoTempo(d.filtros.tempo).toLowerCase() : `até ${d.filtros.raio} km`;
  const Icone = acao?.icone;

  // sem um invólucro: as abas ficam presas no alto ao rolar a página toda (o "sticky" vale dentro do pai)
  return (
    <>
      <section aria-label="Sua conta" className="flex flex-col gap-3.5 sm:gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {soOlhar ? (
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="font-display text-[18px] leading-6 font-bold text-ink sm:text-[20px]">
                Como quem procura trabalho vê o Publike
              </h2>
              <p className="text-body-sm text-ink-muted sm:text-body">
                As vagas, os serviços e os recados de quem está perto. Só olhar.
              </p>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-3">
              {usuario && (
                <span className="shrink-0 lg:hidden">
                  <FotoDaConta
                    nome={perfil?.nome ?? "?"}
                    foto={perfil?.foto ?? null}
                    empresa={empresa}
                    pessoaId={usuario.pessoaId}
                    podeTrocar={usuario.id === usuario.pessoaId}
                    tamanho={44}
                    className="shrink-0"
                  />
                </span>
              )}
              <p className="min-w-0 text-body-sm text-ink-muted sm:text-body">
                <span className="font-display text-[18px] leading-6 font-bold text-ink sm:text-[20px]">
                  {saudacao(d.agora)}
                  {nome ? `, ${nome}` : ""}.
                </span>{" "}
                {frase}
              </p>
            </div>
          )}
          {acao && Icone && (
            <Link
              href={acao.href}
              className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-terra px-4 text-label text-on-terra transition-colors hover:bg-terra-hover ${
                acao.noCartao ? "lg:hidden" : ""
              }`}
            >
              <Icone aria-hidden className="size-[18px]" />
              {acao.texto}
            </Link>
          )}
        </div>
        {pdfNaoSalvo && (
          <Aviso tipo="alerta" titulo="Seu currículo ainda não foi salvo">
            <p>
              O PDF que você mandou
              {pdfNaoSalvo.enviadoEm ? ` ${tempoRelativo(pdfNaoSalvo.enviadoEm, d.agora)}` : ""} está guardado. Falta
              conferir e tocar em “Salvar currículo” para as empresas verem.
            </p>
            <Link href="/perfil/curriculo" className="self-start text-label underline underline-offset-2">
              Terminar meu currículo
            </Link>
          </Aviso>
        )}
        {usuario && !soOlhar ? (
          // no celular e no tablet, a busca e o "Recado" numa linha (no computador, a busca fica no cabeçalho)
          <BuscaERecado
            busca={<CampoDaBusca />}
            mudados={mudados}
            convite={convite}
            recado={{
              pessoaId: usuario.pessoaId,
              autorTipo: d.autorTipo,
              // no celular a foto já está ao lado da saudação
              avatar: (
                <span className="hidden shrink-0 lg:block">
                  <FotoDaConta
                    nome={perfil?.nome ?? "?"}
                    foto={perfil?.foto ?? null}
                    empresa={empresa}
                    pessoaId={usuario.pessoaId}
                    podeTrocar={usuario.id === usuario.pessoaId}
                    tamanho={40}
                    className="shrink-0"
                  />
                </span>
              ),
            }}
          />
        ) : (
          <BuscaERecado busca={<CampoDaBusca />} mudados={mudados} />
        )}
      </section>
      {/* quem tem vaga no ar: um atalho para as vagas e os candidatos (o Início é o mesmo feed para todos) */}
      {!soOlhar && (
        <div className="mt-3 sm:mt-4">
          <Suspense fallback={null}>
            <FaixaDeQuemContrata agora={d.agora} />
          </Suspense>
        </div>
      )}
      <div aria-hidden className="h-3 sm:h-4" />
      <AbasDaLinha
        aba={d.aba}
        numeros={{
          tudo: numeroDaAba(d.novas.tudo),
          vaga: numeroDaAba(d.novas.vaga),
          servico: numeroDaAba(d.novas.servico),
          recado: numeroDaAba(d.novas.recado),
        }}
        hrefs={{
          tudo: hrefFiltros(base, { tipo: null, tudo: true, regime: base.regime, turno: null }),
          vaga: hrefFiltros(base, { tipo: "vaga", tudo: false }),
          servico: hrefFiltros(base, { tipo: "servico", tudo: false, regime: null, turno: null }),
          // a aba dos recados não é um tipo de anúncio: o mesmo endereço de Tudo, com tipo=recado
          recado: hrefFiltros(base, { tipo: null, tudo: true, regime: null, turno: null }).replace(
            "tipo=tudo",
            "tipo=recado",
          ),
        }}
        mudados={mudados}
        abrirFiltros={casa}
        textoDoRaio={textoDoRaio}
        filtros={
          <div className="flex flex-col gap-4">
            {/* de onde contam as distâncias: a casa (CEP) ou onde a pessoa está agora */}
            <div className="flex flex-col gap-1">
              <span className="text-caption font-semibold text-ink-muted">De onde contar a distância</span>
              <BarraBusca
                filtros={base}
                local={d.local}
                cidade={visita.cidade}
                abrirOndeMora={casa}
                className=""
                soLugar
              />
            </div>
            {/* cada filtro com o nome em cima, em grade: nada fica escondido numa faixa que rola de lado */}
            <FiltrosLista filtros={base} semOrdem comRotulos />
            {mudados > 0 && (
              <Link
                href={hrefFiltros(base, { ...SEM_FILTROS, ordem: base.ordem })}
                scroll={false}
                className="self-end text-label text-ink underline underline-offset-2 hover:text-terra-text"
              >
                Limpar filtros
              </Link>
            )}
          </div>
        }
        ordem={
          d.aba === "recado" ? null : (
            <OrdemDaLinha
              relevantes={d.relevantes}
              ultimas={hrefFiltros(base, { ordem: "ultimas" })}
              maisRelevantes={hrefFiltros(base, { ordem: "relevantes" })}
            />
          )
        }
      />
      <div aria-hidden className="h-4 sm:h-5" />
    </>
  );
}
