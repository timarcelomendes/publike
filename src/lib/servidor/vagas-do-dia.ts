import "server-only";
import { ehModerador } from "@/lib/dados";
import { criarClienteAdmin, ehAdminLocal, type ClienteBanco } from "@/lib/supabase/admin";
import { criarClientePublico } from "@/lib/supabase/servidor";
import type { VagaDoDia } from "@/lib/vagas-do-dia";

// As vagas do carrossel do Instagram: em Admin › Vagas do dia (com a chave do admin, de todas as contas) e no kit de
// divulgação (as da própria conta). Só vaga no ar (ativa, sem "preenchida", dentro do prazo) de conta não suspensa.

const BASE =
  "id, titulo, regime, pagamento_valor, pagamento_unidade, pagamento_ate, comissao, cidade, bairro, vagas, " +
  "beneficios_lista, criado_em, contratante, contratante_confidencial, " +
  "autor:perfis!anuncios_autor_id_fkey(nome, tipo, verificado, suspenso_ate)";
// "Começa já" veio na migração 20261212120000_comeca_ja.sql: sem ela, a leitura segue sem o selo
const COM_COMECA_JA = `${BASE}, comeca_ja`;

type Autor = { nome: string; tipo: string; verificado: boolean; suspenso_ate: string | null };
type Linha = Omit<VagaDoDia, "quem" | "agencia" | "verificada" | "comeca_ja"> & {
  comeca_ja?: boolean | null;
  contratante: string | null;
  contratante_confidencial: boolean;
  autor: Autor | Autor[] | null;
};

const autorDa = (l: Linha) => (Array.isArray(l.autor) ? l.autor[0] : l.autor) ?? null;

function paraVaga(l: Linha): VagaDoDia {
  const autor = autorDa(l);
  const agencia = autor?.tipo === "agencia";
  // na vaga de agência, quem contrata é o cliente (ou "Empresa confidencial"); pessoa física fica sem nome
  const quem = l.contratante
    ? l.contratante
    : l.contratante_confidencial
      ? "Empresa confidencial"
      : autor && autor.tipo !== "pessoa"
        ? autor.nome
        : null;
  return {
    id: l.id,
    titulo: l.titulo.trim(),
    regime: l.regime,
    pagamento_valor: l.pagamento_valor,
    pagamento_unidade: l.pagamento_unidade,
    pagamento_ate: l.pagamento_ate,
    comissao: Boolean(l.comissao),
    cidade: l.cidade,
    bairro: l.bairro,
    vagas: l.vagas,
    beneficios_lista: l.beneficios_lista ?? [],
    comeca_ja: Boolean(l.comeca_ja),
    criado_em: l.criado_em,
    quem,
    agencia: agencia && quem !== autor?.nome ? (autor?.nome ?? null) : null,
    verificada: Boolean(autor?.verificado),
  };
}

const noAr = (agora: string) => (l: Linha) => {
  const autor = autorDa(l);
  return Boolean(autor) && !(autor!.suspenso_ate && autor!.suspenso_ate > agora);
};

/** A mesma leitura com e sem o "Começa já" (para o banco que ainda não tem a coluna). */
async function ler(montar: (colunas: string) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>) {
  let { data, error } = await montar(COM_COMECA_JA);
  if (error?.code === "42703") ({ data, error } = await montar(BASE));
  if (error) {
    console.error(`Publike: falha ao ler as vagas do dia: ${error.message}`);
    return [];
  }
  return (data ?? []) as Linha[];
}

/**
 * Quem monta as Vagas do dia: o admin (no computador dele, com a chave do admin) ou um moderador logado, no site no
 * ar e pelo celular. O moderador lê com a chave pública: só vaga no ar, que já é pública. null: nenhum dos dois.
 */
export async function acessoVagasDoDia(): Promise<ClienteBanco | null> {
  if (await ehAdminLocal()) return criarClienteAdmin();
  if (await ehModerador()) return criarClientePublico();
  return null;
}

/** As vagas no ar publicadas desde `desde`, as mais novas primeiro (até 60). */
export async function vagasNovasNoAr(c: ClienteBanco, desde: string, agora: string): Promise<VagaDoDia[]> {
  const linhas = await ler((colunas) =>
    c
      .from("anuncios")
      .select(colunas)
      .eq("tipo", "vaga")
      .eq("status", "ativo")
      .is("preenchida_em", null)
      .gt("expira_em", agora)
      .gte("criado_em", desde)
      .order("criado_em", { ascending: false })
      .limit(60),
  );
  return linhas.filter(noAr(agora)).map(paraVaga);
}

/** As vagas no ar de uma conta (o kit de divulgação), as mais novas primeiro (até 60). */
export async function vagasNoArDaConta(c: ClienteBanco, conta: string, agora: string): Promise<VagaDoDia[]> {
  const linhas = await ler((colunas) =>
    c
      .from("anuncios")
      .select(colunas)
      .eq("autor_id", conta)
      .eq("tipo", "vaga")
      .eq("status", "ativo")
      .is("preenchida_em", null)
      .gt("expira_em", agora)
      .order("criado_em", { ascending: false })
      .limit(60),
  );
  return linhas.filter(noAr(agora)).map(paraVaga);
}

/** As vagas escolhidas, na ordem pedida; as que saíram do ar ficam de fora. Com `conta`, só as dela. */
export async function vagasEscolhidas(
  c: ClienteBanco,
  ids: string[],
  agora: string,
  conta?: string,
): Promise<VagaDoDia[]> {
  if (!ids.length) return [];
  const linhas = await ler((colunas) => {
    const consulta = c.from("anuncios").select(colunas);
    return (conta ? consulta.eq("autor_id", conta) : consulta)
      .in("id", ids)
      .eq("tipo", "vaga")
      .eq("status", "ativo")
      .is("preenchida_em", null)
      .gt("expira_em", agora);
  });
  const porId = new Map(linhas.filter(noAr(agora)).map((l) => [l.id, paraVaga(l)]));
  return ids.flatMap((id) => porId.get(id) ?? []);
}
