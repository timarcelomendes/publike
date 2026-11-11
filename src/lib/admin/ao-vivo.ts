import "server-only";
import type { ClienteBanco } from "@/lib/supabase/admin";

// Admin › Pagamentos: as entrevistas ao vivo pelo Publike do mês e quanto da franquia grátis da Daily elas usam
// (11/11/2026, migração 20270420120000). A Daily dá 10.000 minutos de participante por mês para o site todo; depois,
// US$ 0,004 por minuto de cada pessoa. A conta é uma estimativa: a duração marcada × 2 pessoas. O número certo está no
// painel da Daily.

export const FRANQUIA_DAILY = 10_000;
/** A partir daqui, o aviso: 80% da franquia. */
export const AVISO_DAILY = 8_000;
export const DOLAR_POR_MINUTO = 0.004;

export type AoVivoNoAdmin = { entrevistas: number; minutos: number; contas: number };

export async function aoVivoDoMesNoAdmin(c: ClienteBanco, agora: number): Promise<AoVivoNoAdmin | null> {
  // o mês em Goiânia (UTC-3, sem horário de verão)
  const local = new Date(agora - 3 * 3600e3);
  const inicio = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, 3));
  const fim = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1, 3));
  const { data, error } = await c
    .from("entrevistas")
    .select("anuncio_id, duracao_min")
    .eq("formato", "publike")
    .neq("situacao", "cancelada")
    .gte("quando", inicio.toISOString())
    .lt("quando", fim.toISOString())
    .limit(5000);
  if (error) return null;
  const linhas = data ?? [];
  return {
    entrevistas: linhas.length,
    minutos: linhas.reduce((t, x) => t + (x.duracao_min ?? 30) * 2, 0),
    contas: new Set(linhas.map((x) => x.anuncio_id)).size,
  };
}
