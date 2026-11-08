import "server-only";
import { criarClientePublico, criarClienteServidor } from "@/lib/supabase/servidor";
import type { VagaDoFeed } from "@/lib/feed-vagas";

// O arquivo de vagas (/feed/vagas.xml; migração 20270310120000; claude/plano-painel-feed-indicacao-documentos.md,
// parte 2), no formato do Jooble (https://jooble.org/files/xml_feed_specifications.pdf), que os outros sites de vagas
// também leem: id, link, título, região, descrição completa, salário, empresa, datas e tipo. Só o que já é público na
// página da vaga. O link leva ?utm_source=<site>, e os Resultados mostram de onde veio o candidato.

/** As vagas no ar de quem deixa ir para outros sites. null: sem a migração ou não deu para ler. */
export async function vagasParaOFeed(): Promise<VagaDoFeed[] | null> {
  const { data: linhas, error } = await criarClientePublico().rpc("vagas_para_o_feed", { p_limite: 2000 });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao montar o arquivo de vagas: ${error.message}`);
    return null;
  }
  return (Array.isArray(linhas) ? linhas : []) as unknown as VagaDoFeed[];
}

/** Se a conta deixa as vagas irem para outros sites. null: sem a migração. */
export async function vagasEmOutrosSites(conta: string): Promise<boolean | null> {
  const { data, error } = await (await criarClienteServidor())
    .from("perfis")
    .select("vagas_em_outros_sites")
    .eq("id", conta)
    .maybeSingle();
  if (error || !data) return null;
  return data.vagas_em_outros_sites !== false;
}
