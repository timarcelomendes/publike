"use server";

import { refresh } from "next/cache";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import type { Resultado } from "@/lib/tipos";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

export type OndeVisita = "perfil" | "talento" | "candidatura";
const LUGARES: readonly string[] = ["perfil", "talento", "candidatura"];

/**
 * Alguém abriu um perfil, a página do talento ou a candidatura (na Caixa): grava a visita para
 * "Quem viu seu perfil". Chamada pelo navegador depois que a página aparece (o prefetch dos links e
 * os robôs não contam). As regras (própria conta, bloqueio, limites e avisos) ficam no banco.
 */
export async function registrarVisita(perfilId: string, onde: OndeVisita, anuncioId?: string | null): Promise<void> {
  if (MODO_DEMO || !UUID.test(perfilId) || !LUGARES.includes(onde)) return;
  if (anuncioId != null && !UUID.test(anuncioId)) return;
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("registrar_visita", {
    p_perfil: perfilId,
    p_onde: onde,
    p_anuncio: anuncioId ?? null,
  });
  // sem a migração das visitas (ou com o banco fora), a página segue sem contar
  if (error) console.error(`Publike: falha ao registrar a visita: ${error.message}`);
}

/** As duas opções de "Quem viu seu perfil": avisar no sino e navegar sem aparecer (só pessoa). */
export async function mudarOpcoesDeVisitas(avisar: boolean, semAparecer: boolean): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta para mudar as opções." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("mudar_opcoes_de_visitas", {
    p_avisar: Boolean(avisar),
    p_sem_aparecer: Boolean(semAparecer),
  });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para salvar. Tente de novo.") };
  refresh();
  return { ok: true };
}

/** Abriu "Quem viu seu perfil": as visitas deixam de ser novas (chamada depois que a página aparece). */
export async function marcarVisitasVistas(): Promise<void> {
  if (MODO_DEMO) return;
  const supabase = await criarClienteServidor();
  await supabase.rpc("marcar_visitas_vistas");
}
