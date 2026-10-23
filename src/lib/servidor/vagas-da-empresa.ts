import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { MODO_DEMO } from "@/lib/config";
import { criarClientePublico } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

// As vagas abertas de uma empresa ou agência, para o quadro que ela coloca no
// site dela (/embed/vagas/<id>). Iguais para todo mundo e sem login: ficam
// guardadas por alguns minutos (quem publica ou pausa vê a mudança logo depois).

export type VagaDoQuadro = {
  id: string;
  titulo: string;
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
};

export async function vagasDaEmpresa(id: string): Promise<QuadroDeVagas | null> {
  "use cache";
  // 15 minutos ("default"): com "minutes", a página era regravada a cada minuto na Vercel
  cacheLife("default");
  cacheTag(`vagas-da-empresa-${id}`);
  if (MODO_DEMO || !UUID.test(id)) return null;
  const cliente = criarClientePublico();
  const agora = new Date().toISOString();
  const [{ data: perfil }, { data: vagas, error }] = await Promise.all([
    cliente.from("perfis").select("id, nome, tipo, foto, verificado, suspenso_ate").eq("id", id).maybeSingle(),
    cliente
      .from("anuncios")
      .select(
        "id, titulo, regime, pagamento_valor, pagamento_unidade, pagamento_ate, comissao, beneficios, cidade, bairro, vagas, criado_em",
      )
      .eq("autor_id", id)
      .eq("tipo", "vaga")
      .eq("status", "ativo")
      .gt("expira_em", agora)
      .order("criado_em", { ascending: false })
      .limit(30),
  ]);
  if (error) console.error(`Publike: falha ao ler as vagas do quadro: ${error.message}`);
  // só empresa, comércio e agência têm quadro de vagas (pessoa física não)
  if (!perfil || perfil.tipo === "pessoa") return null;
  const suspensa = Boolean(perfil.suspenso_ate && perfil.suspenso_ate > agora);
  return {
    perfil: { id: perfil.id, nome: perfil.nome, tipo: perfil.tipo, foto: perfil.foto, verificado: perfil.verificado },
    vagas: suspensa ? [] : ((vagas ?? []) as VagaDoQuadro[]),
  };
}
