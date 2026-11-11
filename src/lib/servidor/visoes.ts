import "server-only";
import { MODO_DEMO } from "@/lib/config";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/** O acesso às visões dos planos (Mosaico e Linha do tempo em Vagas; Quadro, Mapa e Agenda em Candidatos): o plano ou os 15 dias grátis (migração 20270422120000). */
export type AcessoAsVisoes = {
  /** a migração está no ar (sem ela, as visões pagas não aparecem) */
  disponivel: boolean;
  liberado: boolean;
  plano: boolean;
  /** o fim dos 15 dias grátis, enquanto valem */
  ate: string | null;
  /** a conta já usou os 15 dias */
  testou: boolean;
};

const SEM: AcessoAsVisoes = { disponivel: false, liberado: false, plano: false, ate: null, testou: false };

export async function acessoAsVisoes(): Promise<AcessoAsVisoes> {
  if (MODO_DEMO) return SEM;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("minhas_visoes_das_vagas");
  if (error || !data || typeof data !== "object") {
    if (error && error.code !== "PGRST202") console.error("Publike: não deu para ler as visões das vagas:", error.message);
    return SEM;
  }
  const d = data as { plano?: boolean; testou?: boolean; sem_prazo?: boolean; ate?: string | null };
  const plano = d.plano === true;
  const ate = typeof d.ate === "string" ? d.ate : null;
  return { disponivel: true, plano, ate, testou: d.testou === true, liberado: plano || Boolean(ate) || d.sem_prazo === true };
}
