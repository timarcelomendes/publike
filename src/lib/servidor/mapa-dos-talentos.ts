import "server-only";
import { MODO_DEMO } from "@/lib/config";
import {
  nomeDoBairro,
  NOMES_POR_BAIRRO,
  type BairroNoMapa,
  type MapaDosTalentos,
  type PessoaNoMapa,
  type Ponto,
  type VagaNoMapa,
} from "@/lib/mapa-dos-talentos";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// O mapa dos talentos (migrações 20270630120000 e 20270702120000): as pessoas de Talentos no centro do bairro que elas
// escreveram no perfil (nunca a casa), e as vagas no ar de quem vê. Só para quem contrata: a conta de empresa, comércio
// ou agência, a que tem vaga publicada e a que marcou "Contratar".

function lerTalentos(v: unknown): PessoaNoMapa[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((t): t is { id: string; nome: string; titulo?: unknown } =>
      Boolean(t && typeof t === "object" && typeof t.id === "string" && typeof t.nome === "string"),
    )
    .map((t) => ({ id: t.id, nome: t.nome, titulo: typeof t.titulo === "string" && t.titulo ? t.titulo : null }));
}

/** As minhas vagas no ar com o lugar (no mapa, em verde; e de onde o "Para a sua vaga" conta a distância). */
export async function minhasVagasNoMapa(): Promise<VagaNoMapa[]> {
  if (MODO_DEMO) return [];
  const { data, error } = await (await criarClienteServidor()).rpc("minhas_vagas_no_mapa");
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao ler as vagas do mapa: ${error.message}`);
    return [];
  }
  return (data ?? []).map((v) => ({ id: v.id, titulo: v.titulo, lat: Number(v.lat), lng: Number(v.lng) }));
}

/**
 * O mapa da busca de "Todos os talentos" (todas as páginas, agrupado no banco) e o lugar de cada pessoa dele (para a
 * distância no cartão). null: não deu para ler (sem a migração, conta que não contrata, ou o banco falhou).
 */
export async function mapaDaBusca(f: {
  texto: string;
  cidade: string | null;
}): Promise<{ mapa: MapaDosTalentos; lugares: Map<string, Ponto> } | null> {
  if (MODO_DEMO) return null;
  const supabase = await criarClienteServidor();
  const [talentos, vagas] = await Promise.all([
    supabase.rpc("mapa_dos_talentos", { p_texto: f.texto || null, p_cidade: f.cidade }),
    minhasVagasNoMapa(),
  ]);
  if (talentos.error) {
    if (talentos.error.code !== "PGRST202" && talentos.error.code !== "P0001") {
      console.error(`Publike: falha ao montar o mapa dos talentos: ${talentos.error.message}`);
    }
    return null;
  }
  const bairros: BairroNoMapa[] = [];
  const lugares = new Map<string, Ponto>();
  let semLugar = 0;
  for (const l of talentos.data ?? []) {
    if (l.lat == null || l.lng == null) {
      semLugar += Number(l.pessoas) || 0;
      continue;
    }
    const ponto = { lat: Number(l.lat), lng: Number(l.lng) };
    const todos = lerTalentos(l.talentos);
    for (const t of todos) lugares.set(t.id, ponto);
    bairros.push({
      chave: `${ponto.lat}|${ponto.lng}`,
      cidade: l.cidade ?? "",
      bairro: nomeDoBairro(l.bairro ?? ""),
      ...ponto,
      pessoas: Number(l.pessoas) || 0,
      talentos: todos.slice(0, NOMES_POR_BAIRRO),
    });
  }
  bairros.sort((a, b) => b.pessoas - a.pessoas);
  return { mapa: { bairros, semLugar, vagas }, lugares };
}

/**
 * O lugar aproximado (o centro do bairro) de cada pessoa de uma lista, para o mapa e a distância do "Para a sua vaga".
 * Quem não tem bairro (ou tem um que o mapa não acha) não vem. null: não deu para ler.
 */
export async function lugaresDosTalentos(
  ids: string[],
): Promise<Map<string, Ponto & { cidade: string; bairro: string | null }> | null> {
  if (MODO_DEMO || !ids.length) return MODO_DEMO ? null : new Map();
  const { data, error } = await (await criarClienteServidor()).rpc("bairros_dos_talentos", { p_ids: ids.slice(0, 600) });
  if (error) {
    if (error.code !== "PGRST202" && error.code !== "P0001") {
      console.error(`Publike: falha ao ler os bairros dos talentos: ${error.message}`);
    }
    return null;
  }
  return new Map(
    (data ?? []).map((l) => [l.perfil_id, { lat: Number(l.lat), lng: Number(l.lng), cidade: l.cidade, bairro: l.bairro }]),
  );
}
