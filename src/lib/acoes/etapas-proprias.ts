"use server";

import { refresh } from "next/cache";
import { moverCandidatos, type ResultadoEmMassa } from "@/lib/acoes/recrutamento";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { ETAPAS_CANDIDATO } from "@/lib/constantes";
import { mensagemDeErro } from "@/lib/erros";
import { BASES, lerFaixas, MAX_ETAPAS_PROPRIAS, proximosHorarios, type FaixaLivre } from "@/lib/etapas-proprias";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// Etapas próprias e horários livres (migração 20270108120000).

export async function salvarEtapasProprias(
  etapas: { id?: string | null; nome: string; base: string }[],
): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const lista = (Array.isArray(etapas) ? etapas : []).slice(0, MAX_ETAPAS_PROPRIAS).map((e) => ({
    id: e.id && UUID.test(e.id) ? e.id : null,
    nome: String(e.nome ?? "")
      .replace(/\s+/g, " ")
      .trim(),
    base: e.base in BASES ? e.base : "analise",
  }));
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("salvar_etapas_proprias", { p_etapas: lista });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para salvar as etapas.") };
  refresh();
  return { ok: true, mensagem: "Etapas salvas." };
}

/**
 * Move no quadro: para uma etapa de hoje (`novo`, `analise`…) ou para uma própria (`sub:<id>`, que fica dentro
 * da etapa de hoje dela). Quem espera resposta ganha o match como em "Mover para".
 */
export async function moverNoQuadro(
  anuncioId: string,
  perfis: string[],
  chave: string,
  base: string,
): Promise<ResultadoEmMassa> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const sub = chave.startsWith("sub:") ? chave.slice(4) : null;
  if (!UUID.test(anuncioId) || (sub && !UUID.test(sub)) || !(base in ETAPAS_CANDIDATO))
    return { ok: false, erro: "Pedido inválido." };
  const r = await moverCandidatos(anuncioId, perfis, base, { semMensagem: Boolean(sub) });
  if (!r.ok) return r;
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("marcar_subetapa", { p_anuncio: anuncioId, p_perfis: perfis, p_subetapa: sub });
  if (error && error.code !== "PGRST202") return { ok: false, erro: mensagemDeErro(error) };
  // a mensagem automática da etapa própria (migração 20270111120000; sem ela, nada)
  if (sub && r.feitos) {
    const { data: enviadas } = await supabase.rpc("automacao_mensagem_ao_mover", {
      p_anuncio: anuncioId,
      p_perfis: perfis,
      p_etapa: chave,
    });
    const n = Number(enviadas ?? 0);
    if (n)
      r.mensagem = [r.mensagem, `A mensagem automática da etapa foi para ${n === 1 ? "1 pessoa" : `${n} pessoas`}.`]
        .filter(Boolean)
        .join(" ");
  }
  refresh();
  return r;
}

export async function salvarHorariosLivres(faixas: FaixaLivre[]): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("salvar_horarios_livres", { p_faixas: lerFaixas(faixas) });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para salvar os horários.") };
  refresh();
  return { ok: true, mensagem: "Horários salvos." };
}

/** Os próximos horários vagos da conta (para o "Deixar o candidato escolher"). Sem faixas, vazio. */
export async function proximosHorariosLivres(
  duracaoMin: number,
): Promise<{ ok: true; horarios: string[]; temFaixas: boolean } | { ok: false; erro: string }> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const supabase = await criarClienteServidor();
  const [{ data: faixas, error }, { data: ocupados }] = await Promise.all([
    supabase.rpc("meus_horarios_livres"),
    supabase.rpc("horarios_ocupados", { p_dias: 21 }),
  ]);
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para ler os seus horários.") };
  const lista = lerFaixas(faixas);
  const horarios = proximosHorarios(
    lista,
    (ocupados ?? []).map((o) => ({ inicio: new Date(o.inicio).getTime(), fim: new Date(o.fim).getTime() })),
    Date.now(),
    { duracaoMin: Math.max(15, Math.min(180, Number(duracaoMin) || 30)) },
  );
  return { ok: true, horarios, temFaixas: lista.length > 0 };
}
