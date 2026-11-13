import "server-only";

import {
  buscasParaJulgar,
  decidirLance,
  decidirRaio,
  decidirVerba,
  mesmaBusca,
  nadaAMudar,
  textoDasBuscas,
  type BuscaReal,
  type Mudanca,
  type Regras,
  type Situacao,
} from "@/lib/impulso-ajuste";
import type { VagaDoImpulso } from "@/lib/impulso";
import type { Json } from "@/lib/supabase/tipos-banco";
import { acessoFila } from "./filas";
import { consultar, contaDeAnuncios, googleAdsLigado, mutar, recurso } from "./google-ads-api";
import { julgarBuscasComIA, modeloDoImpulso } from "./impulso-ia";
import { buscasDoGrupo, descricaoDaVaga, hojeEmBrasilia, type AcessoDoRobo } from "./impulsos";

// O ajuste diário do impulso, em beta (13/11/2026, migração 20270509120000, claude/plano-impulsionar-vaga.md). Pedido
// do Marcelo: "um motor que olha o resultado e ajusta as velas automaticamente"; uma vez por dia, de manhã, com o dia
// anterior inteiro (a cada hora não vale: o Google traz os números com horas de atraso, e R$ 4 por dia quase não têm
// dado numa hora). "Entra como BETA, será cobrado depois": no beta, todo impulso no ar, sem custo.
// Para cada campanha no ar (a de uma vaga ou a do cliente): lê o Google (o estado, os números dos últimos dias e as
// buscas de verdade), decide pelas regras de lib/impulso-ajuste.ts (a verba do dia, o lance, o raio) e pela IA (as
// buscas que não são da vaga), muda no Google e guarda o diário, que o cliente e o admin veem. As filas chamam a cada
// 5 minutos; o banco só entrega o que falta ajustar hoje, depois das 6h.

type VagaDoAjuste = {
  impulso_id: string;
  codigo: string;
  grupo_id: string | null;
  texto_simples: boolean;
  excluidas: string[];
  vistas: string[];
  vaga: VagaDoImpulso & { lat: number | null; lng: number | null; cbo: string | null; raio: number };
};

type ItemDoAjuste = {
  tipo: "impulso" | "cliente";
  id: string;
  codigo: string;
  campanha_id: string;
  conta_google: string | null;
  verba: number;
  dias: number;
  gasto: number;
  aprovado_em: string;
  ate: string;
  raio_extra: number;
  raio: number | null;
  vagas: VagaDoAjuste[];
};

type ListaDoAjuste = { hoje?: string; teto_clique?: number; raio_max?: number; itens?: ItemDoAjuste[] };

type LinhaDoEstado = {
  campaign?: {
    id?: string;
    status?: string;
    biddingStrategyType?: string;
    targetSpend?: { cpcBidCeilingMicros?: string | number };
  };
  campaignBudget?: { resourceName?: string; amountMicros?: string | number };
};

type LinhaDaJanela = {
  metrics?: {
    impressions?: string | number;
    clicks?: string | number;
    costMicros?: string | number;
    conversions?: number;
    searchImpressionShare?: number;
    searchRankLostImpressionShare?: number;
    searchBudgetLostImpressionShare?: number;
  };
};

type LinhaDaBusca = {
  searchTermView?: { searchTerm?: string; status?: string };
  adGroup?: { id?: string | number };
  metrics?: { impressions?: string | number; clicks?: string | number };
};

const num = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const fracao = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);

/** "2026-11-12" menos n dias (n negativo soma). */
function menosDias(dia: string, n: number) {
  return new Date(Date.parse(`${dia}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
}

/** O dia e a hora no relógio de Brasília. */
function diaEHora(iso: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) };
}

/**
 * A janela dos números: os dias inteiros mais recentes, até 3, sem hoje. O dia em que o impulso entrou no ar só
 * conta se ele entrou de madrugada (antes das 6h); senão, a verba do dia parece sobrar.
 */
function janela(aprovadoEm: string, hoje: string) {
  const a = diaEHora(aprovadoEm);
  const primeiro = a.hora < 6 ? a.dia : menosDias(a.dia, -1);
  const ontem = menosDias(hoje, 1);
  const de = primeiro > menosDias(hoje, 3) ? primeiro : menosDias(hoje, 3);
  const dias = de <= ontem ? Math.round((Date.parse(`${ontem}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000) + 1 : 0;
  return { de, ate: ontem, dias, desde: a.dia };
}

/** As campanhas desta volta: até 2, enquanto a volta das filas tiver tempo (a IA leva segundos). */
export async function ajustarImpulsos(inicioDaVolta = Date.now()): Promise<{ feitos: number }> {
  if (!googleAdsLigado() || Date.now() - inicioDaVolta > 15_000) return { feitos: 0 };
  const a = acessoFila();
  if (!a) return { feitos: 0 };
  const { data, error } = await a.cliente.rpc("servidor_ajustes_para_fazer", { p_chave: a.chave });
  if (error) {
    // sem a migração ainda: nada a fazer
    if (error.code !== "PGRST202") console.error("Publike: falha ao ler os ajustes do dia:", error.message);
    return { feitos: 0 };
  }
  const lista = (data ?? {}) as unknown as ListaDoAjuste;
  const regras: Regras = { tetoMax: num(lista.teto_clique) || 3.5, raioMax: num(lista.raio_max) };
  let feitos = 0;
  for (const item of (lista.itens ?? []).slice(0, 2)) {
    if (Date.now() - inicioDaVolta > 15_000) break;
    // marca a manhã de hoje antes de mexer: outra volta ao mesmo tempo não ajusta de novo
    const { data: peguei } = await a.cliente.rpc("servidor_ajuste_comecou", { p_chave: a.chave, p_tipo: item.tipo, p_id: item.id });
    if (peguei !== true) continue;
    await ajustar(a, item, regras);
    feitos++;
  }
  return { feitos };
}

/** Uma campanha: lê, decide, muda no Google e guarda o diário. O erro fica no diário, e o ajuste volta amanhã. */
async function ajustar(a: AcessoDoRobo, item: ItemDoAjuste, regras: Regras) {
  const conta = item.conta_google || contaDeAnuncios();
  const hoje = hojeEmBrasilia();
  const j = janela(item.aprovado_em, hoje);
  const numeros: Record<string, unknown> = { janela: { de: j.de, ate: j.ate, dias: j.dias } };
  const salvar = async (
    mudancas: Mudanca[],
    extra: { raio?: number | null; buscas?: Record<string, { fora: string[]; vistas: string[] }>; erro?: string | null } = {},
  ) => {
    const { error } = await a.cliente.rpc("servidor_ajuste_feito", {
      p_chave: a.chave,
      p_tipo: item.tipo,
      p_id: item.id,
      p_numeros: numeros as unknown as Json,
      p_mudancas: mudancas as unknown as Json,
      p_raio_extra: extra.raio ?? null,
      p_buscas: (extra.buscas ?? {}) as unknown as Json,
      p_erro: extra.erro ?? null,
    });
    if (error) console.error(`Publike: o ajuste do impulso ${item.codigo} não ficou guardado:`, error.message);
  };

  try {
    const campanha = Number(item.campanha_id);
    const [estado] = await consultar<LinhaDoEstado>(
      `SELECT campaign.id, campaign.status, campaign.bidding_strategy_type, ` +
        `campaign.target_spend.cpc_bid_ceiling_micros, campaign_budget.resource_name, ` +
        `campaign_budget.amount_micros FROM campaign WHERE campaign.id = ${campanha}`,
      conta,
    );
    if (!estado?.campaign) throw new Error("A campanha não foi achada no Google.");
    const status = estado.campaign.status ?? "";
    numeros.status = status;
    if (status !== "ENABLED") {
      const acabou = num(item.gasto) >= num(item.verba) - 0.5;
      await salvar([
        {
          tipo: "nada",
          texto: "Nada a mudar hoje.",
          porque: acabou
            ? "A verba acabou, e o anúncio fica parado até o fim."
            : "O anúncio está parado no Google: o ajuste volta quando ele voltar.",
        },
      ]);
      return;
    }

    // os números da janela (sem os dias, o Google soma) e as buscas de verdade desde que entrou no ar
    const modelo = item.vagas.length ? await modeloDoImpulso(a) : null;
    const [linhas, buscasReais] = await Promise.all([
      j.dias > 0
        ? consultar<LinhaDaJanela>(
            `SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, ` +
              `metrics.search_impression_share, metrics.search_rank_lost_impression_share, ` +
              `metrics.search_budget_lost_impression_share FROM campaign WHERE campaign.id = ${campanha} ` +
              `AND segments.date BETWEEN '${j.de}' AND '${j.ate}'`,
            conta,
          )
        : Promise.resolve([] as LinhaDaJanela[]),
      modelo
        ? consultar<LinhaDaBusca>(
            `SELECT search_term_view.search_term, search_term_view.status, ad_group.id, metrics.impressions, ` +
              `metrics.clicks FROM search_term_view WHERE campaign.id = ${campanha} ` +
              `AND segments.date BETWEEN '${j.desde}' AND '${hoje}' ORDER BY metrics.impressions DESC LIMIT 300`,
            conta,
          )
        : Promise.resolve([] as LinhaDaBusca[]),
    ]);
    const m = linhas[0]?.metrics ?? {};
    const s: Situacao = {
      verba: num(item.verba),
      dias: num(item.dias),
      gasto: num(item.gasto),
      faltam: Math.max(0, (Date.parse(item.ate) - Date.now()) / 86_400_000),
      orcamento: num(estado.campaignBudget?.amountMicros) / 1_000_000,
      diasNaJanela: j.dias,
      impressoes: num(m.impressions),
      cliques: num(m.clicks),
      custo: num(m.costMicros) / 1_000_000,
      parcela: fracao(m.searchImpressionShare),
      perdeLance: fracao(m.searchRankLostImpressionShare),
      perdeVerba: fracao(m.searchBudgetLostImpressionShare),
      estrategia: estado.campaign.biddingStrategyType ?? null,
      // o teto do "Maximizar cliques" (o jeito do robô); sem teto (posto à mão sem limite), o ajuste não mexe no lance
      teto:
        Number(estado.campaign.targetSpend?.cpcBidCeilingMicros ?? 0) > 0
          ? num(estado.campaign.targetSpend!.cpcBidCeilingMicros) / 1_000_000
          : null,
      raio: num(item.raio),
      raioExtra: num(item.raio_extra),
    };
    Object.assign(numeros, {
      verba: s.verba,
      gasto: s.gasto,
      faltam: Math.round(s.faltam * 10) / 10,
      orcamento: s.orcamento,
      impressoes: s.impressoes,
      cliques: s.cliques,
      custo: Math.round(s.custo * 100) / 100,
      conversoes: num(m.conversions),
      parcela: s.parcela,
      perde_lance: s.perdeLance,
      perde_verba: s.perdeVerba,
      estrategia: s.estrategia,
      teto: s.teto,
      raio: s.raio,
      raio_extra: s.raioExtra,
    });

    // 1. a campanha: a verba do dia, o lance e o raio
    const mudancas: Mudanca[] = [];
    const operacoes: unknown[] = [];
    const recursoDaCampanha = recurso("campaigns", item.campanha_id, conta);
    const verba = decidirVerba(s, item.tipo === "impulso");
    if (verba?.tipo === "pausa") {
      operacoes.push({ campaignOperation: { updateMask: "status", update: { resourceName: recursoDaCampanha, status: "PAUSED" } } });
      mudancas.push(verba);
    } else if (verba && estado.campaignBudget?.resourceName) {
      operacoes.push({
        campaignBudgetOperation: {
          updateMask: "amountMicros",
          update: {
            resourceName: estado.campaignBudget.resourceName,
            amountMicros: String(Math.round(Number(verba.depois) * 1_000_000)),
          },
        },
      });
      mudancas.push(verba);
    }
    const parou = verba?.tipo === "pausa";
    const lance = parou ? null : decidirLance(s, regras);
    if (lance) {
      operacoes.push({
        campaignOperation: {
          updateMask: "targetSpend.cpcBidCeilingMicros",
          update: {
            resourceName: recursoDaCampanha,
            targetSpend: { cpcBidCeilingMicros: String(Math.round(Number(lance.depois) * 1_000_000)) },
          },
        },
      });
      mudancas.push(lance);
    }
    // o raio: o robô leva ao Google na medida seguinte (acertarLugar), com o raio a mais que fica no banco
    const raio = parou ? null : decidirRaio(s, regras, item.tipo === "cliente");
    if (raio) mudancas.push(raio);
    if (operacoes.length) await mutar(operacoes, conta);
    // o lance do ajuste é o mais novo: o teto das Regras só volta a valer se mudar de novo (migração 20270512120000)
    if (lance) {
      const { error: e } = await a.cliente.rpc("servidor_teto_aplicado", { p_chave: a.chave, p_tipo: item.tipo, p_id: item.id });
      if (e && e.code !== "PGRST202") console.error("Publike: falha ao marcar o teto do ajuste:", e.message);
    }

    // 2. as buscas de verdade, vaga por vaga (o grupo dela), com a IA
    const buscas: Record<string, { fora: string[]; vistas: string[] }> = {};
    if (!parou && modelo && buscasReais.length) {
      const porGrupo = new Map<string, BuscaReal[]>();
      for (const l of buscasReais) {
        const situacao = l.searchTermView?.status ?? "";
        // já é palavra da vaga ou já saiu
        if (situacao === "ADDED" || situacao === "EXCLUDED" || situacao === "ADDED_EXCLUDED") continue;
        const grupo = String(l.adGroup?.id ?? "");
        const busca = (l.searchTermView?.searchTerm ?? "").trim();
        if (!grupo || !busca) continue;
        const lista = porGrupo.get(grupo) ?? [];
        lista.push({ busca, impressoes: num(l.metrics?.impressions), cliques: num(l.metrics?.clicks) });
        porGrupo.set(grupo, lista);
      }
      const julgar: { v: VagaDoAjuste; buscas: BuscaReal[] }[] = [];
      let total = 0;
      for (const v of item.vagas) {
        const doGrupo = v.grupo_id ? porGrupo.get(String(v.grupo_id)) : undefined;
        if (!doGrupo?.length || total >= 100) continue;
        const daVaga = await buscasDoGrupo(a, { id: v.impulso_id, vaga: v.vaga, texto_simples: v.texto_simples });
        const lista = buscasParaJulgar(doGrupo, {
          julgadas: [...(v.excluidas ?? []), ...(v.vistas ?? [])],
          daVaga,
          lugares: [v.vaga.cidade, v.vaga.bairro],
          limite: Math.min(40, 100 - total),
        });
        if (lista.length) {
          julgar.push({ v, buscas: lista });
          total += lista.length;
        }
      }
      numeros.buscas_julgadas = total;
      if (julgar.length) {
        const descricoes = await Promise.all(julgar.map((x) => descricaoDaVaga(a, x.v.vaga.id)));
        const r = await julgarBuscasComIA(
          modelo,
          julgar.map((x, n) => ({ vaga: x.v.vaga, descricao: descricoes[n], buscas: x.buscas })),
        );
        if (r.erro) {
          // as buscas ficam para amanhã
          numeros.ia_erro = r.erro;
          console.error(`Publike: o ajuste do impulso ${item.codigo}, a IA não julgou as buscas:`, r.erro);
        } else {
          // só o que a IA tirou da lista daquela vaga, até 25 por vaga
          const tiradas = julgar.map(() => [] as { busca: string; porque: string }[]);
          for (const f of r.fora) {
            const x = julgar[f.vaga - 1];
            const achada = x?.buscas.find((b) => mesmaBusca(b.busca, f.busca));
            const lista = tiradas[f.vaga - 1];
            if (!achada || !lista || lista.length >= 25 || lista.some((t) => t.busca === achada.busca)) continue;
            lista.push({ busca: achada.busca, porque: f.porque });
          }
          // as negativas exatas, cada uma sozinha (a que o Google barrar fica de fora)
          const ops: unknown[] = [];
          const qual: { vaga: number; busca: string }[] = [];
          julgar.forEach((x, n) => {
            for (const t of tiradas[n]) {
              ops.push({
                adGroupCriterionOperation: {
                  create: {
                    adGroup: recurso("adGroups", String(x.v.grupo_id), conta),
                    negative: true,
                    keyword: { text: t.busca, matchType: "EXACT" },
                  },
                },
              });
              qual.push({ vaga: n, busca: t.busca });
            }
          });
          const aceitas = new Set<string>();
          if (ops.length) {
            const resposta = await mutar(ops, conta, { parcial: true });
            const resultados = resposta.mutateOperationResponses ?? [];
            qual.forEach((q, i) => {
              // na falha parcial, a resposta da mudança recusada vem vazia
              const r = resultados[i];
              if (!resposta.partialFailureError || (r && Object.keys(r).length > 0)) aceitas.add(`${q.vaga}|${q.busca}`);
            });
            if (resposta.partialFailureError?.message) {
              console.error(
                `Publike: o ajuste do impulso ${item.codigo}, buscas que o Google não aceitou:`,
                resposta.partialFailureError.message.slice(0, 300),
              );
            }
          }
          julgar.forEach((x, n) => {
            const fora = tiradas[n].filter((t) => aceitas.has(`${n}|${t.busca}`));
            const foraSet = new Set(fora.map((t) => t.busca));
            buscas[x.v.impulso_id] = {
              fora: fora.map((t) => t.busca),
              // as que ficam (e as que o Google não aceitou como negativa): não voltam para a IA
              vistas: x.buscas.map((b) => b.busca).filter((b) => !foraSet.has(b)),
            };
            if (fora.length) {
              mudancas.push({
                tipo: "buscas",
                ...(item.tipo === "cliente" ? { impulso_id: x.v.impulso_id } : {}),
                depois: fora.map((t) => t.busca),
                texto: textoDasBuscas(fora),
                porque: "Quem buscou isso não procura esta vaga: essas buscas não mostram mais o anúncio.",
                itens: fora,
              });
            }
          });
        }
      }
    }

    if (!mudancas.length) mudancas.push(nadaAMudar(s));
    await salvar(mudancas, { raio: raio ? s.raioExtra + (Number(raio.depois) - Number(raio.antes)) : null, buscas });
    const feitas = mudancas.filter((x) => x.tipo !== "nada").map((x) => x.tipo);
    console.info(`Publike: o ajuste do impulso ${item.codigo}: ${feitas.length ? feitas.join(", ") : "nada a mudar"}.`);
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 400);
    console.error(`Publike: o ajuste do impulso ${item.codigo} falhou:`, msg);
    await salvar([], { erro: msg });
  }
}
