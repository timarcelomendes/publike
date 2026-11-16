import "server-only";
import { MODO_DEMO } from "@/lib/config";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// O mapa dos talentos (migração 20270630120000): as pessoas de Talentos no centro do bairro que elas escreveram no
// perfil (nunca a casa), agrupadas por bairro, e as vagas no ar de quem vê. Só para quem contrata.

/** Quantos nomes cada bairro mostra embaixo do mapa (o resto vira "e mais N"). */
const NOMES_POR_BAIRRO = 12;

export type BairroNoMapa = {
  chave: string;
  cidade: string;
  bairro: string;
  lat: number;
  lng: number;
  pessoas: number;
  talentos: { id: string; nome: string; titulo: string | null }[];
};

export type MapaDosTalentos = {
  bairros: BairroNoMapa[];
  /** sem bairro no perfil, ou com um bairro que o mapa não achou */
  semLugar: number;
  vagas: { id: string; titulo: string; lat: number; lng: number }[];
};

function lerTalentos(v: unknown): BairroNoMapa["talentos"] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((t): t is { id: string; nome: string; titulo?: unknown } =>
      Boolean(t && typeof t === "object" && typeof t.id === "string" && typeof t.nome === "string"),
    )
    .slice(0, NOMES_POR_BAIRRO)
    .map((t) => ({ id: t.id, nome: t.nome, titulo: typeof t.titulo === "string" && t.titulo ? t.titulo : null }));
}

/** null: não deu para ler (sem a migração, sem conta de quem contrata, ou o banco falhou). */
export async function mapaDosTalentos(f: { texto: string; cidade: string | null }): Promise<MapaDosTalentos | null> {
  if (MODO_DEMO) return null;
  const supabase = await criarClienteServidor();
  const [talentos, vagas] = await Promise.all([
    supabase.rpc("mapa_dos_talentos", { p_texto: f.texto || null, p_cidade: f.cidade }),
    supabase.rpc("minhas_vagas_no_mapa"),
  ]);
  if (talentos.error) {
    if (talentos.error.code !== "PGRST202" && talentos.error.code !== "P0001") {
      console.error(`Publike: falha ao montar o mapa dos talentos: ${talentos.error.message}`);
    }
    return null;
  }
  const bairros: BairroNoMapa[] = [];
  let semLugar = 0;
  for (const l of talentos.data ?? []) {
    if (l.lat == null || l.lng == null) {
      semLugar += Number(l.pessoas) || 0;
      continue;
    }
    bairros.push({
      chave: `${l.cidade ?? ""}|${l.bairro ?? ""}|${l.lat}|${l.lng}`,
      cidade: l.cidade ?? "",
      bairro: l.bairro ?? "",
      lat: Number(l.lat),
      lng: Number(l.lng),
      pessoas: Number(l.pessoas) || 0,
      talentos: lerTalentos(l.talentos),
    });
  }
  bairros.sort((a, b) => b.pessoas - a.pessoas);
  return {
    bairros,
    semLugar,
    vagas: (vagas.data ?? []).map((v) => ({ id: v.id, titulo: v.titulo, lat: Number(v.lat), lng: Number(v.lng) })),
  };
}
