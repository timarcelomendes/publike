import "server-only";

import { ocupacao } from "@/lib/cbo";
import { SITE_URL } from "@/lib/config";
import { nomeDoBairro } from "@/lib/formato";
import { caminhoDaFuncao, funcaoDaListaPeloCbo } from "@/lib/funcoes-das-paginas";
import { caminhoDaBusca, caminhoDasRecentes, caminhoDoBairro, cidadeDoSlug, slugDaCidade } from "@/lib/paginas-busca";
import { sufixoDoImpulso, textoDoAnuncio, type TextoDoAnuncio, type VagaDoImpulso } from "@/lib/impulso";
import type { Json } from "@/lib/supabase/tipos-banco";
import { urlDosEmails } from "./ambiente";
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

type Acesso = NonNullable<ReturnType<typeof acessoFila>>;

type Tarefa = {
  id: string;
  codigo: string;
  situacao: string;
  origem: "compra" | "credito" | "cortesia" | "admin";
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

/** A campanha inteira de uma vez (tudo ou nada): o orçamento, a campanha, o lugar, a língua, o grupo, as palavras e o anúncio. */
function operacoesDaCampanha(t: Tarefa, texto: TextoDoAnuncio) {
  const v = t.vaga!;
  const orcamento = recurso("campaignBudgets", -1);
  const campanha = recurso("campaigns", -2);
  const grupo = recurso("adGroups", -3);
  const porDia = Math.max(1, Math.round((t.verba / t.dias) * 100) / 100);
  const nome = `Impulso · ${v.titulo.slice(0, 60)} · ${t.codigo}`;
  const ops: unknown[] = [
    {
      campaignBudgetOperation: {
        create: {
          resourceName: orcamento,
          name: `Impulso ${t.codigo}`,
          amountMicros: String(Math.round(porDia * 1_000_000)),
          deliveryMethod: "STANDARD",
          explicitlyShared: false,
        },
      },
    },
    {
      campaignOperation: {
        create: {
          resourceName: campanha,
          name: nome,
          status: "ENABLED",
          advertisingChannelType: "SEARCH",
          campaignBudget: orcamento,
          // o máximo de cliques com a verba do dia
          targetSpend: {},
          networkSettings: {
            targetGoogleSearch: true,
            targetSearchNetwork: false,
            targetContentNetwork: false,
            targetPartnerSearchNetwork: false,
          },
          // só quem está no lugar (não quem só se interessa por ele)
          geoTargetTypeSetting: { positiveGeoTargetType: "PRESENCE", negativeGeoTargetType: "PRESENCE" },
          finalUrlSuffix: sufixoDoImpulso(t.codigo),
          containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
        },
      },
    },
    { campaignCriterionOperation: { create: { campaign: campanha, language: { languageConstant: PORTUGUES } } } },
  ];
  // o lugar: o raio em volta da vaga. Só pelo lugar e pela pesquisa, nunca por idade ou sexo (CLT, art. 373-A).
  if (v.lat != null && v.lng != null) {
    ops.push({
      campaignCriterionOperation: {
        create: {
          campaign: campanha,
          proximity: {
            geoPoint: {
              latitudeInMicroDegrees: Math.round(v.lat * 1_000_000),
              longitudeInMicroDegrees: Math.round(v.lng * 1_000_000),
            },
            radius: v.raio,
            radiusUnits: "KILOMETERS",
          },
        },
      },
    });
  }
  ops.push({
    adGroupOperation: {
      create: { resourceName: grupo, name: "Vaga", campaign: campanha, status: "ENABLED", type: "SEARCH_STANDARD" },
    },
  });
  for (const text of texto.palavras) {
    ops.push({
      adGroupCriterionOperation: { create: { adGroup: grupo, status: "ENABLED", keyword: { text, matchType: "PHRASE" } } },
    });
  }
  ops.push(operacoesDoAnuncio(grupo, paginaDaVaga(v.id), texto));
  return ops;
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
 * Põe os sitelinks na campanha, depois de ela nascer e à parte: se o Google recusar algum, o impulso segue sem eles
 * (o anúncio roda do mesmo jeito; só a "qualidade" fica mais baixa).
 */
async function porSitelinks(t: Tarefa, campanhaId: string, conta: string) {
  const links = sitelinksDaVaga(t.vaga!);
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
    console.error(`Publike: impulso ${t.codigo} sem sitelinks:`, e instanceof Error ? e.message : e);
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

function texto(t: Tarefa, simples: boolean) {
  const sinonimos = t.vaga?.cbo ? [ocupacao(t.vaga.cbo)?.nome, ...(ocupacao(t.vaga.cbo)?.sinonimos ?? [])] : [];
  return textoDoAnuncio(t.vaga!, { simples, sinonimos: sinonimos.filter((s): s is string => Boolean(s)).slice(0, 3) });
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

async function criar(a: Acesso, t: Tarefa) {
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
  if (ids.campanha) await porSitelinks(t, ids.campanha, conta);
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

async function medir(a: Acesso, t: Tarefa, conta: string, ateHoje = false) {
  if (!t.campanha_id || !t.medir_desde) return;
  const hoje = hojeEmBrasilia();
  const ontem = new Date(Date.parse(`${hoje}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const ate = ateHoje ? hoje : ontem;
  if (ate < t.medir_desde) {
    await a.cliente.rpc("servidor_impulso_numeros", { p_chave: a.chave, p_id: t.id, p_linhas: [] });
    return;
  }
  const linhas = await consultar<LinhaDosNumeros>(
    `SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros FROM campaign ` +
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
  // a conta da campanha (a de quando nasceu); o "criar" usa sempre a de hoje
  const conta = precisaDoGoogle && t.acao !== "criar" ? await contaDoImpulso(a, t) : contaDeAnuncios();
  switch (t.acao) {
    case "criar":
      await criar(a, t);
      break;
    case "olhar":
      await olhar(a, t, conta);
      break;
    case "pausar":
      if (t.campanha_id) await removerCampanha(t.campanha_id, conta);
      await a.cliente.rpc("servidor_impulso_pausado", { p_chave: a.chave, p_id: t.id });
      if (t.campanha_id) await a.cliente.rpc("servidor_impulso_removido", { p_chave: a.chave, p_id: t.id });
      break;
    case "remover":
      if (t.campanha_id) await removerCampanha(t.campanha_id, conta);
      await a.cliente.rpc("servidor_impulso_removido", { p_chave: a.chave, p_id: t.id });
      break;
    case "encerrar":
      if (t.campanha_id) {
        try {
          await mutar(
            [
              {
                campaignOperation: {
                  updateMask: "status",
                  update: { resourceName: recurso("campaigns", t.campanha_id, conta), status: "PAUSED" },
                },
              },
            ],
            conta,
          );
        } catch (e) {
          if (!(e instanceof ErroGoogleAds && e.naoExiste)) throw e;
        }
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
  const { data, error } = await a.cliente.rpc("servidor_impulsos_para_cuidar", { p_chave: a.chave });
  if (error) {
    // sem a migração ainda: nada a fazer
    if (error.code === "PGRST202") return { feitos: 0 };
    console.error("Publike: falha ao ler os impulsos:", error.message);
    return { feitos: 0, motivo: "Não foi possível ler os impulsos das vagas." };
  }
  const tarefas = (data ?? []) as unknown as Tarefa[];
  const inicio = Date.now();
  let feitos = 0;
  const alertas: string[] = [];
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
  return alertas.length
    ? { feitos, motivo: `O impulso no Google Ads não anda há mais de 6 horas: ${alertas.join("; ")}` }
    : { feitos };
}
