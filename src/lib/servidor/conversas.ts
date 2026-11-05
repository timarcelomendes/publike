import "server-only";
import { cache } from "react";
import { MODO_DEMO } from "@/lib/config";
import { lerVagasDaConversa, type ConversaPessoa } from "@/lib/conversas";
import { COLUNAS_DA_MENSAGEM, type MensagemConversa } from "@/lib/dados";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Database } from "@/lib/supabase/tipos-banco";
import { UUID } from "@/lib/validacao";

// Leituras das conversas: uma por pessoa (o banco junta as vagas e a conexão e decide quem lê).

type Linha = Database["public"]["Functions"]["conversas_por_pessoa"]["Returns"][number];

function lerConversa(l: Linha): ConversaPessoa {
  return {
    ...l,
    vagas: lerVagasDaConversa(l.vagas),
    conectados: l.conectados === true,
    outro_na_vitrine: l.outro_na_vitrine === true,
    ultima_minha: l.ultima_minha === true,
    nao_lidas: l.nao_lidas ?? 0,
    marcada_nao_lida: l.marcada_nao_lida === true,
  };
}

/** As minhas conversas, uma por pessoa, da mais recente (null: não deu para ler). */
export const conversasPorPessoa = cache(async (): Promise<ConversaPessoa[] | null> => {
  if (MODO_DEMO) return [];
  const { data, error } = await (await criarClienteServidor()).rpc("conversas_por_pessoa", {});
  if (error) {
    console.error(`Publike: falha ao ler suas conversas: ${error.message}`);
    return null;
  }
  return (data ?? []).map(lerConversa);
});

/**
 * A conversa com uma conta, com as últimas 300 mensagens (das vagas e da conexão, juntas), e se eu vejo o "lida"
 * (a confirmação de leitura da minha conta). null: não há match nem conexão com ela; undefined: não deu para ler.
 */
export async function conversaCom(
  outroId: string,
): Promise<
  { conversa: ConversaPessoa; conversaId: string; mensagens: MensagemConversa[]; verLida: boolean } | null | undefined
> {
  if (MODO_DEMO || !UUID.test(outroId)) return null;
  const supabase = await criarClienteServidor();
  const [lista, aberta, leitura] = await Promise.all([
    supabase.rpc("conversas_por_pessoa", { p_outro: outroId }),
    supabase.rpc("abrir_conversa_com", { p_outro: outroId }),
    supabase.rpc("minha_confirmacao_de_leitura"),
  ]);
  if (lista.error || aberta.error) {
    console.error(`Publike: falha ao abrir a conversa: ${(lista.error ?? aberta.error)?.message}`);
    return undefined;
  }
  const linha = lista.data?.[0];
  const conversaId = aberta.data;
  if (!linha || !conversaId) return null;
  const { data, error } = await supabase
    .from("mensagens")
    .select(COLUNAS_DA_MENSAGEM)
    .eq("conversa_id", conversaId)
    .order("criado_em", { ascending: false })
    .order("id", { ascending: false })
    .limit(300);
  if (error) {
    console.error(`Publike: falha ao ler a conversa: ${error.message}`);
    return undefined;
  }
  // com a confirmação de leitura desligada (sem a migração 20270205120000, vale ligada), as minhas mensagens
  // não mostram o "lida" (nem o que já tinha aparecido antes): quem desliga também não vê o dos outros
  const verLida = leitura.error ? true : leitura.data !== false;
  const mensagens = (data ?? [])
    .reverse()
    .map((m) => (verLida || m.autor_id === linha.outro_id ? m : { ...m, lida_em: null }));
  return { conversa: lerConversa(linha), conversaId, mensagens, verLida };
}
