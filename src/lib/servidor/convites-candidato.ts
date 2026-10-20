import "server-only";
import { lerDadosDoConvite, TOKEN_CONVITE, type ConviteDaVaga } from "@/lib/convite-candidato";
import { limparCurriculoLido, type CurriculoLido } from "@/lib/ia/curriculo-do-arquivo";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// Candidato de fora: os convites de uma vaga (para quem convidou) e o convite do link (para quem
// foi chamado).

/** Os convites de uma vaga minha, do mais novo ao mais antigo (o banco só mostra os meus). */
export async function convitesDaVaga(anuncioId: string): Promise<ConviteDaVaga[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("convites_candidato")
    .select("id, token, nome, criado_em, expira_em, aceito_em, recusado_em, cancelado_em, perfil_id, curriculo")
    .eq("anuncio_id", anuncioId)
    .order("criado_em", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map(({ curriculo, ...c }) => ({ ...c, tem_curriculo: curriculo !== null }));
}

/** O convite do link, com o login de quem abriu (quem convidou vê a prévia). */
export async function dadosDoConvite(token: string) {
  if (!TOKEN_CONVITE.test(token)) return null;
  const { data, error } = await (await criarClienteServidor()).rpc("convite_candidato_do_token", { p_token: token });
  if (error) throw error;
  return lerDadosDoConvite(data);
}

/**
 * O currículo que veio pronto no convite, para o formulário começar com ele (só para quem aceitou).
 * Passa de novo pelas regras da leitura: nada do banco vai para a tela sem conferir.
 */
export async function curriculoDoConvite(token: string, hoje: string): Promise<CurriculoLido | null> {
  if (!TOKEN_CONVITE.test(token)) return null;
  const { data } = await (await criarClienteServidor()).rpc("curriculo_do_convite", { p_token: token });
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const r = data as Record<string, unknown>;
  return limparCurriculoLido({ ...r, outros_estudos: r.estudos } as Parameters<typeof limparCurriculoLido>[0], hoje);
}
