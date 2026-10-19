import { BellPlus, MapPinned, Percent, SearchX, Store } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { matchComAVaga, vagaNoTurno, type Aderencia, type Candidato } from "@/lib/aderencia";
import {
  buscarAnuncios,
  listarMeusAnuncios,
  listarMeusServicos,
  meuCurriculoNaVitrine,
  minhasBuscasSalvas,
  obterMeuCurriculo,
  obterMeuPerfil,
  obterUsuario,
  requisitosDasVagas,
  respostaDeQuemPublica,
  temAnuncioNoAr,
  vagasSalvasEntre,
  type DetalhesDaVaga,
} from "@/lib/dados";
import { aplicarIntencao, hrefFiltros, lerFiltros, RAIOS, type Filtros } from "@/lib/filtros";
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
import { passosDaPrioridade, type Local } from "@/lib/regioes";
import { acharBuscaSalva, partirDoLocal, textoDaOrigem } from "@/lib/servidor/busca-salva";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { AnuncioResumo } from "@/lib/tipos";
import { ganhosDoBanco } from "@/lib/vaga-extra";
import { CardAnuncio, EsqueletoCards } from "../card-anuncio";
import { Aviso, Container, Esqueleto, Vazio } from "../ui/basicos";
import { BotaoLink } from "../ui/botao";
import { AvisarBusca } from "./avisar-busca";
import { BarraBusca, FiltrosLista } from "./barra-busca";
import type { ProximoPasso } from "./intencao";
import { PerguntasNaLista } from "./perguntas-na-lista";
import { ListaPaginada } from "./lista-paginada";
import { VisaoExplorar } from "./visao-explorar";

type Parametros = Promise<Record<string, string | string[] | undefined>>;

/** Quantos anúncios a busca traz (a lista mostra de 12 em 12, e o mapa todos). */
const LIMITE = 120;

/**
 * O próximo passo de quem respondeu "O que você quer fazer no Publike?", ao lado da
 * resposta. Com conta, leva em conta o que já fez (currículo pronto, aba Talentos, vitrine).
 */
async function proximoPassoDa(intencao: Intencao | null, logado: boolean): Promise<ProximoPasso> {
  try {
    switch (intencao) {
      case "trabalho": {
        if (!logado) return { texto: "Preencher meu currículo", href: "/perfil/curriculo" };
        if (!(await obterMeuCurriculo())) {
          return { texto: "Preencher currículo e ver o % de match", href: "/perfil/curriculo" };
        }
        // com currículo: o convite para a aba Talentos, até a pessoa entrar nela
        return (await meuCurriculoNaVitrine())
          ? { texto: "Acompanhar minhas curtidas", href: "/painel/curtidas" }
          : { texto: "Aparecer na aba Talentos", href: "/perfil/curriculo#quem-acha" };
      }
      case "talento": {
        if (!logado || !(await obterMeuCurriculo())) {
          return { texto: "Cadastrar meu currículo", href: "/perfil/curriculo?para=talentos" };
        }
        return (await meuCurriculoNaVitrine())
          ? { texto: "Ver a aba Talentos", href: "/talentos" }
          : { texto: "Aparecer na aba Talentos", href: "/perfil/curriculo#quem-acha" };
      }
      case "oferecer_servico":
        return logado && (await listarMeusServicos()).length > 0
          ? { texto: "Ver quem quer me contratar", href: "/painel" }
          : { texto: "Montar minha vitrine", href: "/painel/servicos" };
      case "contratar_servico":
        // os pedidos ficam em Minhas curtidas (sem conta, não há o que acompanhar)
        return logado ? { texto: "Acompanhar meus pedidos", href: "/painel/curtidas" } : null;
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

/** Para o % de match: o currículo e onde a pessoa mora (sem currículo, nada). */
async function quemProcura(): Promise<Omit<Candidato, "respostas"> | null> {
  try {
    const [curriculo, perfil] = await Promise.all([obterMeuCurriculo(), obterMeuPerfil()]);
    return curriculo && perfil ? { curriculo, cidade: perfil.cidade, bairro: perfil.bairro } : null;
  } catch {
    return null;
  }
}

/** O que cada vaga da lista pede (para o % de match e o filtro de turno). */
async function requisitosDaLista(anuncios: AnuncioResumo[]): Promise<Map<string, DetalhesDaVaga>> {
  const ids = anuncios.filter((a) => a.tipo === "vaga").map((a) => a.id);
  if (!ids.length) return new Map();
  const vagas = await requisitosDasVagas(ids);
  return new Map(vagas.map((v) => [v.id, v]));
}

/** A linha de benefícios do cartão (vaga). */
function extrasDe(v: DetalhesDaVaga | undefined) {
  return v
    ? {
        pedeCurriculo: v.pede_curriculo,
        beneficios: v.beneficios_lista ?? [],
        vagas: v.vagas,
        expiraEm: v.expira_em,
        preenchida: Boolean(v.preenchida_em),
        ganhos: ganhosDoBanco(v.ganhos_extras),
      }
    : null;
}

/** O % de match de cada vaga com o currículo de quem busca (as próprias vagas ficam de fora). */
function matchDasVagas(
  anuncios: AnuncioResumo[],
  requisitos: Map<string, DetalhesDaVaga>,
  quem: Omit<Candidato, "respostas">,
  usuarioId: string,
  agora: number,
): Map<string, Aderencia> {
  const m = new Map<string, Aderencia>();
  for (const a of anuncios) {
    const v = requisitos.get(a.id);
    if (!v || a.autor_id === usuarioId) continue;
    const match = matchComAVaga(v, quem, agora);
    if (match) m.set(a.id, match);
  }
  return m;
}

/** A busca do topo da página (fica dentro do destaque, logo abaixo do título). */
export async function BuscaExplorar({ searchParams }: { searchParams: Parametros }) {
  const sp = await searchParams;
  const [local, intencao] = await Promise.all([obterLocal(), obterIntencao()]);
  const filtros = aplicarIntencao(lerFiltros(sp), tipoDaIntencao(intencao));
  return <BarraBusca filtros={filtros} local={local} abrirOndeMora={primeiro(sp.casa) === "1"} />;
}

/** De onde sai o tempo de ônibus dos cards: da casa (CEP) ou do GPS. */
function origemDoTempo(filtros: Filtros, local: Local | null): "casa" | "voce" | null {
  if (filtros.origem === "gps") return "voce";
  if (filtros.origem === "centro" && local?.ponto) return "casa";
  return null;
}

export function BuscaEsqueleto() {
  return (
    <div className="mt-3 flex flex-col gap-3 sm:mt-5" aria-busy="true">
      <div className="flex justify-between gap-2">
        <Esqueleto className="h-12 w-full rounded-md sm:w-80" />
        <Esqueleto className="hidden h-10 w-72 rounded-md sm:block" />
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
  const avisar = filtros.tipo === "vaga" && !filtros.meus;
  // o % de match é para quem procura trabalho (ou ainda não disse o que quer)
  const procuraTrabalho = intencao === null || intencao === "trabalho" || intencao === "talento";
  const [encontrados, proximoPasso, publica, quem, salvas] = await Promise.all([
    buscarAnuncios(filtros, agora, local, usuario?.id ?? null),
    proximoPassoDa(intencao, Boolean(usuario)),
    // "Só os meus" só para quem tem anúncio no ar (quem só procura não precisa dele)
    usuario && !filtros.meus ? temAnuncioNoAr(usuario.id).catch(() => false) : Promise.resolve(filtros.meus),
    usuario && procuraTrabalho && !filtros.meus && filtros.tipo !== "servico" ? quemProcura() : Promise.resolve(null),
    usuario && avisar ? minhasBuscasSalvas().catch(() => []) : Promise.resolve([]),
  ]);
  // o que cada vaga pede e oferece: para o % de match, o turno (a busca do banco não filtra
  // turno) e a linha de benefícios do cartão
  const requisitos = await requisitosDaLista(encontrados).catch(() => null);
  const turno = filtros.turno;
  let anuncios =
    turno && requisitos
      ? encontrados.filter((a) => {
          const v = requisitos.get(a.id);
          return a.tipo === "vaga" && v !== undefined && vagaNoTurno(v, turno);
        })
      : encontrados;
  anuncios = anuncios.slice(0, LIMITE);
  const matches =
    usuario && quem && requisitos
      ? matchDasVagas(anuncios, requisitos, quem, usuario.id, agora)
      : new Map<string, Aderencia>();
  // "Combina mais": do maior % para o menor (sem %, depois, na ordem de perto)
  const combina = filtros.ordem === "combina" && matches.size > 0;
  if (combina) {
    anuncios = anuncios
      .map((a, i) => ({ a, i, nota: matches.get(a.id)?.nota ?? -1 }))
      .sort((x, y) => y.nota - x.nota || x.i - y.i)
      .map((x) => x.a);
  }
  const deOutros = anuncios.filter((a) => a.tipo === "vaga" && a.autor_id !== usuario?.id);
  const temMinhas = Boolean(usuario) && anuncios.some((a) => a.autor_id === usuario?.id);
  const [resposta, salvasAgora, minhas] = await Promise.all([
    respostaDeQuemPublica(deOutros.map((a) => a.autor_id)).catch(() => new Map()),
    usuario ? vagasSalvasEntre(deOutros.map((a) => a.id)).catch(() => null) : Promise.resolve(null),
    temMinhas ? listarMeusAnuncios().catch(() => []) : Promise.resolve([]),
  ]);
  const minhaPorId = new Map(minhas.map((m) => [m.id, { curtidas: m.curtidas_total, novas: m.curtidas_novas }]));
  const buscaSalva = usuario && avisar ? acharBuscaSalva(filtros, salvas) : null;

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
      match: a.minha_curtida === "match" ? null : (matches.get(a.id)?.nota ?? null),
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
        : n > 20
          ? `${n >= LIMITE ? `${LIMITE}+` : n} ${nome[1]}`
          : // com poucas, o número não ajuda: só o que é ("Vagas perto de você")
            `${nome[1][0].toUpperCase()}${nome[1].slice(1)} perto de você`;
  const maiorRaio = RAIOS[RAIOS.length - 1];

  // As perguntas da primeira visita (e depois o próximo passo, com o "Mudar") ficam em cima da lista,
  // junto dos filtros: os anúncios não se partem no meio. Sem nada a perguntar, o espaço some.
  const perguntas = filtros.meus ? null : (
    <PerguntasNaLista filtros={filtros} intencao={intencao} temLocal={Boolean(local)} proximoPasso={proximoPasso} />
  );
  // Poucas vagas (o começo): no fim da lista, o aviso de vaga nova e a distância maior, para quem procura trabalho
  const poucas = n > 0 && n < 10 && !filtros.meus && filtros.tipo !== "servico" && procuraTrabalho;
  // No fim da lista, o convite para quem tem vaga: no começo, são as vagas que mais faltam.
  // Não aparece para quem já disse que procura trabalho ou oferece serviços, nem para quem já tem anúncio no ar.
  const convidarQuemContrata =
    !filtros.meus && filtros.tipo !== "servico" && !publica && (intencao === null || intencao === "contratar_pessoa");

  const lista =
    n > 0 ? (
      // blocos: 1 a 3 colunas; grade: cartões pequenos, 2 a 4 colunas; lista: uma linha por anúncio (ver VisaoExplorar).
      // "dense": com 3 colunas, o terceiro anúncio sobe para o lado dos dois primeiros, antes das perguntas.
      <ListaPaginada
        className="grid grid-flow-row-dense gap-4 sm:grid-cols-2 group-data-[visao=blocos]/visao:lg:grid-cols-3 group-data-[visao=grade]/visao:grid-cols-2 group-data-[visao=grade]/visao:gap-3 group-data-[visao=grade]/visao:sm:grid-cols-3 group-data-[visao=grade]/visao:lg:grid-cols-4 group-data-[visao=lista]/visao:grid-cols-1 group-data-[visao=lista]/visao:gap-2"
        itens={anuncios.map((a) => ({ id: a.id, lat: a.lat, lng: a.lng }))}
        cartoes={anuncios.map((a) => (
          <Fragment key={a.id}>
            <CardAnuncio
              anuncio={a}
              agora={agora}
              usuarioId={usuario?.id ?? null}
              pertoDeCasa={local ? a.prioridade : null}
              tempoDe={tempoDe}
              match={matches.get(a.id) ?? null}
              resposta={a.tipo === "vaga" ? (resposta.get(a.autor_id) ?? null) : null}
              extras={extrasDe(requisitos?.get(a.id))}
              salva={a.tipo === "vaga" && salvasAgora && a.autor_id !== usuario?.id ? salvasAgora.has(a.id) : null}
              minha={minhaPorId.get(a.id) ?? null}
            />
          </Fragment>
        ))}
        depois={
          <>
            {poucas && (
              <aside
                aria-label="Poucas vagas por aqui"
                className="col-span-full flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-4 sm:p-5"
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-surface-300 text-ink-muted">
                    <BellPlus aria-hidden className="size-5" />
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <p className="text-label">Poucas vagas por aqui, por enquanto</p>
                    <p className="text-body-sm text-ink-muted">
                      Receba um aviso quando entrar uma vaga nova que combina com esta busca.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pl-13">
                  {filtros.tipo === "vaga" ? (
                    <AvisarBusca
                      caminho={hrefFiltros(filtros)}
                      salvaId={buscaSalva?.id ?? null}
                      logado={Boolean(usuario)}
                    />
                  ) : (
                    <Link
                      href={hrefFiltros(filtros, { tipo: "vaga", tudo: false })}
                      scroll={false}
                      className="inline-flex min-h-9 items-center gap-1 text-body-sm font-semibold text-terra-text underline-offset-2 hover:underline"
                    >
                      <BellPlus aria-hidden className="size-4 shrink-0" />
                      Ver só as vagas e receber aviso
                    </Link>
                  )}
                  {!filtros.tempo && filtros.raio < maiorRaio && (
                    <Link
                      href={hrefFiltros(filtros, { raio: maiorRaio })}
                      scroll={false}
                      className="inline-flex min-h-9 items-center text-body-sm text-ink underline underline-offset-2 hover:text-terra-text"
                    >
                      Buscar até {maiorRaio} km
                    </Link>
                  )}
                </div>
              </aside>
            )}
            {convidarQuemContrata && <ConviteQuemContrata />}
          </>
        }
      />
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
        icone={filtros.q || filtros.categoria || filtros.turno ? SearchX : MapPinned}
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
        {filtros.turno
          ? "Nenhuma vaga neste horário por aqui. Tente outro horário ou uma distância maior."
          : filtros.q || filtros.categoria
            ? "Tente outra palavra, outra categoria ou uma distância maior."
            : filtros.tipo === "servico"
              ? "Ainda não há profissionais nesta área. Você faz algum serviço? Mostre aqui."
              : "Ainda não há anúncios nesta área. Que tal ser o primeiro a publicar?"}
      </Vazio>
    );
  // sem anúncios, as perguntas vêm depois do aviso (dizer onde mora pode trazer o que é perto)
  const listaComPerguntas =
    n === 0 && perguntas ? (
      <div className="flex flex-col gap-4">
        {lista}
        <div className="empty:hidden">{perguntas}</div>
      </div>
    ) : perguntas ? (
      <div className="flex flex-col gap-4">
        <div className="empty:hidden">{perguntas}</div>
        {lista}
      </div>
    ) : (
      lista
    );

  return (
    <Container className="pt-4 sm:pt-6">
      {primeiro(parametros.conta) === "excluida" && (
        <Aviso tipo="sucesso" className="mb-6" titulo="Sua conta foi excluída.">
          Apagamos seu perfil, seus anúncios e suas curtidas. Obrigado por ter usado o Publike.
        </Aviso>
      )}
      <VisaoExplorar
        titulo={
          // no computador, um pouco menor: cabe na linha dos filtros
          <h2 className="text-h3 sm:text-h2 lg:text-h3 2xl:text-h2" aria-live="polite">
            {contagem}
          </h2>
        }
        subtitulo={
          <div className="flex flex-wrap items-center gap-x-3">
            <p className="text-body-sm text-ink-muted">
              {combina && <>Do que mais combina com seu currículo · </>}
              {!combina && !filtros.meus && local && !local.ponto && (
                <>Primeiro: {passosDaPrioridade(local).join(" › ")} · </>
              )}
              {!combina && !filtros.meus && local?.ponto && filtros.origem === "centro" && (
                <>Do mais perto ao mais longe · </>
              )}
              {filtros.meus ? (
                <>Só os seus anúncios no ar, do mais perto ao mais longe {textoDaOrigem(filtros, local)}</>
              ) : (
                <>
                  {filtros.tempo ? nomeDoTempo(filtros.tempo).toLowerCase() : `em até ${filtros.raio} km`}{" "}
                  {textoDaOrigem(filtros, local)}
                </>
              )}
            </p>
            {/* com poucas vagas, o aviso fica no fim da lista (no bloco "Poucas vagas por aqui") */}
            {avisar && !poucas && (
              <AvisarBusca caminho={hrefFiltros(filtros)} salvaId={buscaSalva?.id ?? null} logado={Boolean(usuario)} />
            )}
            {/* o % de match chama para a conta e o currículo (quem procura trabalho já tem o atalho na lista) */}
            {avisar && n > 0 && !quem && procuraTrabalho && (!usuario || intencao === null) && (
              <Link
                href={
                  usuario
                    ? `/perfil/curriculo?next=${encodeURIComponent(hrefFiltros(filtros))}`
                    : `/entrar?next=${encodeURIComponent(hrefFiltros(filtros))}`
                }
                className="inline-flex min-h-9 items-center gap-1 text-body-sm font-semibold text-cerrado-text underline-offset-2 hover:underline"
              >
                <Percent aria-hidden className="size-4 shrink-0" />
                {usuario ? "Preencha o currículo e veja seu % de match" : "Entre e veja seu % de match em cada vaga"}
              </Link>
            )}
          </div>
        }
        filtrosLista={<FiltrosLista filtros={filtros} soMeus={publica} combina={Boolean(quem)} />}
        lista={listaComPerguntas}
        pontos={pontos}
        origem={origem}
        filtros={filtros}
      />
    </Container>
  );
}

export function ExplorarEsqueleto() {
  return (
    <Container className="pt-4 sm:pt-6" aria-busy="true">
      {/* mesma grade do cabeçalho de VisaoExplorar */}
      <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-x-6">
        <Esqueleto className="h-6 w-40 sm:h-8 sm:w-48" />
        <Esqueleto className="h-10 w-28 rounded-pill lg:hidden" />
        <div className="col-span-2 row-start-2 mt-1 flex items-center justify-between gap-3">
          <Esqueleto className="h-4 w-56" />
          {/* no celular, os filtros ficam atrás do botão "Filtros" */}
          <Esqueleto className="h-9 w-24 rounded-md lg:hidden" />
        </div>
        <div className="hidden justify-end gap-2 overflow-hidden lg:col-start-2 lg:row-start-1 lg:flex">
          {["w-44", "w-28", "w-32", "w-72"].map((largura) => (
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

/** Para quem tem vaga: publicar é grátis e dá para começar sem conta, por um modelo pronto. */
function ConviteQuemContrata() {
  return (
    <aside
      aria-label="Para quem tem vaga"
      className="col-span-full flex flex-col gap-3 rounded-lg border border-line bg-surface-300 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-terra-soft text-terra-text">
          <Store aria-hidden className="size-5" />
        </span>
        <div className="flex flex-col gap-0.5">
          <p className="text-label">Tem vaga para preencher?</p>
          <p className="text-body-sm text-ink-muted">
            Publique grátis em poucos minutos: dá para começar sem conta, a partir de um modelo pronto. A vaga aparece
            aqui para quem mora perto.
          </p>
        </div>
      </div>
      <BotaoLink href="/publicar" variante="secundario" className="shrink-0 self-start sm:self-center">
        Publicar vaga grátis
      </BotaoLink>
    </aside>
  );
}
