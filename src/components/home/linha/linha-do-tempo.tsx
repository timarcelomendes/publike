import {
  Briefcase,
  CircleCheck,
  Heart,
  MapPinned,
  MessageSquareText,
  Newspaper,
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
import { CartaoDaNoticia, CartaoDoAceite, CartaoDoServico, FaixaDeCurtidas, TicketDaVaga } from "./objetos";
import { RegistrarVisita } from "./registrar-visita";

type Parametros = Promise<Record<string, string | string[] | undefined>>;

// No computador: a hora, o nó no traço e o objeto (as duas primeiras colunas estreitas, para o tíquete
// ter espaço). No celular, só o objeto (a hora vai para o canto dele).
const GRADE = "sm:grid sm:grid-cols-[48px_32px_minmax(0,1fr)] sm:gap-x-2";

// o nó tem o tom do tipo, como o cartão ao lado
const NO = {
  vaga: "bg-tom-vaga text-terra-text",
  servico: "bg-tom-servico text-cerrado-text",
  aceite: "bg-cerrado text-on-cerrado",
  // a vaga que as pessoas estão curtindo: o coração da curtida
  curtidas: "bg-like-soft text-like",
  // a notícia do Publike: o jornal, no tom neutro (não é anúncio nem conversa)
  noticia: "bg-ink text-surface-100",
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
  const hora = horaNaLinha(Date.parse(item.quando), d.agora);
  const dados = item.dados;
  return (
    <div className={`${GRADE} items-start`}>
      <span className={HORA}>{hora}</span>
      {"aceite" in dados ? (
        <>
          <No icone={CircleCheck} tipo="aceite" />
          <CartaoDoAceite m={dados.aceite} hora={hora} usuarioId={d.usuarioId} direto={dados.direto} />
        </>
      ) : "noticia" in dados ? (
        <>
          <No icone={Newspaper} tipo="noticia" />
          <CartaoDaNoticia n={dados.noticia} atualizada={dados.atualizada} hora={hora} />
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
          {dados.anuncio.curtidas ? (
            // a vaga que as pessoas estão curtindo: quantas curtiram, em cima do tíquete
            <div className="flex min-w-0 flex-col gap-1.5">
              <FaixaDeCurtidas item={dados.anuncio} usuarioId={d.usuarioId} />
              <TicketDaVaga item={dados.anuncio} hora={hora} usuarioId={d.usuarioId} tempoDe={d.tempoDe} />
            </div>
          ) : (
            <TicketDaVaga item={dados.anuncio} hora={hora} usuarioId={d.usuarioId} tempoDe={d.tempoDe} />
          )}
        </>
      )}
    </div>
  );
}

/** No "só olhar", ninguém é dono de nada na linha: os cartões ficam como os de quem procura trabalho. */
const QUEM_SO_OLHA = "so-olhar";

/**
 * A linha do tempo da home: vagas, serviços, recados e aceites, do mais novo para o mais antigo,
 * com os separadores de dia e a marca "Você parou aqui". No Tudo, depois de 2 recados seguidos, o
 * resto recolhe. `meio`: o que entra uma vez depois do 4º item, só no celular (quem está
 * contratando; no computador, fica em cima do mapa).
 */
export async function LinhaDoTempo({
  searchParams,
  meio = null,
  soOlhar = false,
}: {
  searchParams: Parametros;
  meio?: ReactNode;
  /** empresa vendo como pessoa: as vagas da conta aparecem como as pessoas veem (com Curtir, que não age) */
  soOlhar?: boolean;
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
  if (!d.itens.length) {
    const maior = RAIOS[RAIOS.length - 1];
    return (
      <section aria-label="Linha do tempo" className="flex flex-col gap-3">
        {d.aba === "recado" ? (
          <Vazio icone={MessageSquareText} titulo="Nenhum recado por aqui ainda">
            Escreva o primeiro: conte o que você procura ou quem você está contratando.
          </Vazio>
        ) : (
          <Vazio
            icone={MapPinned}
            titulo={d.aba === "servico" ? "Nenhum serviço por aqui ainda" : "Nada por aqui ainda"}
            acao={
              (d.filtros.tempo || d.filtros.raio < maior) && (
                <BotaoLink href={hrefFiltros(d.filtrosDaBusca, { raio: maior, tempo: null })} scroll={false}>
                  Buscar até {maior} km
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
  for (const p of recolherRecados(montarLinha(d.itens, d.marca, d.agora, d.relevantes), d.aba === "tudo")) {
    if (p.tipo === "dia") {
      blocos.push(
        <div key={p.chave} className={`${GRADE} items-center pt-2`}>
          <span className="hidden sm:block" />
          <Ponto />
          <h2 className="flex items-baseline gap-2.5 font-display text-[22px] leading-7 font-bold tracking-[-0.01em] sm:text-[24px] sm:leading-[30px]">
            {p.titulo}
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
    <section aria-label="Linha do tempo" className="relative flex flex-col gap-2.5 pb-8 sm:gap-3">
      {/* o traço da linha, no meio da coluna dos nós */}
      <span aria-hidden className="absolute top-3 bottom-0 left-[71px] hidden w-0.5 rounded-pill bg-line sm:block" />
      <ListaDaLinha partes={blocos} contam={contam} />
      <RegistrarVisita />
    </section>
  );
}
