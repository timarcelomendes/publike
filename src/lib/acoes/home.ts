"use server";

import { MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { proximaVisita } from "@/lib/linha-do-tempo";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/**
 * A pessoa abriu a home: grava a hora (e, numa visita nova, leva a marca "Você parou aqui" para a
 * abertura anterior). Chamada pelo navegador depois que a página aparece: a página não grava
 * enquanto desenha. Sem a migração da home, não faz nada.
 */
export async function registrarVisitaDaHome(): Promise<void> {
  if (MODO_DEMO) return;
  const usuario = await obterUsuario();
  if (!usuario) return;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("preferencias")
    .select("home_vista_em, home_marca_em")
    .eq("perfil_id", usuario.id)
    .maybeSingle();
  if (error) return;
  // perfil_id vem sozinho (auth.uid()); a pessoa só escreve as colunas dela
  await supabase
    .from("preferencias")
    .upsert(proximaVisita(data?.home_vista_em ?? null, data?.home_marca_em ?? null, Date.now()), {
      onConflict: "perfil_id",
    });
}

/** Guarda a aba escolhida na linha do tempo (a home abre nela da próxima vez). */
export async function escolherAbaDaHome(aba: string): Promise<void> {
  if (MODO_DEMO || !["tudo", "vaga", "servico"].includes(aba)) return;
  const usuario = await obterUsuario();
  if (!usuario) return;
  const supabase = await criarClienteServidor();
  await supabase.from("preferencias").upsert({ home_aba: aba }, { onConflict: "perfil_id" });
}
