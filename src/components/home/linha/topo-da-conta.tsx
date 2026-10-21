import { Search } from "lucide-react";
import Link from "next/link";
import { forcaDoCurriculo } from "@/lib/curriculo-forca";
import { listarMeusServicos, obterMeuCurriculo, obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { ehFundo } from "@/lib/fundos";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { nomeDoTempo } from "@/lib/deslocamento";
import { filtrosMudados, hrefFiltros, SEM_FILTROS } from "@/lib/filtros";
import { numeroDaAba, quandoFoi, saudacao } from "@/lib/linha-do-tempo";
import { chaveDaLinha, dadosDaLinha, preferenciasDaHome } from "@/lib/servidor/linha";
import { perfilDeUso } from "@/lib/servidor/perfil-de-uso";
import { BarraBusca, FiltrosLista } from "../../explorar/barra-busca";
import { primeiro } from "@/lib/formato";
import { AbasDaLinha, BotaoFiltrosDaLinha } from "./abas-da-linha";
import { TopoComFundo } from "./topo-com-fundo";

type Parametros = Promise<Record<string, string | string[] | undefined>>;

/** A foto do fundo (bucket privado): um link de 1 hora, só para a dona. */
async function linkDoFundo(caminho: string | null) {
  if (!caminho) return null;
  try {
    const supabase = await criarClienteServidor();
    const { data } = await supabase.storage.from("fundos").createSignedUrl(caminho, 3600);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

/** O cartão do próximo passo, pelo uso da conta: o currículo (quem procura) ou a vitrine (quem faz serviço). */
async function proximoPasso() {
  const uso = await perfilDeUso();
  if (uso === "servicos") {
    const servicos = await listarMeusServicos().catch(() => []);
    if (servicos.length > 0) return null;
    return {
      titulo: "Sua vitrine",
      pontos: null,
      texto: "Coloque um serviço na vitrine e apareça para quem procura perto.",
      botao: "Montar a vitrine",
      href: "/painel/servicos",
    };
  }
  const curriculo = await obterMeuCurriculo().catch(() => null);
  const { pontos } = forcaDoCurriculo(curriculo);
  if (pontos >= 100) return null;
  return {
    titulo: "Seu currículo",
    pontos,
    texto: curriculo
      ? "Complete e as empresas veem seu % de match em cada vaga."
      : "Em 5 minutos as empresas daqui acham você e mostram o seu % de match.",
    botao: curriculo ? "Completar" : "Montar o currículo",
    href: "/perfil/curriculo",
  };
}

/**
 * O topo da home de quem entrou: a foto do perfil, a saudação e quantas novidades chegaram desde
 * a última visita; à direita, o próximo passo; embaixo, as abas da linha do tempo encaixadas.
 */
export async function TopoDaConta({ searchParams }: { searchParams: Parametros }) {
  const sp = await searchParams;
  // "Informe seu CEP" (?casa=1): os filtros já abrem com o "Onde você mora?"
  const casa = primeiro(sp.casa) === "1";
  const [d, perfil, passo, prefs, usuario] = await Promise.all([
    dadosDaLinha(chaveDaLinha(sp)),
    obterMeuPerfil(),
    proximoPasso(),
    preferenciasDaHome(),
    obterUsuario(),
  ]);
  const urlDaFoto = prefs.fundo === "foto" ? await linkDoFundo(prefs.fundoArquivo) : null;
  const nome = perfil?.nome?.split(" ")[0] ?? "";
  const frase =
    d.marca === null ? null : d.novas.tudo > 0 ? (
      <>
        <b className="font-semibold text-on-hero">
          {d.novas.tudo === 1 ? "1 novidade" : `${d.novas.tudo > 99 ? "99+" : d.novas.tudo} novidades`}
        </b>{" "}
        desde {quandoFoi(d.marca, d.agora)}.
      </>
    ) : (
      <>Nada novo desde {quandoFoi(d.marca, d.agora)}.</>
    );
  // os links das abas e dos filtros: sem a ordem (a linha é sempre do mais novo para o mais antigo)
  const base = { ...d.filtrosDaBusca, ordem: "perto" as const };
  const mudados = filtrosMudados(d.filtrosDaBusca, true);
  const textoDoRaio = d.filtros.tempo ? nomeDoTempo(d.filtros.tempo).toLowerCase() : `até ${d.filtros.raio} km`;

  // sem um invólucro: as abas ficam presas no alto ao rolar a página toda (o "sticky" vale dentro do pai)
  return (
    <>
      <TopoComFundo
        fundo={ehFundo(prefs.fundo) ? prefs.fundo : "preto"}
        urlDaFoto={urlDaFoto}
        pessoaId={usuario?.pessoaId ?? ""}
        nome={perfil?.nome ?? ""}
        foto={perfil?.foto ?? null}
        texto={
          <>
            <h1 className="font-display text-[26px] leading-[30px] font-extrabold tracking-[-0.02em] sm:text-[44px] sm:leading-[48px]">
              {saudacao(d.agora)}
              {nome ? `, ${nome}` : ""}.
            </h1>
            {frase && (
              <p className="mt-1 text-body-sm text-on-hero-muted sm:mt-2.5 sm:text-[17px] sm:leading-[26px]">{frase}</p>
            )}
          </>
        }
        lado={
          <>
            {passo && (
              <div className="hidden w-[380px] shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-2.5 rounded-[20px] bg-surface-200 px-[18px] py-4 text-ink lg:grid">
                <p className="col-span-2 flex items-baseline justify-between text-[15px] leading-5 font-bold">
                  {passo.titulo}
                  {passo.pontos !== null && <span className="tabular-nums">{passo.pontos}%</span>}
                </p>
                {passo.pontos !== null && (
                  <span className="col-span-2 h-2 overflow-hidden rounded-pill bg-surface-300">
                    <span className="block h-full rounded-pill bg-cerrado" style={{ width: `${passo.pontos}%` }} />
                  </span>
                )}
                <p className="text-body-sm text-ink-muted">{passo.texto}</p>
                <Link
                  href={passo.href}
                  className="inline-flex min-h-10 items-center justify-self-end rounded-md bg-terra px-4 text-label text-on-terra hover:bg-terra-hover"
                >
                  {passo.botao}
                </Link>
              </div>
            )}
          </>
        }
        embaixo={
          <>
            {/* no celular: a busca (com os filtros dentro) e o próximo passo numa linha */}
            <form action="/" role="search" className="mt-3.5 sm:hidden">
              <label className="flex h-12 items-center gap-2.5 rounded-[16px] bg-surface-200 pr-1.5 pl-4 text-ink-muted focus-within:outline-2 focus-within:outline-focus">
                <Search aria-hidden className="size-5 shrink-0" />
                <span className="sr-only">Buscar vagas e serviços</span>
                <input
                  type="search"
                  name="q"
                  enterKeyHint="search"
                  placeholder="Buscar vaga: garçom, auxiliar…"
                  maxLength={80}
                  className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-muted"
                />
                <BotaoFiltrosDaLinha mudados={mudados} />
              </label>
            </form>
            {passo && (
              <Link
                href={passo.href}
                className="mt-3 flex items-center gap-2.5 text-body-sm text-on-hero-muted lg:hidden"
              >
                {passo.pontos !== null && (
                  <span className="h-1.5 w-16 overflow-hidden rounded-pill bg-[rgb(251_247_239/0.18)]">
                    <span className="block h-full rounded-pill bg-cerrado" style={{ width: `${passo.pontos}%` }} />
                  </span>
                )}
                <b className="font-semibold text-on-hero">
                  {passo.titulo}
                  {passo.pontos !== null && ` ${passo.pontos}%`}
                </b>
                <span className="ml-auto font-semibold text-on-hero underline underline-offset-2">{passo.botao}</span>
              </Link>
            )}
            <div className="h-4 sm:h-[30px]" />
          </>
        }
      />
      <AbasDaLinha
        aba={d.aba}
        numeros={{
          tudo: numeroDaAba(d.novas.tudo),
          vaga: numeroDaAba(d.novas.vaga),
          servico: numeroDaAba(d.novas.servico),
        }}
        hrefs={{
          tudo: hrefFiltros(base, { tipo: null, tudo: true, regime: base.regime, turno: null }),
          vaga: hrefFiltros(base, { tipo: "vaga", tudo: false }),
          servico: hrefFiltros(base, { tipo: "servico", tudo: false, regime: null, turno: null }),
        }}
        mudados={mudados}
        abrirFiltros={casa}
        textoDoRaio={textoDoRaio}
        filtros={
          <>
            {/* de onde contam as distâncias: a casa (CEP) ou onde a pessoa está agora */}
            <BarraBusca filtros={base} local={d.local} abrirOndeMora={casa} className="" soLugar />
            <FiltrosLista filtros={base} quebrar semOrdem />
            {mudados > 0 && (
              <Link
                href={hrefFiltros(base, SEM_FILTROS)}
                scroll={false}
                className="self-end text-label text-ink underline underline-offset-2 hover:text-terra-text"
              >
                Limpar filtros
              </Link>
            )}
          </>
        }
      />
      <div aria-hidden className="h-6 sm:h-7" />
    </>
  );
}
