"use server";

import { MODO_DEMO } from "@/lib/config";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// O funil de quem chega sem conta (migração 20270124120000): soma 1 no evento do dia, sem saber quem foi. Sem a
// migração (ou com o banco fora), não faz nada: é só número.

// os quatro últimos: o "entrar num toque" e o convite das vagas vistas (migração 20270226120000)
const EVENTOS = new Set([
  "home",
  "curtir",
  "publicar",
  "curriculo",
  "entrar",
  "toque_mostrou",
  "toque_entrou",
  "convite_mostrou",
  "convite_tocou",
  // o chat que abre sozinho: o "Deixa comigo" e o da saída (migração 20270303120000)
  "chat_mostrou",
  "chat_tocou",
  "saida_mostrou",
  "saida_tocou",
]);

export async function registrarFunilVisitante(evento: string): Promise<void> {
  if (MODO_DEMO || !EVENTOS.has(evento)) return;
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("registrar_funil_visitante", { p_evento: evento });
  if (error && error.code !== "PGRST202")
    console.error(`Publike: falha ao contar o funil de quem chega: ${error.message}`);
}
