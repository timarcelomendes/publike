"use server";

import { refresh } from "next/cache";
import { faltaParaSalvar, FORMATOS_AUTOMATICOS, type RegrasDaVaga } from "@/lib/automacoes";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { mensagemDeErro } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// As automações da vaga (migrações 20270109120000 e 20270111120000).

const CHAVE_DA_ETAPA = /^(analise|entrevista|contratado|sub:[0-9a-f-]{36})$/;

export async function salvarRegrasAutomacao(anuncioId: string, regras: RegrasDaVaga): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId) || !regras || typeof regras !== "object") return { ok: false, erro: "Pedido inválido." };
  const falta = faltaParaSalvar(regras);
  if (falta) return { ok: false, erro: falta };
  const mensagens: Record<string, string> = {};
  for (const [k, v] of Object.entries(regras.mensagens ?? {}))
    if (CHAVE_DA_ETAPA.test(k) && typeof v === "string" && UUID.test(v)) mensagens[k] = v;
  const dias = (x: unknown) => (x === null || x === undefined ? null : Math.round(Number(x)));
  const h = regras.horarios;
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("salvar_regras_automacao", {
    p_anuncio: anuncioId,
    p_regras: {
      dispensar_eliminados: regras.dispensarEliminados === true,
      mensagens,
      parado_dias: dias(regras.paradoDias),
      recado: regras.recado ? String(regras.recado).trim().slice(0, 400) : null,
      triagem_para_analise: regras.triagemParaAnalise === true,
      encerrar_dias: dias(regras.encerrarDias),
      encerrar_ao_preencher: regras.encerrarAoPreencher === true,
      preencher_ao_completar: regras.preencherAoCompletar === true,
      horarios:
        h && FORMATOS_AUTOMATICOS.includes(h.formato)
          ? { formato: h.formato, local: (h.local ?? "").trim().slice(0, 300), duracao: dias(h.duracao) ?? 30 }
          : null,
      video_a_todos: regras.videoATodos === true,
    },
  });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para salvar as automações.") };
  refresh();
  return { ok: true, mensagem: "Salvo." };
}

export async function copiarAutomacoes(anuncioId: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Vaga não encontrada." };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("copiar_automacoes", { p_anuncio: anuncioId });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para copiar agora.") };
  const n = Number(data ?? 0);
  refresh();
  return {
    ok: true,
    mensagem: n ? `Copiadas para ${n === 1 ? "1 vaga" : `${n} vagas`}.` : "Nenhuma outra vaga no ar para copiar.",
  };
}

export async function usarNasVagasNovas(anuncioId: string, usar: boolean): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Vaga não encontrada." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("usar_automacoes_nas_novas", { p_anuncio: anuncioId, p_usar: usar === true });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return {
    ok: true,
    mensagem: usar ? "As vagas novas já começam com estas regras." : "As vagas novas começam sem automações.",
  };
}
