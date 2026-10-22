import "server-only";
import { cache } from "react";
import { MODO_DEMO } from "@/lib/config";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/** Quem viu o perfil da conta (sem nome: navegou sem aparecer, ou a conta navega sem aparecer). */
export type Visitante = {
  visitante_id: string | null;
  nome: string | null;
  tipo: string;
  foto: string | null;
  cidade: string | null;
  bairro: string | null;
  verificado: boolean;
  /** o que a pessoa faz (do currículo aberto) */
  titulo: string | null;
  curriculo_aberto: boolean;
  onde: string;
  anuncio_id: string | null;
  anuncio_titulo: string | null;
  ultima: string;
  vezes: number;
};

export type ResumoDasVisitas = { semana: number; semana_passada: number; novas: number; anonimas: number };

const RESUMO_VAZIO: ResumoDasVisitas = { semana: 0, semana_passada: 0, novas: 0, anonimas: 0 };

/** Os visitantes dos últimos `dias` (até 90), do mais recente para o mais antigo. */
export async function quemViuMeuPerfil(dias = 30): Promise<Visitante[]> {
  if (MODO_DEMO) return [];
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("quem_viu_meu_perfil", { p_dias: dias });
  if (error) {
    console.error(`Publike: falha ao ler quem viu o perfil: ${error.message}`);
    return [];
  }
  return data ?? [];
}

/** Os números das visitas (7 dias, os 7 de antes, as novas e as de quem não entrou). */
export const resumoDasVisitas = cache(async (): Promise<ResumoDasVisitas> => {
  if (MODO_DEMO) return RESUMO_VAZIO;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("resumo_das_visitas");
  if (error) return RESUMO_VAZIO;
  return data?.[0] ?? RESUMO_VAZIO;
});

/** As opções da conta: avisar no sino e navegar sem aparecer. */
export async function minhasOpcoesDeVisitas() {
  const padrao = { avisar: true, sem_aparecer: false };
  if (MODO_DEMO) return padrao;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("minhas_opcoes_de_visitas");
  if (error) return padrao;
  return data?.[0] ?? padrao;
}

/** As minhas candidaturas que a empresa já abriu: anúncio → quando. */
export async function minhasCandidaturasVistas(): Promise<Map<string, string>> {
  if (MODO_DEMO) return new Map();
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("minhas_candidaturas_vistas");
  if (error) return new Map();
  return new Map((data ?? []).map((v) => [v.anuncio_id, v.vista_em]));
}
