import {
  Briefcase,
  CircleCheck,
  Heart,
  MapPinned,
  MessageSquareText,
  PartyPopper,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { hrefFiltros, RAIOS } from "@/lib/filtros";
import { horaNaLinha, montarLinha, quandoFoi, recolherRecados, type ItemDaLinha } from "@/lib/linha-do-tempo";
import type { EstadoConexao } from "@/lib/conexoes";
import { estadosDeConexao } from "@/lib/servidor/conexoes";
import { chaveDaLinha, dadosDaLinha, type DadoDaLinha, type DadosDaLinha } from "@/lib/servidor/linha";
import { BalaoDoRecado } from "../../recados/balao-do-recado";
import { RecadosRecolhidos } from "../../recados/recados-recolhidos";
import { Avatar, Vazio } from "../../ui/basicos";
import { BotaoLink } from "../../ui/botao";
import { ListaDaLinha } from "./lista-da-linha";
import { FimDoRaio } from "./raio-da-linha";
import {
  CartaoDaConquista,
  CartaoDaResposta,
  CartaoDoAceite,
  CartaoDoServico,
  ComentariosDoTiquete,
  FaixaDeCurtidas,
  TicketDaVaga,
} from "./objetos";
import { RegistrarVisita } from "./registrar-visita";
import { QuadroDeImpulsionadas } from "../../quadro-de-impulsionadas";
import { QUADRO_DA_LISTA } from "@/lib/destaques";
import { distanciaKm } from "@/lib/descobrir";
import { vagasDoQuadro } from "@/lib/impulso";
import { anunciosNoAr, vagasImpulsionadas, type AnuncioNoAr, type VagaImpulsionada } from "@/lib/servidor/paginas-busca";
import { PerguntaDaConquista } from "../../conquistas/pergunta-da-conquista";

type Parametros = Promise<Record<string, string | string[] | undefined>>;

// No computador: a hora, o nó no traço e o objeto (as duas primeiras colunas estreitas, para o tíquete
// ter espaço). No celular, só o objeto (a hora vai para o canto dele).
const GRADE = "sm:grid sm:grid-cols-[48px_32px_minmax(0,1fr)] sm:gap-x-2";

// o nó tem o tom do tipo, como o cartão ao lado
const NO = {
  vaga: "bg-tom-vaga text-terra-text",
  servico: "bg-tom-servico text-cerrado-text",
  aceite: "bg-cerrado text-on-cerrado",
  // a conquista (quem começou a trabalhar): a festa, no tom do aceite mais leve
  conquista: "bg-cerrado/15 text-cerrado-text",
  // a vaga que as pessoas estão curtindo: o coração da curtida
  curtidas: "bg-like-soft text-like",
  // a notícia do Publike: o jornal, no tom neutro (não é anúncio nem conversa)
};

function No({ icone: Icone, tipo }: { icone: LucideIcon; tipo: keyof typeof NO }) {
  return (
    <span
      aria-hidden
      className={`relative z-[1] mt-2.5 hidden size-8 place-items-center justify-self-center rounded-pill shadow-[0_0_0_4px_var(--pk-surface-100)] sm:grid ${NO[tipo]}`}
    >
      <Icone className="size-4" />
    </span>
  );
}

/** O nó de quem escreveu (recado) ou de quem está escrevendo agora (com o anel ipê). */
function NoDaFoto({
  nome,
  foto,
  tipo,
  agora = false,
}: {
  nome: string;
  foto: string | null;
  tipo: string;
  agora?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={`relative z-[1] mt-1.5 hidden justify-self-center rounded-pill sm:block ${
        agora
          ? "shadow-[0_0_0_2px_var(--pk-surface-100),0_0_0_4px_var(--pk-ipe),0_0_0_7px_var(--pk-surface-100)]"
          : "shadow-[0_0_0_4px_var(--pk-surface-100)]"
      }`}
    >
      <Avatar nome={nome} foto={foto} tamanho={32} forma={tipo === "pessoa" ? "redonda" : "quadrada"} colorida />
    </span>
  );
}

function Ponto({ terra = false }: { terra?: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative z-[1] hidden size-3 justify-self-center rounded-pill shadow-[0_0_0_5px_var(--pk-surface-100)] sm:block ${
        terra ? "bg-terra" : "bg-ink"
      }`}
    />
  );
}

const HORA =
  "hidden pt-[18px] text-right text-[13px] leading-4 font-semibold whitespace-nowrap text-ink-muted tabular-nums sm:block";

/** Um item da linha (vaga, serviço, recado, aceite ou notícia), com a hora e o nó. */
function Item({
  item,
  d,
  logado,
  conexoes,
}: {
  item: ItemDaLinha<DadoDaLinha>;
  d: DadosDaLinha;
  logado: boolean;
  /** a conexão com quem escreveu cada recado (para o Conectar no rodapé) */
  conexoes: Map<string, EstadoConexao>;
}) {
  // nas mais relevantes não há o separador do dia: antes de hoje, "ontem" e "3 d" (e não "19:51")
  const hora = horaNaLinha(Date.parse(item.quando), d.agora, d.relevantes);
  const dados = item.dados;
  return (
    <div className={`${GRADE} items-start`}>
      <span className={HORA}>{hora}</span>
      {"aceite" in dados ? (
        <>
          <No icone={CircleCheck} tipo="aceite" />
          <CartaoDoAceite m={dados.aceite} hora={hora} usuarioId={d.usuarioId} direto={dados.direto} />
        </>
      ) : "resposta" in dados ? (
        <>
          <No icone={MessageSquareText} tipo="vaga" />
          <CartaoDaResposta r={dados.resposta} hora={hora} />
        </>
      ) : "conquista" in dados ? (
        <>
          <No icone={PartyPopper} tipo="conquista" />
          <CartaoDaConquista c={dados.conquista} hora={hora} />
        </>
      ) : "recado" in dados ? (
        <>
          <NoDaFoto nome={dados.recado.autor_nome} foto={dados.recado.autor_foto} tipo={dados.recado.autor_tipo} />
          <BalaoDoRecado
            r={dados.recado}
            logado={logado}
            hora={hora}
            conexao={conexoes.get(dados.recado.autor_id) ?? null}
          />
        </>
      ) : dados.anuncio.anuncio.tipo === "servico" ? (
        <>
          <No icone={Wrench} tipo="servico" />
          <CartaoDoServico item={dados.anuncio} hora={hora} usuarioId={d.usuarioId} />
        </>
      ) : (
        <>
          {dados.anuncio.curtidas ? <No icone={Heart} tipo="curtidas" /> : <No icone={Briefcase} tipo="vaga" />}
          {/* a vaga: quantas curtiram (em cima, quando as pessoas estão curtindo), o tíquete e, embaixo, os comentários
              (abrem ali mesmo) e o Indicar */}
          <div className="flex min-w-0 flex-col gap-1.5">
            {dados.anuncio.curtidas && <FaixaDeCurtidas item={dados.anuncio} usuarioId={d.usuarioId} />}
            <TicketDaVaga item={dados.anuncio} hora={hora} usuarioId={d.usuarioId} tempoDe={d.tempoDe} />
            <ComentariosDoTiquete item={dados.anuncio} usuarioId={d.usuarioId} />
          </div>
        </>
      )}
    </div>
  );
}

/** O dia de Goiânia de um instante ("2026-11-09"). */
const diaDeGoiania = (quando: number) => new Date(quando).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/**
 * Na aba Posts, o convite para seguir rolando nas vagas perto: some só quando o dia tiver mais de 10 posts (a pedido do
 * Marcelo, 09/11/2026).
 */
function PoucosPosts({ d }: { d: DadosDaLinha }) {
  const hoje = diaDeGoiania(d.agora);
  const deHoje = d.itens.filter((i) => diaDeGoiania(Date.parse(i.quando)) === hoje).length;
  if (deHoje > 10) return null;
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-line bg-surface-200 p-4 sm:ml-[102px]">
      <p className="text-body-sm text-ink-muted">Enquanto chegam mais posts, veja também as vagas perto de você.</p>
      <BotaoLink href={hrefFiltros(d.filtrosDaBusca, { tipo: "vaga", tudo: false })} variante="secundario">
        Ver as vagas perto de você
      </BotaoLink>
    </div>
  );
}

/** No "só olhar", ninguém é dono de nada na linha: os cartões ficam como os de quem procura trabalho. */
const QUEM_SO_OLHA = "so-olhar";

/**
 * A linha do tempo da home: vagas, serviços, recados e aceites, do mais novo para o mais antigo,
 * com os separadores de dia e a marca "Você parou aqui". No Tudo, depois de 2 recados seguidos, o
 * resto recolhe. `meio`: o que entra uma vez depois do 4º item, só no celular (quem está
 * contratando; no computador, fica em cima do mapa). `doPublike`: o cartão "Do Publike", depois do 3º item;
 * `noTopo`: o cartão "Do Publike" no formato topo, antes do primeiro item.
 */
export async function LinhaDoTempo({
  searchParams,
  meio = null,
  soOlhar = false,
  doPublike = null,
  noTopo = null,
}: {
  searchParams: Parametros;
  meio?: ReactNode;
  /** empresa vendo como pessoa: as vagas da conta aparecem como as pessoas veem (com Curtir, que não age) */
  soOlhar?: boolean;
  /** o cartão "Do Publike" (um banner no formato cartão), como um item a mais */
  doPublike?: ReactNode;
  /** o cartão "Do Publike" no topo da linha (um banner no formato topo), antes de tudo */
  noTopo?: ReactNode;
}) {
  const daConta = await dadosDaLinha(chaveDaLinha(await searchParams));
  const d = soOlhar && daConta.usuarioId ? { ...daConta, usuarioId: QUEM_SO_OLHA } : daConta;
  const logado = d.usuarioId !== null;
  const autores = [
    ...new Set(
      d.itens.flatMap((i) => ("recado" in i.dados && !i.dados.recado.meu ? [i.dados.recado.autor_id] : [])),
    ),
  ];
  const conexoes = logado && autores.length ? await estadosDeConexao(autores) : new Map<string, EstadoConexao>();
  // "Deu certo?" e "Mostrar no Publike?": a pergunta da conquista, uma por vez, no alto (não no "só olhar")
  const pendente = !soOlhar ? d.conquistasPendentes[0] : undefined;
  const pergunta = pendente ? (
    <PerguntaDaConquista key={`${pendente.anuncio_id}:${pendente.resposta ?? ""}`} pendente={pendente} meuNome={d.meuNome ?? ""} />
  ) : null;
  if (!d.itens.length) {
    const maior = RAIOS[RAIOS.length - 1];
    return (
      <section aria-label="Linha do tempo" className="flex flex-col gap-3">
        {pergunta}
        {d.aba === "recado" ? (
          <Vazio
            icone={MessageSquareText}
            titulo="Nenhum post por aqui ainda"
            acao={
              <BotaoLink href={hrefFiltros(d.filtrosDaBusca, { tipo: "vaga", tudo: false })} variante="secundario">
                Ver as vagas perto de você
              </BotaoLink>
            }
          >
            Poste o primeiro: conte o que você procura ou quem você está contratando.
          </Vazio>
        ) : (
          <Vazio
            icone={MapPinned}
            titulo={d.aba === "servico" ? "Nenhum serviço por aqui ainda" : "Nada por aqui ainda"}
            acao={
              (d.filtros.tempo || d.filtros.raio < maior) && (
                <BotaoLink
                  href={hrefFiltros(d.filtrosDaBusca, { raio: d.maisLonge?.faixas[0]?.raio ?? maior, tempo: null })}
                  scroll={false}
                >
                  Buscar até {d.maisLonge?.faixas[0]?.raio ?? maior} km
                </BotaoLink>
              )
            }
          >
            {d.filtros.q || d.filtros.categoria || d.filtros.turno
              ? "Tente outra palavra, outra categoria ou uma distância maior."
              : "Quando aparecer algo novo perto de você, entra aqui."}
          </Vazio>
        )}
        <RegistrarVisita />
      </section>
    );
  }

  const blocos: ReactNode[] = [];
  const contam: boolean[] = [];
  let n = 0;
  if (noTopo) {
    blocos.push(
      <div key="no-topo" className="empty:hidden">
        {noTopo}
      </div>,
    );
    contam.push(false);
  }
  // as vagas impulsionadas perto de quem vê, no alto da linha (claude/plano-destaque-das-vagas-impulsionadas.md)
  const quadro = d.aba === "tudo" || d.aba === "vaga" ? await vagasDoQuadroDaLinha(d) : [];
  if (quadro.length) {
    blocos.push(
      <QuadroDeImpulsionadas
        key="impulsionadas"
        vagas={quadro.map((q) => q.vaga)}
        codigos={Object.fromEntries(quadro.map((q) => [q.vaga.id, q.impulso]))}
        agora={d.agora}
        usuarioId={d.usuarioId}
      />,
    );
    contam.push(false);
  }
  for (const p of recolherRecados(montarLinha(d.itens, d.marca, d.agora, d.relevantes, d.porQue), d.aba === "tudo")) {
    if (p.tipo === "dia") {
      blocos.push(
        // "Relevantes para você": no celular, a ordem logo acima já diz (o título fica para o leitor de tela)
        <div key={p.chave} className={`${GRADE} items-center pt-2 ${p.chave === "relevantes" ? "max-sm:sr-only" : ""}`}>
          <span className="hidden sm:block" />
          <Ponto />
          {/* o título numa linha só; o que vem ao lado (a data ou o porquê da ordem) quebra para baixo inteiro */}
          <h2 className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 font-display text-[22px] leading-7 font-bold tracking-[-0.01em] sm:text-[24px] sm:leading-[30px]">
            <span className="whitespace-nowrap">{p.titulo}</span>
            <span className="font-sans text-body-sm font-medium tracking-normal text-ink-muted">{p.data}</span>
          </h2>
        </div>,
      );
      contam.push(false);
    } else if (p.tipo === "marca") {
      blocos.push(
        <div key={p.chave} role="separator" aria-label="Você parou aqui" className={`${GRADE} items-center py-1`}>
          <span className="hidden sm:block" />
          <Ponto terra />
          <p className="flex items-center gap-2.5 text-label whitespace-nowrap text-terra-text after:h-0 after:flex-1 after:border-t-2 after:border-dashed after:border-terra-text/45">
            Você parou aqui
            <span className="font-medium text-ink-muted">{quandoFoi(p.quando, d.agora)}</span>
          </p>
        </div>,
      );
      contam.push(false);
    } else if (p.tipo === "recolhidos") {
      blocos.push(
        <div key={p.chave} className="flex flex-col gap-2.5 sm:gap-3">
          <RecadosRecolhidos quantos={p.itens.length} grade={GRADE}>
            {p.itens.map((item) => (
              <Item key={`${item.tipo}-${item.id}`} item={item} d={d} logado={logado} conexoes={conexoes} />
            ))}
          </RecadosRecolhidos>
        </div>,
      );
      contam.push(true);
    } else {
      blocos.push(<Item key={p.chave} item={p.item} d={d} logado={logado} conexoes={conexoes} />);
      contam.push(true);
      n++;
      if (n === 3 && doPublike) {
        blocos.push(
          <div key="do-publike" className="empty:hidden">
            {doPublike}
          </div>,
        );
        contam.push(false);
      }
      if (n === 4 && meio) {
        blocos.push(
          <div key="meio" className="xl:hidden">
            {meio}
          </div>,
        );
        contam.push(false);
      }
    }
  }

  return (
    <>
      {pergunta && <div className="mb-3">{pergunta}</div>}
      {/* até onde a linha busca fica no topo, na linha da ordem (RaioDaLinha, em topo-da-conta.tsx) */}
      <section aria-label="Linha do tempo" className="relative flex flex-col gap-2.5 pb-8 sm:gap-3">
        {/* o traço da linha, no meio da coluna dos nós */}
        <span aria-hidden className="absolute top-3 bottom-0 left-[71px] hidden w-0.5 rounded-pill bg-line sm:block" />
        <ListaDaLinha
          partes={blocos}
          contam={contam}
          fim={d.aba === "recado" ? <PoucosPosts d={d} /> : <FimDoRaio d={d} />}
        />
        <RegistrarVisita />
      </section>
    </>
  );
}

/**
 * O quadro da linha do tempo: as vagas impulsionadas da praça dentro do raio de quem vê (e da categoria escolhida), sem
 * as da própria conta, até uma linha, na ordem que gira a cada hora.
 */
async function vagasDoQuadroDaLinha(
  d: DadosDaLinha,
): Promise<{ vaga: AnuncioNoAr; impulso: VagaImpulsionada }[]> {
  const [impulsionadas, daPraca] = await Promise.all([
    vagasImpulsionadas().catch((): Record<string, VagaImpulsionada> => ({})),
    anunciosNoAr("vaga").catch(() => [] as AnuncioNoAr[]),
  ]);
  const perto = daPraca.filter(
    (a) =>
      impulsionadas[a.id] &&
      a.autor_id !== d.usuarioId &&
      (!d.filtros.categoria || a.categoria === d.filtros.categoria) &&
      distanciaKm(d.filtros.lat, d.filtros.lng, a.lat, a.lng) <= d.filtros.raio,
  );
  return vagasDoQuadro(perto, d.agora, QUADRO_DA_LISTA).map((vaga) => ({ vaga, impulso: impulsionadas[vaga.id] }));
}
