import { MapPinned, SearchX } from "lucide-react";
import { buscarAnuncios, obterUsuario } from "@/lib/dados";
import { nomeDoTempo } from "@/lib/deslocamento";
import { descreverOrigem, hrefFiltros, lerFiltros, RAIOS, type Filtros } from "@/lib/filtros";
import { formatarLugar, primeiro, valorDoAnuncio } from "@/lib/formato";
import { obterLocal } from "@/lib/local";
import { passosDaPrioridade, pontoDoLocal, type Local } from "@/lib/regioes";
import { agoraDaRequisicao } from "@/lib/tempo";
import { CardAnuncio, EsqueletoCards } from "../card-anuncio";
import { Aviso, Container, Esqueleto, Vazio } from "../ui/basicos";
import { BotaoLink } from "../ui/botao";
import { BarraBusca, FiltrosLista } from "./barra-busca";
import { VisaoExplorar } from "./visao-explorar";

type Parametros = Promise<Record<string, string | string[] | undefined>>;

/** A busca do topo da página (fica dentro do destaque, logo abaixo do título). */
export async function BuscaExplorar({ searchParams }: { searchParams: Parametros }) {
  const sp = await searchParams;
  const filtros = lerFiltros(sp);
  const local = await obterLocal();
  return <BarraBusca filtros={filtros} local={local} abrirOndeMora={primeiro(sp.casa) === "1"} />;
}

/** Sem GPS nem ponto no mapa, as distâncias contam a partir de onde a pessoa mora. */
function partirDoLocal(filtros: Filtros, local: Local | null): Filtros {
  if (!local || filtros.origem !== "centro") return filtros;
  return { ...filtros, ...pontoDoLocal(local) };
}

function textoDaOrigem(filtros: Filtros, local: Local | null) {
  if (!local || filtros.origem !== "centro") return descreverOrigem(filtros.origem);
  if (local.ponto) return "da sua casa";
  return local.regiao ? `da Região ${local.regiao} de Goiânia` : `do centro de ${local.cidade}`;
}

/** De onde sai o tempo de ônibus dos cards: da casa (CEP) ou do GPS. */
function origemDoTempo(filtros: Filtros, local: Local | null): "casa" | "voce" | null {
  if (filtros.origem === "gps") return "voce";
  if (filtros.origem === "centro" && local?.ponto) return "casa";
  return null;
}

export function BuscaEsqueleto() {
  return (
    <div className="mt-6 flex flex-col gap-3 sm:mt-8" aria-busy="true">
      <div className="flex justify-between gap-2">
        <Esqueleto className="h-12 w-64 rounded-pill" />
        <Esqueleto className="hidden h-10 w-36 rounded-pill sm:block" />
      </div>
      <Esqueleto className="h-14 w-full rounded-lg" />
      <div className="flex gap-2 overflow-hidden py-1">
        {Array.from({ length: 6 }, (_, i) => (
          <Esqueleto key={i} className="h-10 w-36 shrink-0 rounded-pill" />
        ))}
      </div>
    </div>
  );
}

export async function Explorar({ searchParams }: { searchParams: Parametros }) {
  const parametros = await searchParams;
  const [agora, local] = await Promise.all([agoraDaRequisicao(), obterLocal()]);
  const filtros = partirDoLocal(lerFiltros(parametros), local);
  const [anuncios, usuario] = await Promise.all([buscarAnuncios(filtros, agora, local), obterUsuario()]);

  const pontos = anuncios.map((a) => ({
    id: a.id,
    lat: a.lat,
    lng: a.lng,
    titulo: a.titulo,
    tipo: a.tipo,
    lugar: formatarLugar(a.bairro, a.cidade),
    valor: valorDoAnuncio(a),
  }));

  const n = anuncios.length;
  const nome = filtros.tipo === "vaga" ? ["vaga", "vagas"] : filtros.tipo === "servico" ? ["serviço", "serviços"] : ["oportunidade", "oportunidades"];
  const contagem = n === 0 ? `Nenhum resultado` : `${n >= 60 ? "60+" : n} ${n === 1 ? nome[0] : nome[1]}`;
  const maiorRaio = RAIOS[RAIOS.length - 1];

  const lista =
    n > 0 ? (
      <div className="grid gap-4 sm:grid-cols-2">
        {anuncios.map((a) => (
          <CardAnuncio
            key={a.id}
            anuncio={a}
            agora={agora}
            usuarioId={usuario?.id ?? null}
            pertoDeCasa={local ? a.prioridade : null}
            tempoDe={origemDoTempo(filtros, local)}
          />
        ))}
      </div>
    ) : (
      <Vazio
        icone={filtros.q || filtros.categoria ? SearchX : MapPinned}
        titulo="Nada por aqui ainda"
        acao={
          <>
            {(filtros.tempo || filtros.raio < maiorRaio) && (
              <BotaoLink href={hrefFiltros(filtros, { raio: maiorRaio, tempo: null })} scroll={false}>
                Buscar até {maiorRaio} km
              </BotaoLink>
            )}
            {filtros.tipo === "servico" ? (
              <BotaoLink href="/painel/servicos">Oferecer meus serviços</BotaoLink>
            ) : (
              <BotaoLink href="/publicar">Publicar grátis</BotaoLink>
            )}
          </>
        }
      >
        {filtros.q || filtros.categoria
          ? "Tente outra palavra, outra categoria ou uma distância maior."
          : filtros.tipo === "servico"
            ? "Ainda não há profissionais nesta área. Você faz algum serviço? Mostre aqui."
            : "Ainda não há anúncios nesta área. Que tal ser o primeiro a publicar?"}
      </Vazio>
    );

  return (
    <Container className="pt-6 sm:pt-8">
      {primeiro(parametros.conta) === "excluida" && (
        <Aviso tipo="sucesso" className="mb-6" titulo="Sua conta foi excluída.">
          Apagamos seu perfil, seus anúncios e suas curtidas. Obrigado por ter usado o Publike.
        </Aviso>
      )}
      <VisaoExplorar
        titulo={
          <h2 className="text-h2" aria-live="polite">
            {contagem}
          </h2>
        }
        subtitulo={
          <p className="text-body-sm text-ink-muted">
            {local && !local.ponto && <>Primeiro: {passosDaPrioridade(local).join(" › ")} · </>}
            {local?.ponto && filtros.origem === "centro" && <>Do mais perto ao mais longe · </>}
            {filtros.tempo ? nomeDoTempo(filtros.tempo).toLowerCase() : `em até ${filtros.raio} km`} {textoDaOrigem(filtros, local)}
          </p>
        }
        filtrosLista={<FiltrosLista filtros={filtros} />}
        lista={lista}
        pontos={pontos}
        filtros={filtros}
      />
    </Container>
  );
}

export function ExplorarEsqueleto() {
  return (
    <Container className="pt-6 sm:pt-8" aria-busy="true">
      {/* mesma grade do cabeçalho de VisaoExplorar */}
      <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 lg:gap-x-6">
        <Esqueleto className="h-8 w-48" />
        <Esqueleto className="h-10 w-28 rounded-pill lg:hidden" />
        <Esqueleto className="col-span-2 mt-1 h-4 w-56 lg:col-span-1" />
        <div className="col-span-2 mt-2 flex gap-2 overflow-hidden lg:col-span-1 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:self-end">
          {["w-44", "w-28", "w-32"].map((largura) => (
            <Esqueleto key={largura} className={`h-10 shrink-0 rounded-md ${largura}`} />
          ))}
        </div>
      </div>
      <div className="lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-6">
        <EsqueletoCards />
        <Esqueleto className="hidden h-[calc(100dvh-7rem)] rounded-lg lg:block" />
      </div>
    </Container>
  );
}
