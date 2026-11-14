import "server-only";
import {
  lanceDoRaio,
  lanceMudou,
  planoDosRaios,
  pontoDoRaio,
  type PacoteComPonto,
  type RaioGuardado,
} from "@/lib/raios-da-geral";
import type { Json } from "@/lib/supabase/tipos-banco";
import type { acessoFila } from "./filas";
import { consultar, ErroGoogleAds, idDoRecurso, mutar, recurso } from "./google-ads-api";

// O robô dos raios das vagas impulsionadas na campanha geral (claude/plano-raios-das-vagas-impulsionadas.md; migração
// 20270523120000). Entrou um pacote: um raio em volta da vaga, com o lance a mais (duas vagas no mesmo ponto usam o
// mesmo raio). Acabou: o raio sai. Uma vez por dia, depois das 6h: mede os últimos 7 dias de cada raio e baixa o lance a
// mais onde o clique já sai barato. Desligada a chave, tira todos. Nunca mexe nas cidades nem nos outros lugares.

type Acesso = NonNullable<ReturnType<typeof acessoFila>>;

type Dados = {
  fazer?: boolean;
  medir?: boolean;
  ligados?: boolean;
  km?: number | string;
  lance?: number;
  minimo?: number;
  conta?: string | null;
  campanha_id?: string | null;
  raios?: RaioGuardado[];
  pacotes?: PacoteComPonto[];
};

async function guardar(a: Acesso, r: Record<string, unknown>) {
  const { error } = await a.cliente.rpc("servidor_raio_da_geral", { p_chave: a.chave, p_raio: r as unknown as Json });
  if (error) throw new Error(`não guardou o raio do impulso ${String(r.impulso_id)}: ${error.message}`);
}

const nomeDoCriterio = (conta: string, campanhaId: string, criterioId: string) =>
  recurso("campaignCriteria", `${campanhaId}~${criterioId}`, conta);

const modificador = (lance: number) => Math.round((1 + lance / 100) * 100) / 100;

async function criarRaio(conta: string, campanhaId: string, p: PacoteComPonto, km: number, lance: number) {
  const r = await mutar(
    [
      {
        campaignCriterionOperation: {
          create: {
            campaign: recurso("campaigns", campanhaId, conta),
            bidModifier: modificador(lance),
            proximity: {
              geoPoint: {
                latitudeInMicroDegrees: Math.round(Number(p.lat) * 1_000_000),
                longitudeInMicroDegrees: Math.round(Number(p.lng) * 1_000_000),
              },
              radius: km,
              radiusUnits: "KILOMETERS",
            },
          },
        },
      },
    ],
    conta,
  );
  const id = idDoRecurso(r.mutateOperationResponses?.[0]?.campaignCriterionResult?.resourceName);
  if (!id) throw new Error("o Google não devolveu o raio criado");
  return id;
}

/** Os últimos 7 dias de cada raio (pelo critério) e da campanha toda. */
async function medida(conta: string, campanhaId: string) {
  const id = Number(campanhaId);
  const [porRaio, campanha] = await Promise.all([
    consultar<{ campaignCriterion?: { criterionId?: string }; metrics?: Record<string, string | number> }>(
      `SELECT campaign_criterion.criterion_id, metrics.impressions, metrics.clicks, metrics.cost_micros FROM location_view WHERE campaign.id = ${id} AND segments.date DURING LAST_7_DAYS`,
      conta,
    ),
    consultar<{ metrics?: Record<string, string | number> }>(
      `SELECT metrics.clicks, metrics.cost_micros FROM campaign WHERE campaign.id = ${id} AND segments.date DURING LAST_7_DAYS`,
      conta,
    ),
  ]);
  const raios = new Map<string, { vistas: number; cliques: number; custo: number }>();
  for (const l of porRaio) {
    const c = String(l.campaignCriterion?.criterionId ?? "");
    if (!c) continue;
    const s = raios.get(c) ?? { vistas: 0, cliques: 0, custo: 0 };
    s.vistas += Number(l.metrics?.impressions ?? 0);
    s.cliques += Number(l.metrics?.clicks ?? 0);
    s.custo += Number(l.metrics?.costMicros ?? 0) / 1_000_000;
    raios.set(c, s);
  }
  const total = campanha.reduce(
    (s, l) => ({
      cliques: s.cliques + Number(l.metrics?.clicks ?? 0),
      custo: s.custo + Number(l.metrics?.costMicros ?? 0) / 1_000_000,
    }),
    { cliques: 0, custo: 0 },
  );
  return { raios, total };
}

/**
 * Uma volta: tira os raios dos pacotes que acabaram, põe os dos que entraram e, uma vez por dia, mede e acerta o lance.
 * Um raio que o Google recusou fica de fora com o porquê e só tenta de novo depois de 1 hora.
 */
export async function cuidarDosRaios(a: Acesso, prazo: number) {
  const { data, error } = await a.cliente.rpc("servidor_raios_da_geral", { p_chave: a.chave });
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: falha ao ler os raios da campanha geral:", error.message);
    return;
  }
  const d = (data ?? null) as Dados | null;
  if (!d?.fazer || !d.conta || !d.campanha_id) return;
  const conta = d.conta;
  const campanhaId = d.campanha_id;
  const km = Number(d.km ?? 5);
  const lance = Number(d.lance ?? 50);
  const minimo = Number(d.minimo ?? 10);
  const raios = d.raios ?? [];
  const plano = planoDosRaios(Boolean(d.ligados), d.pacotes ?? [], raios);
  let erro: string | null = null;
  try {
    for (const r of plano.tirar) {
      if (r.tirarDoGoogle) {
        try {
          await mutar([{ campaignCriterionOperation: { remove: nomeDoCriterio(conta, campanhaId, r.criterio_id!) } }], conta);
        } catch (e) {
          // tirado à mão no Google: nada a fazer
          if (!(e instanceof ErroGoogleAds && e.naoExiste)) throw e;
        }
      }
      await guardar(a, { impulso_id: r.impulso_id, situacao: "tirado" });
    }
    // os pontos que ganham raio nesta volta (duas vagas no mesmo endereço, um raio só)
    const criados = new Map<string, string>();
    const umaHora = Date.now() - 3600_000;
    for (const p of plano.criar) {
      if (Date.now() > prazo) break;
      const antes = raios.find((r) => r.impulso_id === p.impulso_id);
      if (antes?.erro_em && Date.parse(antes.erro_em) > umaHora) continue;
      const comum = { impulso_id: p.impulso_id, anuncio_id: p.anuncio_id, lat: Number(p.lat), lng: Number(p.lng), raio_km: km };
      const ponto = pontoDoRaio(p.lat, p.lng);
      const existente = p.criterio_id ?? criados.get(ponto) ?? null;
      if (existente) {
        const doPonto = raios.find((r) => r.criterio_id === existente);
        await guardar(a, { ...comum, lance: doPonto?.lance ?? lance, criterio_id: existente, situacao: "ligado", erro: null });
        continue;
      }
      try {
        const id = await criarRaio(conta, campanhaId, p, km, lance);
        criados.set(ponto, id);
        // o raio novo começa sem a medida do raio de antes
        await guardar(a, { ...comum, lance, criterio_id: id, situacao: "ligado", erro: null, vistas: null, cliques: null, custo: null });
      } catch (e) {
        if (!(e instanceof ErroGoogleAds)) throw e;
        await guardar(a, { ...comum, lance, situacao: "fora", erro: `O Google recusou: ${e.message}` });
      }
    }
    // uma vez por dia: a medida dos 7 dias e o lance de cada raio no ar (um por critério)
    if (d.medir && Date.now() < prazo) {
      const m = await medida(conta, campanhaId);
      const feitos = new Set<string>();
      for (const r of raios.filter((x) => x.situacao === "ligado" && x.criterio_id && !plano.tirar.some((t) => t.impulso_id === x.impulso_id))) {
        const s = m.raios.get(r.criterio_id!) ?? { vistas: 0, cliques: 0, custo: 0 };
        const novo = lanceDoRaio({
          lance,
          minimo,
          atual: r.lance,
          cliques: s.cliques,
          custo: s.custo,
          cliquesDaCampanha: m.total.cliques,
          custoDaCampanha: m.total.custo,
        });
        const mudar = lanceMudou(r.lance, novo, { lance, minimo });
        if (mudar && !feitos.has(r.criterio_id!)) {
          await mutar(
            [
              {
                campaignCriterionOperation: {
                  updateMask: "bid_modifier",
                  update: { resourceName: nomeDoCriterio(conta, campanhaId, r.criterio_id!), bidModifier: modificador(novo) },
                },
              },
            ],
            conta,
          );
          feitos.add(r.criterio_id!);
        }
        await guardar(a, {
          impulso_id: r.impulso_id,
          lance: mudar ? novo : r.lance,
          vistas: s.vistas,
          cliques: s.cliques,
          custo: Math.round(s.custo * 100) / 100,
        });
      }
    }
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
    console.error("Publike: falha nos raios da campanha geral:", erro);
  }
  const { error: e2 } = await a.cliente.rpc("servidor_raios_feita", {
    p_chave: a.chave,
    p_erro: erro,
    p_medida: Boolean(d.medir) && !erro,
  });
  if (e2) console.error("Publike: falha ao guardar a volta dos raios:", e2.message);
}
