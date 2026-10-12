import { MapPinned, SearchX } from "lucide-react";
import { buscarAnuncios, listarMeusServicos, obterMeuCurriculo, obterUsuario } from "@/lib/dados";
import { aplicarIntencao, descreverOrigem, hrefFiltros, lerFiltros, RAIOS, type Filtros } from "@/lib/filtros";
import { tipoDaIntencao, type Intencao } from "@/lib/intencao";
import { obterIntencao } from "@/lib/servidor/intencao";
import { deslocamentoCurto, nomeDoTempo } from "@/lib/deslocamento";
import {
  formatarDistancia,
  formatarLugar,
  primeiro,
  rotuloConta,
  rotuloModalidade,
  valorCurto,
  valorDoAnuncio,
} from "@/lib/formato";
import type { OrigemMapa, PontoMapa } from "../mapa/mapa-anuncios";
import { obterLocal } from "@/lib/local";
import { passosDaPrioridade, pontoDoLocal, type Local } from "@/lib/regioes";
import { agoraDaRequisicao } from "@/lib/tempo";
import { CardAnuncio, EsqueletoCards } from "../card-anuncio";
import { Aviso, Container, Esqueleto, Vazio } from "../ui/basicos";
import { BotaoLink } from "../ui/botao";
import { BarraBusca, BotaoSoMeus, FiltrosLista } from "./barra-busca";
import type { ProximoPasso } from "./intencao";
import { VisaoExplorar } from "./visao-explorar";

type Parametros = Promise<Record<string, string | string[] | undefined>>;

/**
 * O próximo passo de quem respondeu "O que você quer fazer no Publike?", ao lado da
 * resposta. Com conta, leva em conta o que já fez (currículo pronto, vitrine montada).
 */
async function proximoPassoDa(intencao: Intencao | null, logado: boolean): Promise<ProximoPasso> {
  try {
    switch (intencao) {
      case "trabalho":
        return logado && (await obterMeuCurriculo())
          ? { texto: "Acompanhar minhas curtidas", href: "/painel/curtidas" }
          : { texto: "Preencher meu currículo", href: "/perfil/curriculo" };
      case "oferecer_servico":
        return logado && (await listarMeusServicos()).length > 0
          ? { texto: "Ver quem quer me contratar", href: "/painel" }
          : { texto: "Montar minha vitrine", href: "/painel/servicos" };
      case "contratar_pessoa":
        return { texto: "Publicar vaga grátis", href: "/publicar" };
      default:
        return null;
    }
  } catch {
    // o atalho é um extra: se a leitura falhar, a busca segue sem ele
    return null;
  }
}

/** A busca do topo da página (fica dentro do destaque, logo abaixo do título). */
export async function BuscaExplorar({ searchParams }: { searchParams: Parametros }) {
  const sp = await searchParams;
  const [local, intencao, usuario] = await Promise.all([obterLocal(), obterIntencao(), obterUsuario()]);
  const filtros = aplicarIntencao(lerFiltros(sp), tipoDaIntencao(intencao));
  const proximoPasso = await proximoPassoDa(intencao, Boolean(usuario));
  return (
    <BarraBusca
      filtros={filtros}
      local={local}
      intencao={intencao}
      proximoPasso={proximoPasso}
      abrirOndeMora={primeiro(sp.casa) === "1"}
    />
  );
}

/** Sem GPS nem ponto no mapa, as distâncias contam a partir de onde a pessoa mora. */
function partirDoLocal(filtros: Filtros, local: Local | null): Filtros {
  if (!local || filtros.origem !== "centro") return filtros;
  return { ...filtros, ...pontoDoLocal(local) };
}

function textoDaOrigem(filtros: Filtros, local: Local | null) {
  if (!local || filtros.origem !== "centro") return descreverOrigem(filtros.origem);
  if (local.ponto) return "da sua casa";
  if (local.centro) return `do meio de ${local.bairro}`;
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
  const [agora, local, usuario, intencao] = await Promise.all([
    agoraDaRequisicao(),
    obterLocal(),
    obterUsuario(),
    obterIntencao(),
  ]);
  const filtros = partirDoLocal(aplicarIntencao(lerFiltros(parametros), tipoDaIntencao(intencao)), local);
  const anuncios = await buscarAnuncios(filtros, agora, local, usuario?.id ?? null);

  const tempoDe = origemDoTempo(filtros, local);
  const pontos: PontoMapa[] = anuncios.map((a) => {
    const tempo = tempoDe && a.tipo === "vaga" ? deslocamentoCurto(a.distancia_km) : null;
    return {
      id: a.id,
      lat: a.lat,
      lng: a.lng,
      titulo: a.titulo,
      tipo: a.tipo,
      lugar: formatarLugar(a.bairro, a.cidade),
      valor: valorDoAnuncio(a),
      curto:
        a.tipo === "servico" && a.pagamento_valor != null
          ? `a partir de ${valorCurto(a.pagamento_valor, a.pagamento_unidade)}`
          : valorCurto(a.pagamento_valor, a.pagamento_unidade),
      modalidade: rotuloModalidade(a.tipo, a.regime),
      distancia: formatarDistancia(a.distancia_km),
      tempo: tempo ? `${tempo} ${tempoDe === "casa" ? "da sua casa" : "de onde você está"}` : null,
      autor: `${a.autor_nome} · ${rotuloConta(a.autor_tipo)}`,
    };
  });
  // a casa (CEP) ou o GPS aparecem no mapa
  const origem: OrigemMapa =
    tempoDe === "casa"
      ? { lat: filtros.lat, lng: filtros.lng, rotulo: "Sua casa", tipo: "casa" }
      : tempoDe === "voce"
        ? { lat: filtros.lat, lng: filtros.lng, rotulo: "Você está aqui", tipo: "voce" }
        : null;

  const n = anuncios.length;
  const nome =
    filtros.tipo === "vaga"
      ? ["vaga", "vagas"]
      : filtros.tipo === "servico"
        ? ["serviço", "serviços"]
        : ["oportunidade", "oportunidades"];
  const contagem =
    n === 0
      ? `Nenhum resultado`
      : filtros.meus
        ? `${n} ${n === 1 ? "anúncio seu" : "anúncios seus"}`
        : `${n >= 60 ? "60+" : n} ${n === 1 ? nome[0] : nome[1]}`;
  const maiorRaio = RAIOS[RAIOS.length - 1];

  const lista =
    n > 0 ? (
      // blocos: 1 a 3 colunas; grade: cartões pequenos, 2 a 4 colunas; lista: uma linha por anúncio (ver VisaoExplorar)
      <div className="grid gap-4 sm:grid-cols-2 group-data-[visao=blocos]/visao:lg:grid-cols-3 group-data-[visao=grade]/visao:grid-cols-2 group-data-[visao=grade]/visao:gap-3 group-data-[visao=grade]/visao:sm:grid-cols-3 group-data-[visao=grade]/visao:lg:grid-cols-4 group-data-[visao=lista]/visao:grid-cols-1 group-data-[visao=lista]/visao:gap-2">
        {anuncios.map((a) => (
          <CardAnuncio
            key={a.id}
            anuncio={a}
            agora={agora}
            usuarioId={usuario?.id ?? null}
            pertoDeCasa={local ? a.prioridade : null}
            tempoDe={tempoDe}
          />
        ))}
      </div>
    ) : filtros.meus ? (
      <Vazio
        icone={SearchX}
        titulo={usuario ? "Nenhum anúncio seu nesta busca" : "Entre para ver os seus anúncios"}
        acao={
          usuario ? (
            <>
              <BotaoLink href={hrefFiltros(filtros, { meus: false })} scroll={false}>
                Ver todos
              </BotaoLink>
              <BotaoLink href="/painel/anuncios">Meus anúncios</BotaoLink>
            </>
          ) : (
            <BotaoLink href="/entrar?next=%2F%3Fmeus%3D1">Entrar</BotaoLink>
          )
        }
      >
        {usuario
          ? "Aqui aparecem só os seus anúncios que estão no ar. Os pausados, encerrados e em análise ficam em Meus anúncios."
          : "Com a conta, dá para ver na busca só o que você publicou."}
      </Vazio>
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
          <>
            <p className="text-body-sm text-ink-muted">
              {!filtros.meus && local && !local.ponto && <>Primeiro: {passosDaPrioridade(local).join(" › ")} · </>}
              {!filtros.meus && local?.ponto && filtros.origem === "centro" && <>Do mais perto ao mais longe · </>}
              {filtros.meus ? (
                <>Só os seus anúncios no ar, do mais perto ao mais longe {textoDaOrigem(filtros, local)}</>
              ) : (
                <>
                  {filtros.tempo ? nomeDoTempo(filtros.tempo).toLowerCase() : `em até ${filtros.raio} km`}{" "}
                  {textoDaOrigem(filtros, local)}
                </>
              )}
            </p>
            {(usuario || filtros.meus) && <BotaoSoMeus filtros={filtros} />}
          </>
        }
        filtrosLista={<FiltrosLista filtros={filtros} />}
        lista={lista}
        pontos={pontos}
        origem={origem}
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
