import "server-only";
import { cache } from "react";
import {
  acessosDoSite,
  funilDoPublicar,
  funilDoVisitante,
  metricasDeProduto,
  motivosDeEncerramento,
  numerosDeHoje,
  numerosDoPainel,
  numerosDoTesteApp,
  origensDasContas,
  portasDeEntrada,
  presencaNoSite,
  tempoNasPaginas,
  type AcessosSite,
  type MetricasProduto,
  type NumerosPainel,
  type OrigemContas,
  type PortaDeEntrada,
  type PresencaSite,
  type TempoNasPaginas,
  usoDaIA,
  configDoSite,
} from "@/lib/admin/dados";
import type { Metas } from "@/lib/admin/indicadores";
import { custoTotalDaIA, usoPorFuncionalidade } from "@/lib/admin/custo-ia";
import type { Encerramento, NumerosDeHoje } from "@/components/admin/numeros-do-painel";
import type { AbaDoPainel } from "@/components/admin/painel/abas";
import { TESTE_FECHADO } from "@/lib/android";
import { criarClienteAdmin, type ClienteBanco } from "@/lib/supabase/admin";

// Os dados de cada aba do Painel do admin (claude/plano-indicadores-do-admin.md): cada aba lê só o que mostra.
// Equipe › Números monta o mesmo tipo a partir do `painel_no_site` (sem nomes e sem Dinheiro).

/** A receita das assinaturas (Admin › Pagamentos), sem o sandbox. */
export type Receita = {
  porMes: number;
  ativas: number;
  atrasadas: number;
  porRecurso: { recurso: string; ativas: number }[];
};

/** Os números de um intervalo (privado.indicadores_entre); `ativos`, `procuram` e `contratam` só nos períodos. */
export type NumerosDoPeriodo = {
  visitantes: number;
  contas_novas: number;
  contas_novas_pessoas: number;
  contas_novas_empresas: number;
  ativadas: number;
  candidaturas: number;
  respondidas_gente: number;
  respondidas_auto: number;
  matches_gente: number;
  matches_auto: number;
  encontros: number;
  entrevistas: number;
  contratacoes: number;
  vagas_novas: number;
  vagas_equipe: number;
  vagas_48h: number;
  vagas_48h_3: number;
  de_novo_base: number;
  de_novo: number;
  ativos?: number;
  procuram?: number;
  contratam?: number;
};

/** public.admin_indicadores (migração 20270331120000): os últimos `dias` dias inteiros, os `dias` antes e hoje. */
export type Indicadores = {
  dias: number;
  de: string;
  ate: string;
  antes_de: string;
  antes_ate: string;
  com_equipe: boolean;
  atual: NumerosDoPeriodo;
  antes: NumerosDoPeriodo;
  hoje: NumerosDoPeriodo;
  visitantes_desde: string | null;
  contas_desde: string | null;
};

export type LinhaOferta = {
  chave: string;
  no_ar: number;
  novas: number;
  candidaturas: number;
  sem_candidato: number;
  horas_primeiro: number | null;
};
export type OfertaProcura = { dias: number; areas: LinhaOferta[]; cidades: LinhaOferta[]; bairros: LinhaOferta[] };

/** public.admin_historico_indicadores (migração 20270401120000): as últimas semanas, até ontem, sem a equipe. */
export type SemanaGuardada = Partial<NumerosDoPeriodo> & {
  inicio: string;
  fim: string;
  dias_guardados: number;
  visitantes?: number | null;
};
export type Historico = { semanas: SemanaGuardada[]; desde: string | null };

export async function historicoDosIndicadores(c: ClienteBanco, semanas = 12): Promise<Historico | null> {
  const { data, error } = await c.rpc("admin_historico_indicadores", { p_semanas: semanas });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha no histórico do Painel: ${error.message}`);
    return null;
  }
  return data as unknown as Historico;
}

/** public.admin_dinheiro (migração 20270402120000): sem o sandbox. */
export type Dinheiro = {
  dias: number;
  por_mes: number;
  ativas: number;
  por_recurso: { recurso: string; ativas: number; por_mes: number }[];
  novas: number;
  canceladas: number;
  em_atraso: number;
  recebido: number;
  cobrancas_pagas: number;
  gratis_comecados: number;
  gratis_acabados: number;
  gratis_assinaram: number;
  uso: {
    leituras_triagem: number;
    testes_feitos: number;
    videos_enviados: number;
    ao_vivo: number;
    regras_ligadas: number;
  };
  gastos: { mes: string; canal: string; valor: number }[];
};

/** O custo da IA no período (a mesma conta de Admin › IA) e as contas de cada origem nos meses dos gastos. */
export type CustosDoPeriodo = {
  ia: { dolares: number; chamadas: number; semPreco: boolean } | null;
  /** "aaaa-mm|origem" → contas criadas naquele mês por aquela origem */
  contasPorOrigemNoMes: Record<string, number>;
};

export async function dinheiroDoPeriodo(c: ClienteBanco, f: FiltroDoPainel): Promise<Dinheiro | null> {
  const { data, error } = await c.rpc("admin_dinheiro", { p_dias: f.dias });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha no Dinheiro do Painel: ${error.message}`);
    return null;
  }
  return data as unknown as Dinheiro;
}

async function custosDoPeriodo(c: ClienteBanco, f: FiltroDoPainel, d: Dinheiro | null, agora: number) {
  const uso = await usoDaIA(c, f.dias).catch(() => null);
  const contasPorOrigemNoMes: Record<string, number> = {};
  const meses = [...new Set((d?.gastos ?? []).map((g) => g.mes.slice(0, 7)))];
  await Promise.all(
    meses.map(async (mes) => {
      // admin_origens conta desde a data: as do mês são as desde o dia 1 menos as desde o mês seguinte
      const [ano, m] = mes.split("-").map(Number);
      const ini = new Date(Date.UTC(ano, m - 1, 1, 3)).toISOString();
      const fim = new Date(Date.UTC(ano, m, 1, 3));
      const [desde, depois] = await Promise.all([
        origensDasContas(c, ini).catch(() => []),
        fim.getTime() < agora ? origensDasContas(c, fim.toISOString()).catch(() => []) : Promise.resolve([]),
      ]);
      for (const o of desde) {
        const tirar = depois.find((x) => x.origem === o.origem)?.contas ?? 0;
        contasPorOrigemNoMes[`${mes}|${o.origem}`] = Number(o.contas) - Number(tirar);
      }
    }),
  );
  return { ia: custoTotalDaIA(usoPorFuncionalidade(uso)), contasPorOrigemNoMes } satisfies CustosDoPeriodo;
}

/** O que a pessoa escolheu no alto do Painel. */
export type FiltroDoPainel = { dias: 7 | 30 | 90; comEquipe: boolean };

export function filtroDoPainel(dias: string | undefined, equipe: string | undefined): FiltroDoPainel {
  const d = Number(dias);
  return { dias: d === 30 || d === 90 ? d : 7, comEquipe: equipe === "com" };
}

/** null: sem a migração 20270331120000 (o Painel segue com os números de antes). */
export async function indicadoresDoPeriodo(c: ClienteBanco, f: FiltroDoPainel): Promise<Indicadores | null> {
  const { data, error } = await c.rpc("admin_indicadores", { p_dias: f.dias, p_com_equipe: f.comEquipe });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha nos indicadores do Painel: ${error.message}`);
    return null;
  }
  return data as unknown as Indicadores;
}

export async function ofertaEProcura(c: ClienteBanco, f: FiltroDoPainel): Promise<OfertaProcura | null> {
  const { data, error } = await c.rpc("admin_oferta_procura", { p_dias: f.dias, p_com_equipe: f.comEquipe });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha na oferta e procura: ${error.message}`);
    return null;
  }
  return data as unknown as OfertaProcura;
}

/** Os 2 números do menu; sem a migração, tira do resumo inteiro. */
export async function numerosDoMenu(c: ClienteBanco): Promise<{ denuncias: number; filaIA: number }> {
  const { data, error } = await c.rpc("admin_numeros_do_menu");
  if (!error && data) {
    const d = data as unknown as { denuncias_abertas: number; fila_ia: number };
    return { denuncias: d.denuncias_abertas, filaIA: d.fila_ia };
  }
  const n = await resumoDoAdmin();
  return { denuncias: n.denuncias_abertas, filaIA: n.ia?.na_fila ?? 0 };
}

export type DadosDoPainel = {
  filtro?: FiltroDoPainel;
  indicadores?: Indicadores | null;
  oferta?: OfertaProcura | null;
  historico?: Historico | null;
  dinheiro?: Dinheiro | null;
  custos?: CustosDoPeriodo | null;
  /** as metas da Visão geral e o e-mail de segunda (migração 20270403120000) */
  metas?: Metas | null;
  numerosSemana?: boolean | null;
  /** as origens das contas (para o canal do gasto com anúncios) */
  canais?: string[];
  n?: NumerosPainel | null;
  hoje?: NumerosDeHoje | null;
  acessos?: AcessosSite | null;
  presenca?: PresencaSite | null;
  metricas?: MetricasProduto | null;
  tempo?: TempoNasPaginas | null;
  encerramentos?: Encerramento[] | null;
  funilVisitante?: Map<string, number> | null;
  portas?: PortaDeEntrada[] | null;
  funilPublicar?: Map<number, number> | null;
  origens?: OrigemContas[] | null;
  receita?: Receita | null;
  testeApp?: Awaited<ReturnType<typeof numerosDoTesteApp>> | null;
};

/** O resumo do admin uma vez por pedido: o menu (no layout) e o Painel leem o mesmo. */
export const resumoDoAdmin = cache(async () => numerosDoPainel(criarClienteAdmin()));

type LinhaAssinatura = { situacao: string; atrasadas: number; sandbox?: boolean; recurso: string };

/** null: sem a migração dos pagamentos. */
export async function receitaDasAssinaturas(c: ClienteBanco): Promise<Receita | null> {
  const { data, error } = await c.rpc("admin_pagamentos");
  if (error || !data) return null;
  const d = data as unknown as { por_mes: number; assinaturas: LinhaAssinatura[] };
  const ativas = (d.assinaturas ?? []).filter((a) => a.situacao === "ativa" && !a.sandbox);
  const porRecurso = new Map<string, number>();
  for (const a of ativas) porRecurso.set(a.recurso, (porRecurso.get(a.recurso) ?? 0) + 1);
  return {
    porMes: Number(d.por_mes) || 0,
    ativas: ativas.length,
    atrasadas: ativas.filter((a) => a.atrasadas > 0).length,
    porRecurso: [...porRecurso].map(([recurso, n]) => ({ recurso, ativas: n })).sort((a, b) => b.ativas - a.ativas),
  };
}

const DIA = 86_400_000;

/** Só o que a aba mostra, em paralelo. */
export async function dadosDaAba(aba: AbaDoPainel, agora: number, filtro: FiltroDoPainel): Promise<DadosDoPainel> {
  const c = criarClienteAdmin();
  const dias = filtro.dias;
  switch (aba) {
    case "visao": {
      const [indicadores, metricas, acessos, receita, historico, config] = await Promise.all([
        indicadoresDoPeriodo(c, filtro),
        metricasDeProduto(c),
        acessosDoSite(c),
        receitaDasAssinaturas(c),
        historicoDosIndicadores(c),
        configDoSite(c),
      ]);
      return {
        filtro,
        indicadores,
        metricas,
        acessos,
        receita,
        historico,
        metas: (config.metas as Metas | undefined) ?? null,
        numerosSemana: config.numeros_semana ?? null,
      };
    }
    case "chegada": {
      const [acessos, presenca, portas, funilVisitante, origens] = await Promise.all([
        acessosDoSite(c),
        presencaNoSite(c),
        portasDeEntrada(c, dias),
        funilDoVisitante(c, dias),
        origensDasContas(c, new Date(agora - dias * DIA).toISOString()).catch(() => null),
      ]);
      return { filtro, acessos, presenca, portas, funilVisitante, origens };
    }
    case "cadastro": {
      const [n, metricas, funilPublicar] = await Promise.all([
        resumoDoAdmin(),
        metricasDeProduto(c),
        funilDoPublicar(c, dias),
      ]);
      return { filtro, n, metricas, funilPublicar };
    }
    case "vagas": {
      const [n, metricas, encerramentos, indicadores, oferta] = await Promise.all([
        resumoDoAdmin(),
        metricasDeProduto(c),
        motivosDeEncerramento(c, dias),
        indicadoresDoPeriodo(c, filtro),
        ofertaEProcura(c, filtro),
      ]);
      return { filtro, n, metricas, encerramentos, indicadores, oferta, hoje: await numerosDeHoje(c, n, agora) };
    }
    case "volta": {
      const [metricas, testeApp] = await Promise.all([
        metricasDeProduto(c),
        TESTE_FECHADO ? numerosDoTesteApp(c) : Promise.resolve(null),
      ]);
      return { filtro, metricas, testeApp };
    }
    case "dinheiro": {
      const [receita, dinheiro, origens] = await Promise.all([
        receitaDasAssinaturas(c),
        dinheiroDoPeriodo(c, filtro),
        origensDasContas(c, null).catch(() => []),
      ]);
      const custos = await custosDoPeriodo(c, filtro, dinheiro, agora);
      return { filtro, receita, dinheiro, custos, canais: origens.map((o) => o.origem) };
    }
    case "site": {
      const [n, tempo, metricas] = await Promise.all([resumoDoAdmin(), tempoNasPaginas(c), metricasDeProduto(c)]);
      return { filtro, n, tempo, metricas };
    }
  }
}
