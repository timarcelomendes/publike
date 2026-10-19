import "server-only";
import { MODO_DEMO } from "@/lib/config";
import { listarMeusAnuncios, lerExperiencias } from "@/lib/dados";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { estudosDoBanco } from "@/lib/estudos";
import { TALENTOS_POR_PAGINA, type TalentoResumo } from "@/lib/talentos";
import type { Estudo, Experiencia } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// Leituras da aba Talentos (o banco decide o que cada um vê: o resumo é aberto, o
// currículo completo é só para empresa, comércio e agência que entraram).

/** Uma página da aba Talentos. null: não deu para ler. */
export async function buscarTalentos(f: {
  texto: string;
  cidade: string | null;
  /** o bairro de quem procura: os do mesmo bairro vêm primeiro */
  bairro: string | null;
  pagina: number;
}): Promise<{ lista: TalentoResumo[]; total: number } | null> {
  if (MODO_DEMO) return { lista: [], total: 0 };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("buscar_talentos", {
    p_texto: f.texto || null,
    p_cidade: f.cidade,
    p_bairro: f.bairro,
    p_limite: TALENTOS_POR_PAGINA,
    p_deslocamento: (f.pagina - 1) * TALENTOS_POR_PAGINA,
  });
  if (error) {
    console.error(`Publike: falha ao buscar talentos: ${error.message}`);
    return null;
  }
  const linhas = data ?? [];
  return { lista: linhas, total: Number(linhas[0]?.total ?? 0) };
}

/** O resumo de uma pessoa da aba, com o curso (null: não está na aba). */
export async function talentoResumo(
  perfilId: string,
): Promise<(TalentoResumo & { curso: string | null; estudos: Estudo[] }) | null> {
  if (MODO_DEMO || !UUID.test(perfilId)) return null;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("talento_resumo", { p_perfil: perfilId }).maybeSingle();
  if (error) console.error(`Publike: falha ao ler o talento: ${error.message}`);
  return data ? { ...data, estudos: estudosDoBanco(data.estudos) } : null;
}

export type TalentoCompleto = {
  perfil_id: string;
  nome: string;
  foto: string | null;
  cidade: string;
  bairro: string | null;
  sobre: string | null;
  titulo: string | null;
  habilidades: string[];
  escolaridade: string | null;
  curso: string | null;
  experiencias: Experiencia[];
  cursos: string[];
  cnh: string | null;
  disponibilidade: string[];
  atualizado_em: string;
  estudos: Estudo[];
};

/** O currículo completo (empresa, comércio e agência). O erro vem em texto, para mostrar na página. */
export async function talentoCompleto(
  perfilId: string,
): Promise<{ ok: true; talento: TalentoCompleto | null } | { ok: false; erro: string }> {
  if (MODO_DEMO || !UUID.test(perfilId)) return { ok: true, talento: null };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("talento_completo", { p_perfil: perfilId }).maybeSingle();
  if (error) {
    // as mensagens do banco já vêm em português (limite do dia, conta suspensa, só para empresas)
    return { ok: false, erro: error.code === "P0001" ? error.message : "Não deu para abrir o currículo agora." };
  }
  return {
    ok: true,
    talento: data
      ? { ...data, experiencias: lerExperiencias(data.experiencias), estudos: estudosDoBanco(data.estudos) }
      : null,
  };
}

/** As minhas vagas no ar (e não preenchidas), para convidar esta pessoa: se já convidei e se ela já curtiu. */
export async function vagasParaConvidar(
  perfilId: string,
  agora: number,
): Promise<{ id: string; titulo: string; convidado: boolean; curtiu: boolean }[]> {
  if (MODO_DEMO || !UUID.test(perfilId)) return [];
  const noAr = (await listarMeusAnuncios()).filter(
    (a) => a.tipo === "vaga" && a.status === "ativo" && new Date(a.expira_em).getTime() > agora,
  );
  if (!noAr.length) return [];
  const ids = noAr.map((a) => a.id);
  const supabase = await criarClienteServidor();
  const [convites, curtidas, preenchidas] = await Promise.all([
    supabase.from("convites_vaga").select("anuncio_id").eq("perfil_id", perfilId).in("anuncio_id", ids),
    supabase.from("curtidas").select("anuncio_id").eq("perfil_id", perfilId).in("anuncio_id", ids),
    supabase.from("anuncios").select("id").in("id", ids).not("preenchida_em", "is", null),
  ]);
  const convidadas = new Set((convites.data ?? []).map((c) => c.anuncio_id));
  const curtiu = new Set((curtidas.data ?? []).map((c) => c.anuncio_id));
  const fora = new Set((preenchidas.data ?? []).map((a) => a.id));
  return noAr
    .filter((a) => !fora.has(a.id))
    .map((a) => ({ id: a.id, titulo: a.titulo, convidado: convidadas.has(a.id), curtiu: curtiu.has(a.id) }));
}
