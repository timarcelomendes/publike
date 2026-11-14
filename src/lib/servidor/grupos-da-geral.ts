import "server-only";
import { ocupacao } from "@/lib/cbo";
import { SITE_URL } from "@/lib/config";
import { caminhoDaFuncao, funcaoDaListaPeloCbo } from "@/lib/funcoes-das-paginas";
import {
  escolherGrupos,
  gruposQueCabem,
  NEGATIVAS_DE_SEMPRE,
  nomeDoGrupo,
  palavrasDeBase,
  sinonimosDaCbo,
  textoDoGrupo,
  type Candidato,
} from "@/lib/grupos-da-geral";
import { limparNomeDaCbo } from "@/lib/impulso";
import { caminhoDaBusca } from "@/lib/paginas-busca";
import { PRACA_PADRAO } from "@/lib/pracas";
import type { Json } from "@/lib/supabase/tipos-banco";
import { urlDosEmails } from "./ambiente";
import type { acessoFila } from "./filas";
import { consultar, ErroGoogleAds, idDoRecurso, mutar, recurso, type RespostaDoMutate } from "./google-ads-api";
import { palavrasDoGrupoComIA } from "./grupos-ia";
import { modeloDoImpulso } from "./impulso-ia";

// O robô dos grupos da campanha geral por função e por cidade (claude/plano-palavras-chave-pelas-funcoes.md; migração
// 20270522120000). Uma vez por dia, depois das 6h (e logo depois de o Admin mexer na chave): escolhe as funções e cidades
// da vez (a diferença que os pacotes põem no orçamento ÷ a verba por grupo), cria o grupo que falta (as palavras de base
// e as da IA, as negativas e o anúncio que leva à página da função ou da cidade), religa o que voltou e pausa o que
// saiu. Desligada a chave, pausa todos. Nunca apaga: o grupo pausado volta com as mesmas palavras.

type Acesso = NonNullable<ReturnType<typeof acessoFila>>;

type GrupoGuardado = {
  tipo: "funcao" | "cidade";
  chave: string;
  nome: string;
  pagina: string;
  grupo_id: string | null;
  situacao: "fora" | "ligado" | "pausado";
  palavras?: string[];
  erro?: string | null;
};

type Dados = {
  fazer?: boolean;
  ligados?: boolean;
  verba?: number | string;
  entrada?: number;
  base?: number | string;
  alvo?: number | string;
  conta?: string | null;
  campanha_id?: string | null;
  grupos?: GrupoGuardado[];
  funcoes?: { cbo: string; cidade: string | null; vagas: number; impulsionadas: number }[];
  cidades?: { cidade: string; vagas: number; impulsionadas: number }[];
};

/** Um grupo novo por volta do robô: a IA leva até 25 s, e a volta tem 60 s (o robô roda a cada minuto). */
const NOVOS_POR_VOLTA = 1;

const chaveDe = (g: { tipo: string; chave: string }) => `${g.tipo}:${g.chave}`;

/** As funções e cidades da praça com vaga no ar, como candidatas a grupo. */
export function candidatosDosDados(d: Pick<Dados, "funcoes" | "cidades">): Candidato[] {
  const daPraca = new Set<string>(PRACA_PADRAO.cidades);
  const porCbo = new Map<string, { vagas: number; impulsionadas: number }>();
  for (const f of d.funcoes ?? []) {
    if (!f.cidade || !daPraca.has(f.cidade)) continue;
    const s = porCbo.get(f.cbo) ?? { vagas: 0, impulsionadas: 0 };
    s.vagas += f.vagas;
    s.impulsionadas += f.impulsionadas;
    porCbo.set(f.cbo, s);
  }
  const lista: Candidato[] = [];
  for (const [cbo, s] of porCbo) {
    const daLista = funcaoDaListaPeloCbo(cbo);
    const o = ocupacao(cbo);
    const nome = daLista?.nome ?? (o?.nome ? limparNomeDaCbo(o.nome)[0] : null);
    if (!nome) continue;
    lista.push({
      tipo: "funcao",
      chave: cbo,
      nome,
      // só as funções da lista têm página; as outras vão para a busca do site pela função
      pagina: daLista
        ? caminhoDaFuncao(PRACA_PADRAO.cidade, daLista.slug)
        : `/?tipo=vaga&q=${encodeURIComponent(nome)}`,
      vagas: s.vagas,
      impulsionadas: s.impulsionadas,
      sinonimos: sinonimosDaCbo([o?.nome, ...(o?.sinonimos ?? [])]),
    });
  }
  // as cidades da praça menos a principal (as buscas de Goiânia já são do grupo geral)
  for (const c of d.cidades ?? []) {
    if (!daPraca.has(c.cidade) || c.cidade === PRACA_PADRAO.cidade) continue;
    lista.push({
      tipo: "cidade",
      chave: c.cidade,
      nome: c.cidade,
      pagina: caminhoDaBusca("vaga", c.cidade),
      vagas: c.vagas,
      impulsionadas: c.impulsionadas,
    });
  }
  return lista;
}

/** O plano do dia: quais grupos ligar, criar e pausar. */
export function planoDoDia(d: Dados) {
  const guardados = new Map((d.grupos ?? []).map((g) => [chaveDe(g), g]));
  const ligadosAntes = new Set((d.grupos ?? []).filter((g) => g.situacao === "ligado").map(chaveDe));
  const cabem = d.ligados ? gruposQueCabem(Number(d.alvo ?? 0), Number(d.base ?? 0), Number(d.verba ?? 10)) : 0;
  const escolhidos = escolherGrupos(candidatosDosDados(d), cabem, Number(d.entrada ?? 2), ligadosAntes);
  const querem = new Set(escolhidos.map(chaveDe));
  return {
    cabem,
    escolhidos,
    pausar: (d.grupos ?? []).filter((g) => g.situacao === "ligado" && g.grupo_id && !querem.has(chaveDe(g))),
    religar: escolhidos.filter((c) => {
      const g = guardados.get(chaveDe(c));
      return g?.grupo_id && g.situacao !== "ligado";
    }),
    criar: escolhidos.filter((c) => !guardados.get(chaveDe(c))?.grupo_id),
  };
}

async function guardar(a: Acesso, g: Record<string, unknown>) {
  const { error } = await a.cliente.rpc("servidor_grupo_da_geral", { p_chave: a.chave, p_grupo: g as unknown as Json });
  if (error) throw new Error(`não guardou o grupo ${String(g.chave)}: ${error.message}`);
}

async function mudarStatus(grupoId: string, status: "ENABLED" | "PAUSED", conta: string) {
  await mutar(
    [{ adGroupOperation: { updateMask: "status", update: { resourceName: recurso("adGroups", grupoId, conta), status } } }],
    conta,
  );
}

/** O grupo com esse nome na campanha, se já existe (o banco perdeu o id ou a volta caiu no meio). */
async function grupoPeloNome(nome: string, campanhaId: string, conta: string) {
  const [l] = await consultar<{ adGroup?: { id?: string } }>(
    `SELECT ad_group.id FROM ad_group WHERE campaign.id = ${Number(campanhaId)} AND ad_group.name = '${nome.replace(/'/g, "\\'")}' AND ad_group.status != 'REMOVED'`,
    conta,
  );
  return l?.adGroup?.id ? String(l.adGroup.id) : null;
}

async function criarGrupo(a: Acesso, c: Candidato, modelo: string | null, conta: string, campanhaId: string) {
  const nome = nomeDoGrupo(c);
  const base = palavrasDeBase(c);
  const ia = await palavrasDoGrupoComIA(modelo, c, base);
  const negativas = [...new Set([...(c.tipo === "funcao" ? NEGATIVAS_DE_SEMPRE : []), ...ia.negativas])];
  const comum = {
    tipo: c.tipo,
    chave: c.chave,
    nome: c.nome,
    pagina: c.pagina,
    vagas: c.vagas,
    impulsionadas: c.impulsionadas,
    palavras: ia.palavras,
    negativas,
    ia_modelo: ia.modelo,
  };
  const existente = await grupoPeloNome(nome, campanhaId, conta);
  if (existente) {
    await mudarStatus(existente, "ENABLED", conta);
    await guardar(a, { ...comum, grupo_id: existente, situacao: "ligado", erro: ia.erro ?? null });
    return;
  }
  const grupo = recurso("adGroups", -1, conta);
  const texto = textoDoGrupo(c);
  const ops: unknown[] = [
    {
      adGroupOperation: {
        create: {
          resourceName: grupo,
          name: nome,
          campaign: recurso("campaigns", campanhaId, conta),
          status: "ENABLED",
          type: "SEARCH_STANDARD",
        },
      },
    },
    // ampla, como o grupo geral (a frase exata deixava as palavras com "baixo volume de pesquisas")
    ...ia.palavras.map((text) => ({
      adGroupCriterionOperation: { create: { adGroup: grupo, status: "ENABLED", keyword: { text, matchType: "BROAD" } } },
    })),
    ...negativas.map((text) => ({
      adGroupCriterionOperation: { create: { adGroup: grupo, negative: true, keyword: { text, matchType: "PHRASE" } } },
    })),
    {
      adGroupAdOperation: {
        create: {
          adGroup: grupo,
          status: "ENABLED",
          ad: {
            finalUrls: [`${urlDosEmails() || SITE_URL}${c.pagina}`],
            responsiveSearchAd: {
              headlines: texto.titulos.map((text) => ({ text })),
              descriptions: texto.descricoes.map((text) => ({ text })),
              path1: texto.caminho1,
              path2: texto.caminho2,
            },
          },
        },
      },
    },
  ];
  let r: RespostaDoMutate;
  try {
    r = await mutar(ops, conta);
  } catch (e) {
    // a política do Google recusou (a palavra ou o anúncio): o grupo fica de fora, com o porquê no Admin
    if (e instanceof ErroGoogleAds && e.politica) {
      await guardar(a, { ...comum, situacao: "fora", erro: `O Google recusou: ${e.message}` });
      return;
    }
    throw e;
  }
  let grupoId: string | null = null;
  let anuncioId: string | null = null;
  for (const x of r.mutateOperationResponses ?? []) {
    if (x.adGroupResult) grupoId = idDoRecurso(x.adGroupResult.resourceName);
    if (x.adGroupAdResult) anuncioId = idDoRecurso(x.adGroupAdResult.resourceName);
  }
  await guardar(a, { ...comum, grupo_id: grupoId, anuncio_id: anuncioId, situacao: "ligado", erro: ia.erro ?? null });
}

/**
 * Uma volta: pausa o que saiu, religa o que voltou e cria um grupo novo. Quando acaba tudo, marca o dia como
 * feito; se faltou grupo para criar (o tempo da volta), a volta seguinte continua.
 */
export async function cuidarDosGrupos(a: Acesso, prazo: number) {
  const { data, error } = await a.cliente.rpc("servidor_grupos_da_geral", { p_chave: a.chave });
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: falha ao ler os grupos da campanha geral:", error.message);
    return;
  }
  const d = (data ?? null) as Dados | null;
  if (!d?.fazer || !d.conta || !d.campanha_id) return;
  const conta = d.conta;
  const plano = planoDoDia(d);
  let erro: string | null = null;
  let faltou = false;
  try {
    for (const g of plano.pausar) {
      try {
        await mudarStatus(g.grupo_id!, "PAUSED", conta);
        await guardar(a, { tipo: g.tipo, chave: g.chave, situacao: "pausado" });
      } catch (e) {
        // tirado à mão no Google: o grupo volta a ser criado se entrar de novo
        if (!(e instanceof ErroGoogleAds && e.naoExiste)) throw e;
        await guardar(a, { tipo: g.tipo, chave: g.chave, grupo_id: null, situacao: "fora" });
      }
    }
    for (const c of plano.religar) {
      const g = (d.grupos ?? []).find((x) => chaveDe(x) === chaveDe(c))!;
      try {
        await mudarStatus(g.grupo_id!, "ENABLED", conta);
        await guardar(a, {
          tipo: c.tipo,
          chave: c.chave,
          situacao: "ligado",
          vagas: c.vagas,
          impulsionadas: c.impulsionadas,
          erro: null,
        });
      } catch (e) {
        if (!(e instanceof ErroGoogleAds && e.naoExiste)) throw e;
        await guardar(a, { tipo: c.tipo, chave: c.chave, grupo_id: null, situacao: "fora" });
        plano.criar.push(c);
      }
    }
    const modelo = plano.criar.length ? await modeloDoImpulso(a) : null;
    let novos = 0;
    for (const c of plano.criar) {
      if (novos >= NOVOS_POR_VOLTA || Date.now() > prazo) {
        faltou = true;
        break;
      }
      await criarGrupo(a, c, modelo, conta, d.campanha_id);
      novos++;
    }
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
    console.error("Publike: falha nos grupos da campanha geral:", erro);
  }
  if (faltou && !erro) return;
  const { error: e2 } = await a.cliente.rpc("servidor_grupos_feita", { p_chave: a.chave, p_erro: erro });
  if (e2) console.error("Publike: falha ao guardar a volta dos grupos:", e2.message);
}
