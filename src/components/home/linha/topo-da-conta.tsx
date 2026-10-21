import { FileText, Inbox, Plus, Search, Store, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { esperaResposta } from "@/lib/constantes";
import { forcaDoCurriculo } from "@/lib/curriculo-forca";
import { listarMeusAnuncios, listarMeusCandidatos, obterMeuCurriculo, obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { nomeDoTempo } from "@/lib/deslocamento";
import { filtrosMudados, hrefFiltros, SEM_FILTROS } from "@/lib/filtros";
import { plural, primeiro } from "@/lib/formato";
import { numeroDaAba, quandoFoi, saudacao } from "@/lib/linha-do-tempo";
import { chaveDaLinha, dadosDaLinha } from "@/lib/servidor/linha";
import { perfilDeUso } from "@/lib/servidor/perfil-de-uso";
import { BarraBusca, FiltrosLista } from "../../explorar/barra-busca";
import { EscreverRecado } from "../../recados/escrever-recado";
import { FotoDaConta } from "../foto-da-conta";
import { AbasDaLinha } from "./abas-da-linha";

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

/**
 * O topo da home de quem entrou (no meio, ao lado do cartão da conta): a saudação com as novidades
 * desde a última visita e a ação que mais pede a conta; o campo do recado, numa linha só (abre ao
 * tocar); as abas da linha do tempo e os filtros. No celular, sem o cartão, a foto (que troca ali
 * mesmo) vai ao lado da saudação.
 */
export async function TopoDaConta({ searchParams }: { searchParams: Parametros }) {
  const sp = await searchParams;
  // "Informe seu CEP" (?casa=1): os filtros já abrem com o "Onde você mora?"
  const casa = primeiro(sp.casa) === "1";
  const [d, perfil, acao, usuario] = await Promise.all([
    dadosDaLinha(chaveDaLinha(sp)),
    obterMeuPerfil(),
    proximaAcao(),
    obterUsuario(),
  ]);
  const empresa = Boolean(perfil && perfil.tipo !== "pessoa");
  // pessoa: o primeiro nome; empresa, comércio e agência: o nome inteiro
  const nome = (empresa ? perfil?.nome : perfil?.nome?.split(" ")[0])?.trim() ?? "";
  const frase =
    d.marca === null
      ? null
      : d.novas.tudo > 0
        ? `${d.novas.tudo === 1 ? "1 novidade" : `${d.novas.tudo > 99 ? "99+" : d.novas.tudo} novidades`} desde ${quandoFoi(d.marca, d.agora)}`
        : `Nada novo desde ${quandoFoi(d.marca, d.agora)}`;
  // os links das abas e dos filtros: sem a ordem (a linha é sempre do mais novo para o mais antigo)
  const base = { ...d.filtrosDaBusca, ordem: "perto" as const };
  const mudados = filtrosMudados(d.filtrosDaBusca, true);
  const textoDoRaio = d.filtros.tempo ? nomeDoTempo(d.filtros.tempo).toLowerCase() : `até ${d.filtros.raio} km`;
  const Icone = acao?.icone;

  // sem um invólucro: as abas ficam presas no alto ao rolar a página toda (o "sticky" vale dentro do pai)
  return (
    <>
      <section aria-label="Sua conta" className="flex flex-col gap-3.5 sm:gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
        {/* no celular e no tablet, a busca (no computador, ela fica no cabeçalho) */}
        <form action="/" role="search" className="lg:hidden">
          <label className="flex h-12 items-center gap-2.5 rounded-pill border border-line bg-surface-200 px-4 text-ink focus-within:outline-2 focus-within:outline-focus">
            <Search aria-hidden className="size-5 shrink-0 text-terra-text" />
            <span className="sr-only">Buscar vagas e serviços</span>
            <input
              type="search"
              name="q"
              enterKeyHint="search"
              placeholder="Garçom, diarista, auxiliar…"
              maxLength={80}
              className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-muted"
            />
          </label>
        </form>
        {usuario && (
          <EscreverRecado
            pessoaId={usuario.pessoaId}
            autorTipo={d.autorTipo}
            // no celular a foto já está ao lado da saudação
            avatar={
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
            }
          />
        )}
      </section>
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
          <>
            {/* de onde contam as distâncias: a casa (CEP) ou onde a pessoa está agora */}
            <BarraBusca
              filtros={base}
              local={d.local}
              abrirOndeMora={casa}
              className=""
              soLugar
              umaLinha
              // o lugar e os filtros da lista numa linha só (os filtros rolam de lado)
              extra={<FiltrosLista filtros={base} semOrdem />}
            />
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
      <div aria-hidden className="h-4 sm:h-5" />
    </>
  );
}
