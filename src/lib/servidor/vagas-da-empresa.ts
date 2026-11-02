import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { MODO_DEMO } from "@/lib/config";
import type { Marca } from "@/lib/marca";
import { criarClientePublico } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

// As vagas abertas de uma empresa ou agência, para o quadro que ela coloca no
// site dela (/embed/vagas/<id>). Iguais para todo mundo e sem login: ficam
// guardadas por alguns minutos (quem publica ou pausa vê a mudança logo depois).

export type VagaDoQuadro = {
  id: string;
  titulo: string;
  categoria: string;
  regime: string | null;
  pagamento_valor: number | null;
  pagamento_unidade: string | null;
  pagamento_ate: number | null;
  comissao: boolean;
  beneficios: string | null;
  cidade: string;
  bairro: string;
  vagas: number;
  criado_em: string;
};

export type QuadroDeVagas = {
  perfil: { id: string; nome: string; tipo: string; foto: string | null; verificado: boolean };
  vagas: VagaDoQuadro[];
  /** a página de carreiras personalizada (a cor, a capa, o apelido), só com a conta liberada */
  marca: Marca | null;
};

/** A personalização da página de carreiras, só enquanto a conta está liberada (o banco confere). */
export async function marcaDaEmpresa(id: string): Promise<Marca | null> {
  if (MODO_DEMO || !UUID.test(id)) return null;
  const { data, error } = await criarClientePublico().rpc("pagina_de_vagas_publica", { p_conta: id }).maybeSingle();
  // antes da migração 20270117120000 a função não existe: a página fica como a de todos
  if (error) return null;
  if (!data) return null;
  // antes da migração 20270120120000 não vêm o título e as fotos: a capa vira a única foto
  const fotos = data.fotos ?? (data.capa ? [data.capa] : []);
  return { ...data, beneficios: data.beneficios ?? [], titulo: data.titulo ?? null, fotos };
}

export async function vagasDaEmpresa(id: string): Promise<QuadroDeVagas | null> {
  "use cache";
  // 15 minutos ("default"): com "minutes", a página era regravada a cada minuto na Vercel
  cacheLife("default");
  cacheTag(`vagas-da-empresa-${id}`);
  return lerVagasDaEmpresa(id);
}

/**
 * As mesmas vagas lidas agora, sem guardar: para o cartaz e as imagens do kit, que a empresa abre logo depois de
 * publicar (com o guardado, a vaga nova só entrava depois de alguns minutos).
 */
export async function lerVagasDaEmpresa(id: string): Promise<QuadroDeVagas | null> {
  if (MODO_DEMO || !UUID.test(id)) return null;
  const cliente = criarClientePublico();
  const agora = new Date().toISOString();
  const [{ data: perfil }, { data: vagas, error }, marca] = await Promise.all([
    cliente.from("perfis").select("id, nome, tipo, foto, verificado, suspenso_ate").eq("id", id).maybeSingle(),
    cliente
      .from("anuncios")
      .select(
        "id, titulo, categoria, regime, pagamento_valor, pagamento_unidade, pagamento_ate, comissao, beneficios, cidade, bairro, vagas, criado_em",
      )
      .eq("autor_id", id)
      .eq("tipo", "vaga")
      .eq("status", "ativo")
      .gt("expira_em", agora)
      .order("criado_em", { ascending: false })
      .limit(30),
    marcaDaEmpresa(id),
  ]);
  if (error) console.error(`Publike: falha ao ler as vagas do quadro: ${error.message}`);
  // só empresa, comércio e agência têm quadro de vagas (pessoa física não)
  if (!perfil || perfil.tipo === "pessoa") return null;
  const suspensa = Boolean(perfil.suspenso_ate && perfil.suspenso_ate > agora);
  return {
    perfil: { id: perfil.id, nome: perfil.nome, tipo: perfil.tipo, foto: perfil.foto, verificado: perfil.verificado },
    vagas: suspensa ? [] : ((vagas ?? []) as VagaDoQuadro[]),
    marca: suspensa ? null : marca,
  };
}

/** Quantas vagas estão no ar (o quadro traz só as 30 mais novas): para "N vagas abertas" nas imagens. */
export async function totalDeVagasNoAr(id: string, lidas: number) {
  if (lidas < 30) return lidas;
  try {
    const { count } = await criarClientePublico()
      .from("anuncios")
      .select("id", { count: "exact", head: true })
      .eq("autor_id", id)
      .eq("tipo", "vaga")
      .eq("status", "ativo")
      .gt("expira_em", new Date().toISOString());
    return count ?? lidas;
  } catch {
    return lidas;
  }
}
