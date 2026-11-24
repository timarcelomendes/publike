import "server-only";
import { cache } from "react";
import { MODO_DEMO } from "@/lib/config";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// A chamada dos "Prontos para assumir" no painel (migração 20270922120000): quantas pessoas prontas cada vaga no ar da
// conta tem (as mesmas regras de Talentos › Para a sua vaga). Sem a migração ou com falha, nenhuma.

export const linkDosProntos = (anuncioId: string) => `/talentos?vaga=${anuncioId}#prontos-titulo`;

export const prontosDasMinhasVagas = cache(async (): Promise<Map<string, number>> => {
  if (MODO_DEMO) return new Map();
  try {
    const { data, error } = await (await criarClienteServidor()).rpc("prontos_das_minhas_vagas");
    if (error || !data) return new Map();
    return new Map((data as { anuncio_id: string; total: number }[]).filter((l) => l.total > 0).map((l) => [l.anuncio_id, l.total]));
  } catch {
    return new Map();
  }
});
