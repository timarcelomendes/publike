import "server-only";
import { escolhasDosUsos, USOS_IA, type EscolhaDoUso, type UsoIA } from "@/lib/ia-nomes";
import { criarClientePublico } from "@/lib/supabase/servidor";

// O liga e desliga e o modelo de cada uso da IA (Admin › IA; `config_site.ia_usos`, migração 20270907120000), lidos do
// banco no máximo a cada 30 segundos por servidor: uma mudança no Admin vale em até meio minuto. Sem a migração ou sem
// banco, tudo ligado e sem modelo próprio (como antes).

let lidas: { valor: Partial<Record<UsoIA, EscolhaDoUso>>; em: number } | null = null;

async function escolhas() {
  if (lidas && Date.now() - lidas.em < 30_000) return lidas.valor;
  let valor: Partial<Record<UsoIA, EscolhaDoUso>> = lidas?.valor ?? {};
  try {
    const { data, error } = await criarClientePublico().rpc("config_ia_usos");
    if (!error) valor = escolhasDosUsos(data);
  } catch {
    // sem banco (demonstração): o que já tinha
  }
  lidas = { valor, em: Date.now() };
  return valor;
}

/** O uso está ligado e, se tiver, o modelo próprio dele (sem, null: vale o que quem chama escolheu). */
export async function escolhaDoUso(uso: UsoIA): Promise<{ ligado: boolean; modelo: string | null }> {
  const e = (await escolhas())[uso];
  return { ligado: e?.ligado !== false, modelo: e?.modelo ?? null };
}

/** O uso está ligado no Admin › IA? (para quem quer saber antes de chamar, sem erro) */
export async function usoLigado(uso: UsoIA) {
  return (await escolhaDoUso(uso)).ligado;
}

export function nomeDoUso(uso: UsoIA) {
  return USOS_IA.find((u) => u.id === uso)?.nome ?? uso;
}
