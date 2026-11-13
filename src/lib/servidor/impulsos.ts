import "server-only";

import { ocupacao } from "@/lib/cbo";
import { SITE_URL } from "@/lib/config";
import { nomeDoBairro } from "@/lib/formato";
import { caminhoDaFuncao, funcaoDaListaPeloCbo } from "@/lib/funcoes-das-paginas";
import { caminhoDaBusca, caminhoDasRecentes, caminhoDoBairro, cidadeDoSlug, slugDaCidade } from "@/lib/paginas-busca";
import { pracaDaCidade } from "@/lib/pracas";
import {
  buscasComARevisao,
  frasesSemDisputa,
  limparNomeDaCbo,
  sufixoDoImpulso,
  textoDoAnuncio,
  type RevisaoDasPalavras,
  type TextoDoAnuncio,
  type VagaDoImpulso,
} from "@/lib/impulso";
import type { Json } from "@/lib/supabase/tipos-banco";
import { urlDosEmails } from "./ambiente";
import { modeloDoImpulso, revisarComIA, type RevisaoGuardada } from "./impulso-ia";
import { estornarCobranca } from "./asaas";
import { acessoFila } from "./filas";
import {
  consultar,
  contaDeAnuncios,
  contasAcessiveis,
  ErroGoogleAds,
  googleAdsLigado,
  idDoRecurso,
  mutar,
  recurso,
  type RespostaDoMutate,
} from "./google-ads-api";

// O robô do impulso da vaga (claude/plano-impulsionar-vaga.md), chamado pelas filas a cada 5 minutos e logo depois do
// pagamento: cria a campanha de cada impulso pago no Google Ads, olha a aprovação, troca o texto recusado, busca os
// números de ontem, tira do Google quando a vaga fecha, encerra no fim e pede o estorno do cancelado. Nada à mão:
// só o erro que dura mais de 6 horas vira alerta (a fila responde com problema, e o GitHub avisa por e-mail).
// A campanha do cliente (migração 20270430120000, só pelo admin): uma campanha no Google para várias vagas de um
// cliente, com uma verba só; cada vaga é um grupo de anúncios dentro dela (o anúncio, as palavras e o código que conta
// as visitas). O robô cria a campanha, depois cada vaga cria o grupo dela; a vaga que fecha tira só o grupo dela, e a
// campanha acaba quando não sobra vaga.
// Desde 12/11/2026 (migração 20270504120000): o raio que muda no admin vale também para os impulsos no ar
// (`acertarLugar`), e a campanha geral do Publike sai das buscas das funções com impulso no ar (`semDisputaComAGeral`).

type Acesso = NonNullable<ReturnType<typeof acessoFila>>;

/** Um ponto em volta do qual o anúncio aparece (o raio em km). */
type Lugar = { lat: number; lng: number; raio: number };

type Tarefa = {
  id: string;
  codigo: string;
  situacao: string;
  origem: "compra" | "credito" | "cortesia" | "admin";
  /** o automático do Publike (migração 20270430120000; antes dela, não vem) */
  automatico?: boolean;
  acao: "criar" | "olhar" | "pausar" | "encerrar" | "remover" | "estornar" | "medir";
  dias: number;
  verba: number;
  campanha_id: string | null;
  /** a conta do Google Ads em que a campanha nasceu (migração 20270429120000); null nos impulsos de antes */
  conta_google: string | null;
  grupo_id: string | null;
  anuncio_google_id: string | null;
  texto_simples: boolean;
  sandbox: boolean;
  ate: string | null;
  medir_desde: string | null;
  vaga: (VagaDoImpulso & { lat: number | null; lng: number | null; cbo: string | null; raio: number }) | null;
  compra: { asaas_id: string | null; sandbox: boolean; valor: number } | null;
  /** a campanha do cliente em que a vaga é um grupo (migração 20270430120000); null no impulso de uma vaga só */
  campanha_cliente: { id: string; codigo: string; campanha_id: string | null; conta_google: string | null } | null;
  /** o lugar da vaga que a campanha do cliente ainda não tem: o grupo acrescenta */
  novo_lugar: Lugar | null;
  /**
   * na campanha do cliente, o ponto da vaga no ar e o raio que ele deve ter (o maior das vagas nele; migração
   * 20270504120000). Na campanha de uma vaga, o lugar sai da vaga (`lugarDaVaga`).
   */
  lugar?: Lugar | null;
};

/** O que fazer com a campanha de um cliente (servidor_campanhas_para_cuidar). */
type TarefaDaCampanha = {
  id: string;
  codigo: string;
  nome: string;
  situacao: string;
  dias: number;
  verba: number;
  conta_id: string;
  conta_tipo: string | null;
  campanha_id: string | null;
  orcamento_id: string | null;
  conta_google: string | null;
  aprovado_em: string | null;
  acao: "criar" | "orcamento" | "encerrar";
  /** a verba por dia que a campanha deve ter agora */
  verba_dia: number;
  lugares: Lugar[];
  cidade: string | null;
};

const PORTUGUES = "languageConstants/1014";

/** O endereço público da vaga (o anúncio leva para ela). */
function paginaDaVaga(id: string) {
  return `${urlDosEmails() || SITE_URL}/anuncio/${id}`;
}

/** O dia de hoje no relógio de Brasília ("2026-11-12"). */
function hojeEmBrasilia() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function operacoesDoAnuncio(grupo: string, url: string, t: TextoDoAnuncio) {
  return {
    adGroupAdOperation: {
      create: {
        adGroup: grupo,
        status: "ENABLED",
        ad: {
          finalUrls: [url],
          responsiveSearchAd: {
            headlines: t.titulos.map((text) => ({ text })),
            descriptions: t.descricoes.map((text) => ({ text })),
            path1: t.caminho1,
            path2: t.caminho2,
          },
        },
      },
    },
  };
}

/** O lugar em volta do qual o anúncio aparece. Só pelo lugar e pela pesquisa, nunca por idade ou sexo (CLT, art. 373-A). */
function operacaoDoLugar(campanha: string, l: Lugar) {
  return {
    campaignCriterionOperation: {
      create: {
        campaign: campanha,
        proximity: {
          geoPoint: {
            latitudeInMicroDegrees: Math.round(l.lat * 1_000_000),
            longitudeInMicroDegrees: Math.round(l.lng * 1_000_000),
          },
          radius: l.raio,
          radiusUnits: "KILOMETERS",
        },
      },
    },
  };
}

/**
 * O lugar da vaga: o ponto dela no mapa; sem ele, o centro da praça da cidade com um raio maior. Sem nenhum dos dois,
 * erro: a campanha sem lugar apareceria no Brasil inteiro.
 */
function lugarDaVaga(v: NonNullable<Tarefa["vaga"]>): Lugar {
  if (v.lat != null && v.lng != null) return { lat: v.lat, lng: v.lng, raio: v.raio };
  const praca = pracaDaCidade(v.cidade);
  if (praca) return { lat: praca.centro.lat, lng: praca.centro.lng, raio: Math.max(v.raio, 30) };
  throw new Error(`A vaga "${v.titulo}" não tem o lugar no mapa: sem ele, o anúncio apareceria no Brasil inteiro.`);
}

/**
 * O lance das campanhas: aparecer no alto da página em 80% das buscas, pagando até R$ 2 por clique. Com o "máximo de
 * cliques", a verba pequena (R$ 4 por dia) fazia o Google dar lances baixos, e a campanha geral do Publike (o mesmo
 * site, verba maior) ficava com os leilões: só um anúncio por site aparece em cada busca. Resultado: 0 impressões no
 * primeiro dia, enquanto a geral tinha mais de mil (12/11/2026). Gastada a verba do dia, a geral volta a aparecer.
 */
const TETO_DO_CLIQUE = 2;
const LANCE = {
  targetImpressionShare: {
    location: "TOP_OF_PAGE",
    locationFractionMicros: "800000",
    cpcBidCeilingMicros: String(TETO_DO_CLIQUE * 1_000_000),
  },
};

/** As campanhas de antes (no "máximo de cliques") passam para o lance de agora (`LANCE`). Na medição; uma vez só. */
async function acertarLance(campanhaId: string, conta: string) {
  const [linha] = await consultar<{ campaign?: { biddingStrategyType?: string } }>(
    `SELECT campaign.bidding_strategy_type FROM campaign WHERE campaign.id = ${Number(campanhaId)}`,
    conta,
  );
  if (linha?.campaign?.biddingStrategyType !== "TARGET_SPEND") return;
  await mutar(
    [
      {
        campaignOperation: {
          updateMask:
            "targetImpressionShare.location,targetImpressionShare.locationFractionMicros,targetImpressionShare.cpcBidCeilingMicros",
          update: { resourceName: recurso("campaigns", campanhaId, conta), ...LANCE },
        },
      },
    ],
    conta,
  );
}

type LinhaDoLugar = {
  campaignCriterion?: {
    resourceName?: string;
    status?: string;
    proximity?: {
      geoPoint?: { latitudeInMicroDegrees?: number | string; longitudeInMicroDegrees?: number | string };
      radius?: number | string;
      radiusUnits?: string;
    };
  };
};

/** Dois pontos no mesmo lugar: até 0,0001 grau (uns 11 m), a diferença do arredondamento da campanha do cliente. */
const MESMO_PONTO = 100;

/**
 * O lugar da campanha no Google igual ao de hoje (12/11/2026): o raio mudou no Admin › Impulsos depois que o impulso
 * nasceu (o geral ou o do tipo da vaga), ou a vaga mudou de lugar. Na medida do impulso no ar, como o lance. A
 * campanha de uma vaga tem um lugar só: troca o ponto e o raio. Na do cliente, cada ponto serve às vagas que estão
 * nele: troca só o raio do ponto desta vaga (o maior das vagas nele, `t.lugar`). Um critério do Google não muda: sai o
 * velho e entra o novo, no mesmo mutate (tudo ou nada).
 */
async function acertarLugar(t: Tarefa, conta: string) {
  if (!t.campanha_id || !t.vaga) return;
  const alvo = t.campanha_cliente ? (t.lugar ?? null) : lugarDaVaga(t.vaga);
  if (!alvo) return;
  const linhas = await consultar<LinhaDoLugar>(
    `SELECT campaign_criterion.resource_name, campaign_criterion.status, ` +
      `campaign_criterion.proximity.geo_point.latitude_in_micro_degrees, ` +
      `campaign_criterion.proximity.geo_point.longitude_in_micro_degrees, ` +
      `campaign_criterion.proximity.radius, campaign_criterion.proximity.radius_units ` +
      `FROM campaign_criterion WHERE campaign.id = ${Number(t.campanha_id)} AND campaign_criterion.type = 'PROXIMITY'`,
    conta,
  );
  const lat = Math.round(alvo.lat * 1_000_000);
  const lng = Math.round(alvo.lng * 1_000_000);
  const pontos = linhas
    .map((l) => l.campaignCriterion)
    .filter((c) => c?.resourceName && c.status !== "REMOVED" && c.proximity?.geoPoint)
    .map((c) => ({
      nome: c!.resourceName!,
      lat: Number(c!.proximity!.geoPoint!.latitudeInMicroDegrees ?? 0),
      lng: Number(c!.proximity!.geoPoint!.longitudeInMicroDegrees ?? 0),
      // o Google guarda na unidade em que o raio entrou (o robô sempre usa km)
      raio: Number(c!.proximity!.radius ?? 0) * (c!.proximity!.radiusUnits === "MILES" ? 1.609344 : 1),
    }));
  const perto = (p: { lat: number; lng: number }) => Math.abs(p.lat - lat) <= MESMO_PONTO && Math.abs(p.lng - lng) <= MESMO_PONTO;
  // na campanha de uma vaga, o lugar único pode estar em outro ponto (a vaga mudou de endereço)
  const velho = pontos.find(perto) ?? (!t.campanha_cliente && pontos.length === 1 ? pontos[0] : undefined);
  if (!velho || (perto(velho) && Math.abs(velho.raio - alvo.raio) < 0.05)) return;
  await mutar(
    [
      { campaignCriterionOperation: { remove: velho.nome } },
      operacaoDoLugar(recurso("campaigns", t.campanha_id, conta), alvo),
    ],
    conta,
  );
  console.info(
    perto(velho)
      ? `Publike: o impulso ${t.codigo} passou de ${Math.round(velho.raio)} para ${alvo.raio} km em volta da vaga.`
      : `Publike: o impulso ${t.codigo} foi para o lugar novo da vaga (${alvo.raio} km em volta).`,
  );
}

/**
 * A lista de palavras negativas que tira a campanha geral do Publike das buscas das funções com impulso no ar
 * (12/11/2026, migração 20270504120000). No Google, só um anúncio de cada site aparece em cada busca: a geral (o mesmo
 * site, mais histórico, em outra conta) ganhava as buscas da função da vaga impulsionada, e o impulso ficava com 0
 * vistas. A lista fica na conta da geral, ligada a ela no Google Ads (uma vez, à mão); o robô só cuida das palavras,
 * em qualquer conta que o acesso enxerga. Sem a lista, nada muda. As palavras são do robô: a que entra à mão sai.
 */
export const LISTA_SEM_DISPUTA = "Publike · funções com impulso no ar";

type DadosSemDisputa = {
  vagas: { titulo: string; cbo: string | null }[];
  assinatura: string;
  feita: string | null;
  feita_em: string | null;
};

/**
 * Acerta a lista: entram as buscas da função de cada vaga no ar (`frasesSemDisputa`, de frase) e sai o que não é mais
 * de nenhuma (o impulso acabou: a geral volta para a função). Quando as vagas no ar mudam ou a última vez passou de 1
 * hora (a lista criada depois, ou mexida à mão). O erro não segura o robô: fica no registro e volta a tentar em 1 hora.
 */
async function semDisputaComAGeral(a: Acesso) {
  const { data, error } = await a.cliente.rpc("servidor_impulsos_sem_disputa", { p_chave: a.chave });
  if (error) {
    // sem a migração ainda: nada a fazer
    if (error.code !== "PGRST202") console.error("Publike: falha ao ler as vagas com impulso no ar:", error.message);
    return;
  }
  const d = data as unknown as DadosSemDisputa | null;
  if (!d) return;
  if (d.feita === d.assinatura && d.feita_em && Date.parse(d.feita_em) > Date.now() - 3_600_000) return;
  try {
    const queremos = new Set(d.vagas.flatMap((v) => frasesSemDisputa(v.titulo, sinonimosDaCbo(v.cbo))));
    const gestora = (process.env.GOOGLE_ADS_CONTA_GESTORA || "").replace(/\D/g, "");
    const contas = (await contasAcessiveis()).filter((c) => c !== gestora);
    for (const conta of contas) {
      let listas: { sharedSet?: { resourceName?: string; id?: string | number } }[];
      try {
        listas = await consultar(
          `SELECT shared_set.resource_name, shared_set.id FROM shared_set WHERE shared_set.type = 'NEGATIVE_KEYWORDS' ` +
            `AND shared_set.status = 'ENABLED' AND shared_set.name = '${LISTA_SEM_DISPUTA}'`,
          conta,
        );
      } catch {
        // conta fechada, de administrador ou sem acesso: a próxima
        continue;
      }
      for (const l of listas) {
        if (!l.sharedSet?.resourceName || l.sharedSet.id == null) continue;
        const atuais = await consultar<{ sharedCriterion?: { resourceName?: string; keyword?: { text?: string } } }>(
          `SELECT shared_criterion.resource_name, shared_criterion.keyword.text FROM shared_criterion ` +
            `WHERE shared_set.id = ${Number(l.sharedSet.id)}`,
          conta,
        );
        const temos = new Map<string, string>();
        const sair: string[] = [];
        for (const c of atuais) {
          const nome = c.sharedCriterion?.resourceName;
          if (!nome) continue;
          const texto = (c.sharedCriterion?.keyword?.text ?? "").toLowerCase();
          if (queremos.has(texto) && !temos.has(texto)) temos.set(texto, nome);
          else sair.push(nome);
        }
        const entrar = [...queremos].filter((p) => !temos.has(p));
        if (!entrar.length && !sair.length) continue;
        await mutar(
          [
            ...sair.map((nome) => ({ sharedCriterionOperation: { remove: nome } })),
            ...entrar.map((text) => ({
              sharedCriterionOperation: {
                create: { sharedSet: l.sharedSet!.resourceName, keyword: { text, matchType: "PHRASE" } },
              },
            })),
          ],
          conta,
        );
        console.info(`Publike: a lista "${LISTA_SEM_DISPUTA}" (conta ${conta}): ${entrar.length} entraram, ${sair.length} saíram.`);
      }
    }
  } catch (e) {
    console.error(`Publike: a lista "${LISTA_SEM_DISPUTA}" não mudou:`, e instanceof Error ? e.message : e);
  }
  await a.cliente.rpc("servidor_impulsos_sem_disputa_feita", { p_chave: a.chave, p_assinatura: d.assinatura });
}

/**
 * Buscas que não são de quem procura emprego (palavras negativas da campanha, amplas). Com as buscas largas e os nomes
 * curtos da função ("carregador", "chapa"), também o que é de comprar, de estudar, de estacionar e de benefício.
 * As novas entram nas campanhas no ar na medida seguinte (`acertarPalavras`).
 */
const FORA_DA_BUSCA = [
  "curso",
  "cursos",
  "receita",
  "receitas",
  "concurso",
  "apostila",
  "o que faz",
  "edital",
  "faculdade",
  "universidade",
  "vestibular",
  "enem",
  "sisu",
  "estacionamento",
  "garagem",
  "celular",
  "iphone",
  "samsung",
  "bateria",
  "usb",
  "notebook",
  "comprar",
  "preço",
  "mercado livre",
  "shopee",
  "seguro desemprego",
  "fgts",
  "inss",
  "significado",
];

/** O orçamento, a campanha, a língua e os lugares (com os nomes provisórios -1 e -2, para o mesmo mutate). */
function operacoesDaBaseDaCampanha(o: { codigo: string; nome: string; porDia: number; lugares: Lugar[]; conta: string }) {
  if (!o.lugares.length) throw new Error("Nenhum lugar para a campanha: sem ele, o anúncio apareceria no Brasil inteiro.");
  const orcamento = recurso("campaignBudgets", -1, o.conta);
  const campanha = recurso("campaigns", -2, o.conta);
  const ops: unknown[] = [
    {
      campaignBudgetOperation: {
        create: {
          resourceName: orcamento,
          name: `Impulso ${o.codigo}`,
          amountMicros: String(Math.round(Math.max(1, o.porDia) * 1_000_000)),
          deliveryMethod: "STANDARD",
          explicitlyShared: false,
        },
      },
    },
    {
      campaignOperation: {
        create: {
          resourceName: campanha,
          name: o.nome,
          status: "ENABLED",
          advertisingChannelType: "SEARCH",
          campaignBudget: orcamento,
          // no alto da página, até R$ 2 por clique (LANCE: com o máximo de cliques, não aparecia)
          ...LANCE,
          networkSettings: {
            targetGoogleSearch: true,
            targetSearchNetwork: false,
            targetContentNetwork: false,
            targetPartnerSearchNetwork: false,
          },
          // só quem está no lugar (não quem só se interessa por ele)
          geoTargetTypeSetting: { positiveGeoTargetType: "PRESENCE", negativeGeoTargetType: "PRESENCE" },
          finalUrlSuffix: sufixoDoImpulso(o.codigo),
          containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
        },
      },
    },
    { campaignCriterionOperation: { create: { campaign: campanha, language: { languageConstant: PORTUGUES } } } },
    ...o.lugares.map((l) => operacaoDoLugar(campanha, l)),
    // com a palavra ampla, fora quem procura curso, receita ou concurso (não é vaga)
    ...FORA_DA_BUSCA.map((text) => ({
      campaignCriterionOperation: { create: { campaign: campanha, negative: true, keyword: { text, matchType: "BROAD" } } },
    })),
  ];
  return { ops, campanha };
}

/**
 * O grupo da vaga: o grupo, as palavras e o anúncio. Na campanha do cliente, o grupo leva o código da vaga no fim do
 * endereço (cada vaga conta as visitas dela) e um nome único na campanha.
 */
function operacoesDoGrupo(o: {
  grupo: string;
  campanha: string;
  nome: string;
  url: string;
  texto: TextoDoAnuncio;
  sufixo?: string;
}) {
  const ops: unknown[] = [
    {
      adGroupOperation: {
        create: {
          resourceName: o.grupo,
          name: o.nome,
          campaign: o.campanha,
          status: "ENABLED",
          type: "SEARCH_STANDARD",
          ...(o.sufixo ? { finalUrlSuffix: o.sufixo } : {}),
        },
      },
    },
  ];
  for (const text of o.texto.palavras) {
    ops.push({
      // ampla: com a frase exata, 2 de cada 3 palavras ficavam "baixo volume de pesquisas" e as campanhas não apareciam
      // (12/11/2026: 0 impressões em 4 horas). A campanha geral da Publike, que funciona, usa a ampla.
      adGroupCriterionOperation: { create: { adGroup: o.grupo, status: "ENABLED", keyword: { text, matchType: "BROAD" } } },
    });
  }
  ops.push(operacoesDoAnuncio(o.grupo, o.url, o.texto));
  return ops;
}

const NOME_DA_ORIGEM: Record<Tarefa["origem"], string> = {
  compra: "Impulso pago",
  cortesia: "Impulso grátis",
  credito: "Impulso com crédito",
  admin: "Impulso pelo admin",
};

/**
 * O começo do nome da campanha no Google: de onde o impulso veio ("Impulso automático", "Impulso pago"…), para separar
 * no Google Ads o que o robô escolheu do que alguém pediu. Sem saber se é automático (a função do banco de antes), só
 * "Impulso".
 */
function nomeDaOrigem(t: Tarefa) {
  if (t.automatico === undefined) return "Impulso";
  return t.automatico ? "Impulso automático" : NOME_DA_ORIGEM[t.origem];
}

/** A campanha inteira de uma vez (tudo ou nada): o orçamento, a campanha, o lugar, a língua, o grupo, as palavras e o anúncio. */
function operacoesDaCampanha(t: Tarefa, texto: TextoDoAnuncio) {
  const v = t.vaga!;
  const conta = contaDeAnuncios();
  const base = operacoesDaBaseDaCampanha({
    codigo: t.codigo,
    nome: `${nomeDaOrigem(t)} · ${v.titulo.slice(0, 60)} · ${t.codigo}`,
    porDia: Math.round((t.verba / t.dias) * 100) / 100,
    lugares: [lugarDaVaga(v)],
    conta,
  });
  return [
    ...base.ops,
    ...operacoesDoGrupo({
      grupo: recurso("adGroups", -3, conta),
      campanha: base.campanha,
      nome: "Vaga",
      url: paginaDaVaga(v.id),
      texto,
    }),
  ];
}

type Sitelink = { texto: string; linha1: string; linha2: string; url: string };

/**
 * Os sitelinks do anúncio: os links extras embaixo dele (a "qualidade do anúncio" do Google pede ao menos 4). Levam às
 * páginas que duram (a função na cidade, o bairro, a cidade, as vagas novas) e ao currículo grátis. Até 25 letras no
 * link e 35 em cada linha.
 */
function sitelinksDaVaga(v: NonNullable<Tarefa["vaga"]>): Sitelink[] {
  const base = urlDosEmails() || SITE_URL;
  const cidade = v.cidade.trim();
  const temPaginas = Boolean(cidadeDoSlug(slugDaCidade(cidade)));
  const funcao = funcaoDaListaPeloCbo(v.cbo);
  const bairro = nomeDoBairro(v.bairro.trim());
  const lista: (Sitelink | null)[] = [
    temPaginas && funcao
      ? {
          texto: `Vagas de ${funcao.nome}`,
          linha1: `Mais vagas de ${funcao.nome}`,
          linha2: `Abertas agora em ${cidade}`,
          url: `${base}${caminhoDaFuncao(cidade, funcao.slug)}`,
        }
      : null,
    temPaginas && bairro && slugDaCidade(bairro) !== slugDaCidade(cidade)
      ? {
          texto: `Vagas no ${bairro}`,
          linha1: `As vagas no ${bairro}`,
          linha2: "E nos bairros perto dele",
          url: `${base}${caminhoDoBairro(cidade, bairro)}`,
        }
      : null,
    temPaginas
      ? {
          texto: `Vagas em ${cidade}`,
          linha1: `Todas as vagas em ${cidade}`,
          linha2: "Candidate-se sem pagar nada",
          url: `${base}${caminhoDaBusca("vaga", cidade)}`,
        }
      : null,
    temPaginas
      ? {
          texto: "Vagas dos últimos 3 dias",
          linha1: "As vagas mais novas",
          linha2: `Publicadas em ${cidade}`,
          url: `${base}${caminhoDasRecentes(cidade)}`,
        }
      : null,
    {
      texto: "Currículo grátis",
      linha1: "Monte seu currículo pelo celular",
      linha2: "Pronto em poucos minutos",
      url: `${base}/curriculo-simples`,
    },
    {
      texto: "Como funciona",
      linha1: "Curta a vaga e dê match",
      linha2: "Fale direto com quem contrata",
      url: `${base}/como-funciona`,
    },
  ];
  return sitelinksQueCabem(lista);
}

/** Só os que cabem (25 letras no link, 35 em cada linha), sem repetir o endereço, até 6. */
function sitelinksQueCabem(lista: (Sitelink | null)[]) {
  const vistos = new Set<string>();
  return lista
    .filter((x): x is Sitelink => {
      if (!x || x.texto.length > 25 || x.linha1.length > 35 || x.linha2.length > 35) return false;
      if (vistos.has(x.url)) return false;
      vistos.add(x.url);
      return true;
    })
    .slice(0, 6);
}

/**
 * Os sitelinks da campanha do cliente (valem para os anúncios de todas as vagas dela): as vagas da empresa, a cidade,
 * as vagas novas, o currículo grátis e o como funciona.
 */
function sitelinksDaCampanha(k: TarefaDaCampanha): Sitelink[] {
  const base = urlDosEmails() || SITE_URL;
  const cidade = (k.cidade ?? "").trim();
  const temPaginas = Boolean(cidade && cidadeDoSlug(slugDaCidade(cidade)));
  const nome = k.nome.trim();
  const daEmpresa = `Vagas da ${nome}`;
  return sitelinksQueCabem([
    k.conta_tipo !== "pessoa"
      ? {
          texto: daEmpresa.length <= 25 ? daEmpresa : "Mais vagas desta empresa",
          linha1: "Todas as vagas abertas dela",
          linha2: "Fale direto com quem contrata",
          url: `${base}/perfil/${k.conta_id}/vagas`,
        }
      : null,
    temPaginas
      ? {
          texto: `Vagas em ${cidade}`,
          linha1: `Todas as vagas em ${cidade}`,
          linha2: "Candidate-se sem pagar nada",
          url: `${base}${caminhoDaBusca("vaga", cidade)}`,
        }
      : null,
    temPaginas
      ? {
          texto: "Vagas dos últimos 3 dias",
          linha1: "As vagas mais novas",
          linha2: `Publicadas em ${cidade}`,
          url: `${base}${caminhoDasRecentes(cidade)}`,
        }
      : null,
    {
      texto: "Currículo grátis",
      linha1: "Monte seu currículo pelo celular",
      linha2: "Pronto em poucos minutos",
      url: `${base}/curriculo-simples`,
    },
    {
      texto: "Como funciona",
      linha1: "Curta a vaga e dê match",
      linha2: "Fale direto com quem contrata",
      url: `${base}/como-funciona`,
    },
  ]);
}

/**
 * Põe os sitelinks na campanha, depois de ela nascer e à parte: se o Google recusar algum, o impulso segue sem eles
 * (o anúncio roda do mesmo jeito; só a "qualidade" fica mais baixa).
 */
async function porSitelinks(links: Sitelink[], codigo: string, campanhaId: string, conta: string) {
  if (!links.length) return;
  const campanha = recurso("campaigns", campanhaId, conta);
  const ops: unknown[] = [];
  links.forEach((l, i) => {
    const asset = recurso("assets", -(i + 1), conta);
    ops.push({
      assetOperation: {
        create: {
          resourceName: asset,
          finalUrls: [l.url],
          sitelinkAsset: { linkText: l.texto, description1: l.linha1, description2: l.linha2 },
        },
      },
    });
    ops.push({ campaignAssetOperation: { create: { campaign: campanha, asset, fieldType: "SITELINK" } } });
  });
  try {
    await mutar(ops, conta);
  } catch (e) {
    console.error(`Publike: impulso ${codigo} sem sitelinks:`, e instanceof Error ? e.message : e);
  }
}

function idsDoMutate(r: RespostaDoMutate) {
  const ids: Record<string, string | null> = { orcamento: null, campanha: null, grupo: null, anuncio: null };
  for (const x of r.mutateOperationResponses ?? []) {
    if (x.campaignBudgetResult) ids.orcamento = idDoRecurso(x.campaignBudgetResult.resourceName);
    if (x.campaignResult) ids.campanha = idDoRecurso(x.campaignResult.resourceName);
    if (x.adGroupResult) ids.grupo = idDoRecurso(x.adGroupResult.resourceName);
    if (x.adGroupAdResult) ids.anuncio = idDoRecurso(x.adGroupAdResult.resourceName);
  }
  return ids;
}

/** Os outros nomes da função da vaga, pela CBO (o nome oficial e os sinônimos), até 3: para a lista sem disputa. */
function sinonimosDaCbo(cbo: string | null | undefined) {
  const o = cbo ? ocupacao(cbo) : null;
  return (o ? [o.nome, ...(o.sinonimos ?? [])] : []).filter((s): s is string => Boolean(s)).slice(0, 3);
}

/**
 * Todos os nomes da função na CBO como se buscam, para as palavras-chave: o oficial e todos os sinônimos, sem o
 * parêntese ("Carregador (veículos de transportes terrestres)" → "carregador"; "Chapa (movimentador de mercadoria)" →
 * "chapa" e "movimentador de mercadoria").
 */
function nomesDaCbo(cbo: string | null | undefined) {
  const o = cbo ? ocupacao(cbo) : null;
  return o ? [...new Set([o.nome, ...(o.sinonimos ?? [])].filter(Boolean).flatMap(limparNomeDaCbo))] : [];
}

function texto(t: Tarefa, simples: boolean) {
  return textoDoAnuncio(t.vaga!, { simples, sinonimos: nomesDaCbo(t.vaga?.cbo) });
}

/**
 * Se é hora de conferir as palavras do grupo: nunca conferidas, ou a última vez foi há mais de 22 horas (migração
 * 20270507120000: uma vez por dia, não a cada medida de 2 horas, porque cada consulta conta no limite diário da
 * Google Ads API). Sem a migração (ou sem resposta do banco), a cada medida, como antes.
 */
async function horaDasPalavras(a: Acesso, t: Tarefa) {
  const { data, error } = await a.cliente.rpc("servidor_impulso_palavras_em", { p_chave: a.chave, p_id: t.id });
  if (error) return true;
  return !data || Date.parse(data) < Date.now() - 22 * 3_600_000;
}

/** As palavras do grupo acabaram de ser conferidas: a próxima conferência fica para daqui a um dia. */
async function palavrasFeitas(a: Acesso, t: Tarefa) {
  const { error } = await a.cliente.rpc("servidor_impulso_palavras_feitas", { p_chave: a.chave, p_id: t.id });
  // sem a migração 20270507120000: confere de novo na medida seguinte, como antes
  if (error && error.code !== "PGRST202") console.error(`Publike: impulso ${t.codigo}, a data das palavras não ficou:`, error.message);
}

/** A volta do robô: quando começou e quantas revisões da IA já fez (uma por volta, no começo: a IA leva segundos). */
const volta = { inicio: 0, revisoes: 0 };

/** A descrição da vaga (pública), para a IA entender o trabalho. */
async function descricaoDaVaga(a: Acesso, id: string) {
  const { data } = await a.cliente.from("anuncios").select("descricao").eq("id", id).maybeSingle();
  return typeof data?.descricao === "string" ? data.descricao : "";
}

const soTextos = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);

/**
 * A revisão da IA das buscas da vaga, uma vez por impulso (migração 20270508120000; `impulso-ia.ts`):
 * - guardada: vale a guardada (a que deu erro vale por 1 dia; depois, a IA tenta de novo);
 * - sem guardada, com a IA ligada: a IA revisa agora (uma por volta, nos primeiros 12 segundos) e fica guardada;
 * - sem a migração ou sem a IA: as buscas de sempre.
 * `pronta: false`: a revisão ainda vai sair, e a próxima medida tenta de novo (sem marcar a data das palavras).
 */
async function revisaoDasPalavras(a: Acesso, t: Tarefa): Promise<{ revisao: RevisaoDasPalavras | null; pronta: boolean }> {
  if (!t.vaga) return { revisao: null, pronta: true };
  const { data, error } = await a.cliente.rpc("servidor_impulso_palavras_ia", { p_chave: a.chave, p_id: t.id });
  if (error) return { revisao: null, pronta: true };
  const g = (data ?? null) as Partial<RevisaoGuardada> | null;
  const guardada: RevisaoDasPalavras | null =
    g && !g.erro ? { acrescentar: soTextos(g.acrescentar), tirar: soTextos(g.tirar), negativas: soTextos(g.negativas) } : null;
  const tentarDeNovo = !g || (g.erro && Date.parse(g.em ?? "") < Date.now() - 86_400_000);
  if (!tentarDeNovo) return { revisao: guardada, pronta: true };
  const modelo = await modeloDoImpulso(a);
  if (!modelo) return { revisao: guardada, pronta: true };
  if (volta.revisoes >= 1 || Date.now() - volta.inicio > 12_000) return { revisao: guardada, pronta: false };
  volta.revisoes++;
  const base = texto(t, t.texto_simples).todas;
  const nova = await revisarComIA(modelo, t.vaga, await descricaoDaVaga(a, t.vaga.id), base, base.slice(0, 3));
  const { error: e } = await a.cliente.rpc("servidor_impulso_salvar_palavras_ia", {
    p_chave: a.chave,
    p_id: t.id,
    p_ia: nova as unknown as Json,
  });
  if (e) console.error(`Publike: impulso ${t.codigo}, a revisão da IA não ficou guardada:`, e.message);
  if (nova.erro) {
    console.error(`Publike: impulso ${t.codigo}, a IA não revisou as palavras:`, nova.erro);
    return { revisao: null, pronta: true };
  }
  return { revisao: nova, pronta: true };
}

type LinhaDaPalavra = {
  adGroupCriterion?: {
    resourceName?: string;
    negative?: boolean;
    keyword?: { text?: string; matchType?: string };
  };
};
type LinhaDaNegativa = { campaignCriterion?: { keyword?: { text?: string } } };

/**
 * As palavras do grupo da vaga iguais às buscas de hoje (`textoDoAnuncio(…).todas`, claude/plano-impulsionar-vaga.md,
 * 13/11/2026): entram as que faltam, sai o que não está mais na lista (o grupo é só do robô; a palavra de antes, de
 * frase, volta como ampla), e a campanha ganha as negativas que faltam (`FORA_DA_BUSCA`). Cada mudança vale sozinha:
 * a palavra que o Google barrar fica de fora sem barrar as outras. Logo depois de criar (a criação leva só as
 * primeiras) e a cada medida do impulso no ar: o impulso de antes (com os nomes da CBO, quase todos "baixo volume de
 * pesquisas", e sem as buscas largas) passa a ter as de hoje.
 */
async function acertarPalavras(
  t: Tarefa,
  conta: string,
  ids: { grupo?: string | null; campanha?: string | null } = {},
  revisao: RevisaoDasPalavras | null = null,
) {
  const grupoId = ids.grupo ?? t.grupo_id;
  const campanhaId = ids.campanha ?? t.campanha_id;
  if (!t.vaga || !grupoId || !campanhaId) return;
  // as buscas de hoje com a revisão da IA por cima; as negativas da IA ficam no grupo (na campanha do cliente, não
  // tiram as buscas das outras vagas)
  const queremos = new Set(buscasComARevisao(texto(t, t.texto_simples).todas, revisao));
  const negativasDoGrupo = new Set(revisao?.negativas ?? []);
  const [atuais, negativas] = await Promise.all([
    consultar<LinhaDaPalavra>(
      `SELECT ad_group_criterion.resource_name, ad_group_criterion.negative, ad_group_criterion.keyword.text, ` +
        `ad_group_criterion.keyword.match_type FROM ad_group_criterion WHERE ad_group.id = ${Number(grupoId)} ` +
        `AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED'`,
      conta,
    ),
    consultar<LinhaDaNegativa>(
      `SELECT campaign_criterion.keyword.text FROM campaign_criterion WHERE campaign.id = ${Number(campanhaId)} ` +
        `AND campaign_criterion.type = 'KEYWORD' AND campaign_criterion.negative = TRUE ` +
        `AND campaign_criterion.status != 'REMOVED'`,
      conta,
    ),
  ]);
  const temos = new Set<string>();
  const temosNegativas = new Set<string>();
  const sair: string[] = [];
  for (const l of atuais) {
    const c = l.adGroupCriterion;
    if (!c?.resourceName) continue;
    const texto = (c.keyword?.text ?? "").toLowerCase();
    const certa = c.keyword?.matchType === "BROAD";
    if (c.negative) {
      if (negativasDoGrupo.has(texto) && certa && !temosNegativas.has(texto)) temosNegativas.add(texto);
      else sair.push(c.resourceName);
    } else if (queremos.has(texto) && certa && !temos.has(texto)) temos.add(texto);
    else sair.push(c.resourceName);
  }
  const entrar = [...queremos].filter((p) => !temos.has(p));
  const negativasDoGrupoNovas = [...negativasDoGrupo].filter((p) => !temosNegativas.has(p));
  const temNegativa = new Set(negativas.map((n) => (n.campaignCriterion?.keyword?.text ?? "").toLowerCase()));
  const negativasNovas = FORA_DA_BUSCA.filter((n) => !temNegativa.has(n));
  if (!entrar.length && !sair.length && !negativasNovas.length && !negativasDoGrupoNovas.length) return;
  const grupo = recurso("adGroups", grupoId, conta);
  const campanha = recurso("campaigns", campanhaId, conta);
  const r = await mutar(
    [
      ...sair.map((nome) => ({ adGroupCriterionOperation: { remove: nome } })),
      ...entrar.map((text) => ({
        adGroupCriterionOperation: { create: { adGroup: grupo, status: "ENABLED", keyword: { text, matchType: "BROAD" } } },
      })),
      ...negativasDoGrupoNovas.map((text) => ({
        adGroupCriterionOperation: { create: { adGroup: grupo, negative: true, keyword: { text, matchType: "BROAD" } } },
      })),
      ...negativasNovas.map((text) => ({
        campaignCriterionOperation: { create: { campaign: campanha, negative: true, keyword: { text, matchType: "BROAD" } } },
      })),
    ],
    conta,
    { parcial: true },
  );
  if (r.partialFailureError?.message) {
    console.error(`Publike: impulso ${t.codigo}, palavras que o Google não aceitou:`, r.partialFailureError.message.slice(0, 400));
  }
}

/**
 * A conta do Google Ads da campanha do impulso. A gravada na criação; no impulso de antes (sem ela), o robô procura a
 * campanha nas contas que o acesso enxerga, a de hoje primeiro, e grava a que achou. Não achou: a de hoje.
 */
async function contaDoImpulso(a: Acesso, t: Tarefa): Promise<string> {
  const atual = contaDeAnuncios();
  if (t.conta_google) return t.conta_google;
  if (!t.campanha_id) return atual;
  const gestora = (process.env.GOOGLE_ADS_CONTA_GESTORA || "").replace(/\D/g, "");
  const outras = (await contasAcessiveis().catch(() => [] as string[])).filter((c) => c !== atual && c !== gestora);
  for (const conta of [atual, ...outras]) {
    try {
      const linhas = await consultar(`SELECT campaign.id FROM campaign WHERE campaign.id = ${Number(t.campanha_id)}`, conta);
      if (!linhas.length) continue;
      await a.cliente.rpc("servidor_impulso_conta", { p_chave: a.chave, p_id: t.id, p_conta: conta });
      return conta;
    } catch {
      // conta fechada ou sem acesso: a próxima
    }
  }
  return atual;
}

async function removerCampanha(id: string, conta: string) {
  try {
    await mutar([{ campaignOperation: { remove: recurso("campaigns", id, conta) } }], conta);
  } catch (e) {
    // já removida: está feito
    if (!(e instanceof ErroGoogleAds && e.naoExiste)) throw e;
  }
}

/** Tira o grupo da vaga da campanha do cliente (a campanha segue com as outras vagas). */
async function removerGrupo(id: string, conta: string) {
  try {
    await mutar([{ adGroupOperation: { remove: recurso("adGroups", id, conta) } }], conta);
  } catch (e) {
    if (!(e instanceof ErroGoogleAds && e.naoExiste)) throw e;
  }
}

async function pausarNoGoogle(tipo: "campaigns" | "adGroups", id: string, conta: string) {
  const operacao = tipo === "campaigns" ? "campaignOperation" : "adGroupOperation";
  try {
    await mutar([{ [operacao]: { updateMask: "status", update: { resourceName: recurso(tipo, id, conta), status: "PAUSED" } } }], conta);
  } catch (e) {
    if (!(e instanceof ErroGoogleAds && e.naoExiste)) throw e;
  }
}

/**
 * A vaga da campanha do cliente: o grupo dela dentro da campanha que já existe (o lugar dela entra se for novo). A
 * política barrou o texto: a segunda chance com o texto simples, como na campanha de uma vaga.
 */
async function criarGrupo(a: Acesso, t: Tarefa) {
  const k = t.campanha_cliente!;
  if (!t.vaga || !k.campanha_id) return;
  const conta = k.conta_google || contaDeAnuncios();
  const campanha = recurso("campaigns", k.campanha_id, conta);
  const montar = (simples: boolean) => [
    ...(t.novo_lugar ? [operacaoDoLugar(campanha, t.novo_lugar)] : []),
    ...operacoesDoGrupo({
      grupo: recurso("adGroups", -1, conta),
      campanha,
      nome: `${t.vaga!.titulo.slice(0, 60)} · ${t.codigo}`,
      url: paginaDaVaga(t.vaga!.id),
      texto: texto(t, simples),
      sufixo: sufixoDoImpulso(t.codigo),
    }),
  ];
  let r: RespostaDoMutate;
  try {
    r = await mutar(montar(t.texto_simples), conta);
  } catch (e) {
    if (!(e instanceof ErroGoogleAds && e.politica)) throw e;
    const { data } = await a.cliente.rpc("servidor_impulso_recusado", { p_chave: a.chave, p_id: t.id, p_motivo: e.message });
    if (!(data as { texto_simples?: boolean } | null)?.texto_simples) return;
    try {
      r = await mutar(montar(true), conta);
    } catch (e2) {
      if (!(e2 instanceof ErroGoogleAds && e2.politica)) throw e2;
      await a.cliente.rpc("servidor_impulso_recusado", { p_chave: a.chave, p_id: t.id, p_motivo: e2.message });
      return;
    }
  }
  const criados = idsDoMutate(r);
  const ids: Record<string, unknown> = {
    campanha: k.campanha_id,
    grupo: criados.grupo,
    anuncio: criados.anuncio,
    conta,
    ...(t.novo_lugar ? { lugar: t.novo_lugar } : {}),
  };
  const { data, error } = await a.cliente.rpc("servidor_impulso_criado", {
    p_chave: a.chave,
    p_id: t.id,
    p_ids: ids as unknown as Json,
  });
  if (error) throw new Error(error.message);
  // a vaga fechou (ou o admin parou) enquanto o Google criava: tira o grupo de novo
  if ((data as { remover?: boolean } | null)?.remover && criados.grupo) {
    await removerGrupo(criados.grupo, conta);
    return;
  }
  await palavrasDepoisDeCriar(a, t, conta, { grupo: criados.grupo, campanha: k.campanha_id });
}

async function criar(a: Acesso, t: Tarefa) {
  if (t.campanha_cliente) return criarGrupo(a, t);
  if (!t.vaga) {
    // a vaga sumiu entre o pagamento e agora: o banco já marcou para pausar
    return;
  }
  let simples = t.texto_simples;
  let r: RespostaDoMutate;
  try {
    r = await mutar(operacoesDaCampanha(t, texto(t, simples)));
  } catch (e) {
    if (!(e instanceof ErroGoogleAds && e.politica)) throw e;
    // a política do Google barrou o texto: a segunda chance com o texto simples; a segunda recusa devolve
    const { data } = await a.cliente.rpc("servidor_impulso_recusado", { p_chave: a.chave, p_id: t.id, p_motivo: e.message });
    if (!(data as { texto_simples?: boolean } | null)?.texto_simples) return;
    simples = true;
    try {
      r = await mutar(operacoesDaCampanha(t, texto(t, simples)));
    } catch (e2) {
      if (!(e2 instanceof ErroGoogleAds && e2.politica)) throw e2;
      await a.cliente.rpc("servidor_impulso_recusado", { p_chave: a.chave, p_id: t.id, p_motivo: e2.message });
      return;
    }
  }
  // a conta em que a campanha nasceu fica gravada: se a variável mudar depois, o robô ainda acha a campanha
  const conta = contaDeAnuncios();
  const ids: Record<string, string | null> = { ...idsDoMutate(r), conta };
  const { data, error } = await a.cliente.rpc("servidor_impulso_criado", {
    p_chave: a.chave,
    p_id: t.id,
    p_ids: ids as unknown as Json,
  });
  if (error) throw new Error(error.message);
  // cancelado ou com a vaga fechada enquanto o Google criava: tira de novo
  if ((data as { remover?: boolean } | null)?.remover && ids.campanha) {
    await removerCampanha(ids.campanha, conta);
    return;
  }
  if (ids.campanha) await porSitelinks(sitelinksDaVaga(t.vaga!), t.codigo, ids.campanha, conta);
  await palavrasDepoisDeCriar(a, t, conta, { grupo: ids.grupo, campanha: ids.campanha });
}

/**
 * A criação leva só as primeiras palavras (`PALAVRAS_AO_NASCER`); as outras entram já, sem esperar a medida, e a
 * próxima conferência fica para daqui a um dia.
 */
async function palavrasDepoisDeCriar(
  a: Acesso,
  t: Tarefa,
  conta: string,
  ids: { grupo?: string | null; campanha?: string | null },
) {
  try {
    const r = await revisaoDasPalavras(a, t);
    await acertarPalavras(t, conta, ids, r.revisao);
    if (r.pronta) await palavrasFeitas(a, t);
  } catch (e) {
    console.error(`Publike: impulso ${t.codigo} nasceu só com as primeiras palavras:`, e instanceof Error ? e.message : e);
  }
}

type LinhaDoAnuncio = {
  adGroupAd?: {
    policySummary?: {
      approvalStatus?: string;
      reviewStatus?: string;
      policyTopicEntries?: { topic?: string }[];
    };
  };
};

async function olhar(a: Acesso, t: Tarefa, conta: string) {
  if (!t.anuncio_google_id || !t.campanha_id) return;
  const linhas = await consultar<LinhaDoAnuncio>(
    `SELECT ad_group_ad.ad.id, ad_group_ad.policy_summary.approval_status, ad_group_ad.policy_summary.review_status, ` +
      `ad_group_ad.policy_summary.policy_topic_entries FROM ad_group_ad ` +
      `WHERE campaign.id = ${Number(t.campanha_id)} AND ad_group_ad.ad.id = ${Number(t.anuncio_google_id)}`,
    conta,
  );
  const p = linhas[0]?.adGroupAd?.policySummary;
  const aprovacao = p?.approvalStatus ?? "UNKNOWN";
  const situacao =
    aprovacao === "APPROVED" || aprovacao === "APPROVED_LIMITED" || aprovacao === "AREA_OF_INTEREST_ONLY"
      ? "aprovado"
      : aprovacao === "DISAPPROVED"
        ? "reprovado"
        : "revisao";
  const motivo = (p?.policyTopicEntries ?? [])
    .map((x) => x.topic)
    .filter(Boolean)
    .join(", ");
  const { data, error } = await a.cliente.rpc("servidor_impulso_olhado", {
    p_chave: a.chave,
    p_id: t.id,
    p_aprovacao: situacao,
    p_motivo: motivo || null,
  });
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as { aprovado?: boolean; fim?: string; texto_simples?: boolean };
  if (d.aprovado && d.fim) {
    // o Google para sozinho no fim (e o robô encerra de qualquer jeito)
    await mutar(
      [
        {
          campaignOperation: {
            updateMask: "endDateTime",
            update: { resourceName: recurso("campaigns", t.campanha_id, conta), endDateTime: d.fim },
          },
        },
      ],
      conta,
    );
  } else if (d.texto_simples) {
    // o anúncio novo, com o texto simples, no lugar do recusado
    await trocarPeloSimples(a, t, conta);
  }
}

async function trocarPeloSimples(a: Acesso, t: Tarefa, conta: string) {
  if (!t.vaga || !t.grupo_id) return;
  const grupo = recurso("adGroups", t.grupo_id, conta);
  const r = await mutar(
    [
      operacoesDoAnuncio(grupo, paginaDaVaga(t.vaga.id), texto(t, true)),
      ...(t.anuncio_google_id
        ? [{ adGroupAdOperation: { remove: recurso("adGroupAds", `${t.grupo_id}~${t.anuncio_google_id}`, conta) } }]
        : []),
    ],
    conta,
  );
  const novo = idsDoMutate(r).anuncio;
  if (novo) await a.cliente.rpc("servidor_impulso_anuncio_trocado", { p_chave: a.chave, p_id: t.id, p_anuncio: novo });
}

type LinhaDosNumeros = {
  segments?: { date?: string };
  metrics?: { impressions?: string | number; clicks?: string | number; costMicros?: string | number };
};

/**
 * Os números do Google, por dia, do dia em que entrou no ar até hoje (o de hoje vai mudando a cada medida: a cada 2
 * horas, pela migração 20270501120000; antes, só o de ontem, e o Admin mostrava R$ 0 o dia inteiro). Com a vaga no
 * ar, acerta antes o lance das campanhas de antes (`acertarLance`) e o raio que mudou no admin (`acertarLugar`).
 */
async function medir(a: Acesso, t: Tarefa, conta: string, ateHoje = true) {
  if (!t.campanha_id || !t.medir_desde) return;
  if (t.acao === "medir" && t.situacao === "no_ar") {
    try {
      await acertarLance(t.campanha_id, conta);
    } catch (e) {
      // o lance fica para a próxima medida; os números não esperam por ele
      console.error(`Publike: o lance do impulso ${t.codigo} não mudou:`, e instanceof Error ? e.message : e);
    }
    try {
      await acertarLugar(t, conta);
    } catch (e) {
      // o raio também fica para a próxima medida
      console.error(`Publike: o raio do impulso ${t.codigo} não mudou:`, e instanceof Error ? e.message : e);
    }
    try {
      // uma vez por dia (`horaDasPalavras`); deu certo, a data fica marcada
      if (await horaDasPalavras(a, t)) {
        const r = await revisaoDasPalavras(a, t);
        await acertarPalavras(t, conta, {}, r.revisao);
        if (r.pronta) await palavrasFeitas(a, t);
      }
    } catch (e) {
      // as palavras também ficam para a próxima medida
      console.error(`Publike: as palavras do impulso ${t.codigo} não mudaram:`, e instanceof Error ? e.message : e);
    }
  }
  const hoje = hojeEmBrasilia();
  const ontem = new Date(Date.parse(`${hoje}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const ate = ateHoje ? hoje : ontem;
  if (ate < t.medir_desde) {
    await a.cliente.rpc("servidor_impulso_numeros", { p_chave: a.chave, p_id: t.id, p_linhas: [] });
    return;
  }
  // na campanha do cliente, os números de cada vaga são os do grupo dela
  const linhas = await consultar<LinhaDosNumeros>(
    t.campanha_cliente && t.grupo_id
      ? `SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros FROM ad_group ` +
          `WHERE ad_group.id = ${Number(t.grupo_id)} AND segments.date BETWEEN '${t.medir_desde}' AND '${ate}'`
      : `SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros FROM campaign ` +
          `WHERE campaign.id = ${Number(t.campanha_id)} AND segments.date BETWEEN '${t.medir_desde}' AND '${ate}'`,
    conta,
  );
  const dias = linhas
    .filter((l) => l.segments?.date)
    .map((l) => ({
      dia: l.segments!.date!,
      impressoes: Number(l.metrics?.impressions ?? 0),
      cliques: Number(l.metrics?.clicks ?? 0),
      custo: Number(l.metrics?.costMicros ?? 0) / 1_000_000,
    }));
  const { error } = await a.cliente.rpc("servidor_impulso_numeros", {
    p_chave: a.chave,
    p_id: t.id,
    p_linhas: dias as unknown as Json,
  });
  if (error) throw new Error(error.message);
}

async function fazer(a: Acesso, t: Tarefa) {
  const precisaDoGoogle = t.acao !== "estornar" && !(t.acao === "pausar" && !t.campanha_id);
  if (precisaDoGoogle && !googleAdsLigado()) return false;
  // a conta da campanha (a de quando nasceu); o "criar" usa a de hoje, e a vaga da campanha do cliente, a dela
  const conta =
    t.campanha_cliente && !t.conta_google
      ? t.campanha_cliente.conta_google || contaDeAnuncios()
      : precisaDoGoogle && t.acao !== "criar"
        ? await contaDoImpulso(a, t)
        : contaDeAnuncios();
  // na campanha do cliente, o que sai ou para é o grupo da vaga; a campanha segue com as outras
  const doCliente = Boolean(t.campanha_cliente);
  const tirar = async () => {
    if (doCliente) {
      if (t.grupo_id) await removerGrupo(t.grupo_id, conta);
    } else if (t.campanha_id) await removerCampanha(t.campanha_id, conta);
  };
  switch (t.acao) {
    case "criar":
      await criar(a, t);
      break;
    case "olhar":
      await olhar(a, t, conta);
      break;
    case "pausar":
      await tirar();
      await a.cliente.rpc("servidor_impulso_pausado", { p_chave: a.chave, p_id: t.id });
      if (t.campanha_id) await a.cliente.rpc("servidor_impulso_removido", { p_chave: a.chave, p_id: t.id });
      break;
    case "remover":
      await tirar();
      await a.cliente.rpc("servidor_impulso_removido", { p_chave: a.chave, p_id: t.id });
      break;
    case "encerrar":
      if (doCliente && t.grupo_id) {
        await pausarNoGoogle("adGroups", t.grupo_id, conta);
        if (t.situacao === "no_ar") await medir(a, t, conta, true);
      } else if (!doCliente && t.campanha_id) {
        await pausarNoGoogle("campaigns", t.campanha_id, conta);
        await medir(a, t, conta, true);
      }
      await a.cliente.rpc("servidor_impulso_encerrado", { p_chave: a.chave, p_id: t.id });
      break;
    case "estornar":
      if (t.compra?.asaas_id) {
        await estornarCobranca(t.compra.sandbox, t.compra.asaas_id, "Impulso no Google cancelado antes de rodar.");
      }
      await a.cliente.rpc("servidor_impulso_estorno_pedido", { p_chave: a.chave, p_id: t.id });
      break;
    case "medir":
      await medir(a, t, conta);
      break;
  }
  return true;
}

/** A campanha do cliente nasce no Google: o orçamento, a campanha, a língua, os lugares e os sitelinks. */
async function criarCampanhaDoCliente(a: Acesso, k: TarefaDaCampanha) {
  const conta = contaDeAnuncios();
  const base = operacoesDaBaseDaCampanha({
    codigo: k.codigo,
    nome: `Impulso do cliente · ${k.nome.slice(0, 60)} · ${k.codigo}`,
    porDia: k.verba_dia,
    lugares: k.lugares,
    conta,
  });
  const r = await mutar(base.ops, conta);
  const ids = idsDoMutate(r);
  const { error } = await a.cliente.rpc("servidor_campanha_criada", {
    p_chave: a.chave,
    p_id: k.id,
    p_ids: { campanha: ids.campanha, orcamento: ids.orcamento, conta, lugares: k.lugares } as unknown as Json,
  });
  if (error) throw new Error(error.message);
  if (ids.campanha) await porSitelinks(sitelinksDaCampanha(k), k.codigo, ids.campanha, conta);
}

async function fazerNaCampanha(a: Acesso, k: TarefaDaCampanha) {
  if (k.acao !== "encerrar" || k.campanha_id) {
    if (!googleAdsLigado()) return false;
  }
  const conta = k.conta_google || contaDeAnuncios();
  switch (k.acao) {
    case "criar":
      await criarCampanhaDoCliente(a, k);
      break;
    case "orcamento":
      // entrou verba (ou vaga): a verba por dia acerta para o que falta até o fim
      if (k.orcamento_id) {
        await mutar(
          [
            {
              campaignBudgetOperation: {
                updateMask: "amountMicros",
                update: {
                  resourceName: recurso("campaignBudgets", k.orcamento_id, conta),
                  amountMicros: String(Math.round(Math.max(1, k.verba_dia) * 1_000_000)),
                },
              },
            },
          ],
          conta,
        );
      }
      await a.cliente.rpc("servidor_campanha_orcamento", { p_chave: a.chave, p_id: k.id, p_verba: k.verba });
      break;
    case "encerrar":
      // nenhuma vaga correndo: a que entrou no ar fica parada no Google (com os números); a que nunca entrou sai
      if (k.campanha_id) {
        if (k.aprovado_em) await pausarNoGoogle("campaigns", k.campanha_id, conta);
        else await removerCampanha(k.campanha_id, conta);
      }
      await a.cliente.rpc("servidor_campanha_encerrada", { p_chave: a.chave, p_id: k.id });
      break;
  }
  return true;
}

/** As campanhas dos clientes desta volta (antes das vagas: a vaga só cria o grupo depois que a campanha existe). */
async function cuidarDasCampanhas(a: Acesso, alertas: string[]) {
  const { data, error } = await a.cliente.rpc("servidor_campanhas_para_cuidar", { p_chave: a.chave });
  if (error) {
    // sem a migração ainda: nada a fazer
    if (error.code !== "PGRST202") console.error("Publike: falha ao ler as campanhas dos clientes:", error.message);
    return 0;
  }
  let feitas = 0;
  for (const k of (data ?? []) as unknown as TarefaDaCampanha[]) {
    try {
      if (await fazerNaCampanha(a, k)) feitas++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Publike: a campanha do cliente ${k.codigo} (${k.acao}) falhou:`, msg);
      const { data: r } = await a.cliente.rpc("servidor_campanha_erro", { p_chave: a.chave, p_id: k.id, p_erro: msg });
      if ((r as { alertar?: boolean } | null)?.alertar) alertas.push(`campanha ${k.codigo} (${k.acao}): ${msg}`.slice(0, 200));
    }
  }
  return feitas;
}

/** Uma rodada do robô. Devolve quantos impulsos andaram e, quando um erro dura mais de 6 horas, o motivo. */
export async function cuidarDosImpulsos(): Promise<{ feitos: number; motivo?: string }> {
  const a = acessoFila();
  if (!a) return { feitos: 0 };
  // o impulso automático do Publike (migração 20270428120000): com o Google Ads ligado, o banco escolhe as vagas
  // paradas dentro do teto do mês e cria os impulsos; logo abaixo, eles entram na fila como os outros
  if (googleAdsLigado()) {
    const { error: e } = await a.cliente.rpc("servidor_impulsos_automaticos", { p_chave: a.chave });
    if (e && e.code !== "PGRST202") console.error("Publike: falha no impulso automático:", e.message);
  }
  const alertas: string[] = [];
  const inicio = Date.now();
  volta.inicio = inicio;
  volta.revisoes = 0;
  let feitos = googleAdsLigado() ? await cuidarDasCampanhas(a, alertas) : 0;
  const { data, error } = await a.cliente.rpc("servidor_impulsos_para_cuidar", { p_chave: a.chave });
  if (error) {
    // sem a migração ainda: nada a fazer
    if (error.code === "PGRST202") return { feitos };
    console.error("Publike: falha ao ler os impulsos:", error.message);
    return { feitos, motivo: "Não foi possível ler os impulsos das vagas." };
  }
  const tarefas = (data ?? []) as unknown as Tarefa[];
  for (const t of tarefas) {
    if (Date.now() - inicio > 25_000) break;
    try {
      if (await fazer(a, t)) feitos++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Publike: o impulso ${t.codigo} (${t.acao}) falhou:`, msg);
      const { data: r } = await a.cliente.rpc("servidor_impulso_erro", { p_chave: a.chave, p_id: t.id, p_erro: msg });
      if ((r as { alertar?: boolean } | null)?.alertar) alertas.push(`${t.codigo} (${t.acao}): ${msg}`.slice(0, 200));
    }
  }
  // depois das vagas (a que entrou no ar ou acabou nesta volta já conta): a campanha geral fora das funções delas
  if (googleAdsLigado() && Date.now() - inicio < 35_000) await semDisputaComAGeral(a);
  return alertas.length
    ? { feitos, motivo: `O impulso no Google Ads não anda há mais de 6 horas: ${alertas.join("; ")}` }
    : { feitos };
}
