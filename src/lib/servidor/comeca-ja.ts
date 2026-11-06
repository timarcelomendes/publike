import "server-only";
import { MODO_DEMO } from "@/lib/config";
import type { ClienteBanco } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

// "Começa já" (migração 20261212120000_comeca_ja.sql): a vaga precisa de alguém para começar logo. O site
// funciona mesmo antes da migração: sem a coluna, a vaga salva sem a marca e nenhuma vaga tem a etiqueta.

type ErroBanco = { code?: string; message?: string } | null | undefined;

/** O banco ainda não tem a coluna: o PostgREST responde PGRST204 (ao gravar) ou 42703 (ao ler). */
export function faltaColuna(erro: ErroBanco, coluna: string) {
  return Boolean(erro && (erro.code === "PGRST204" || erro.code === "42703") && (erro.message ?? "").includes(coluna));
}

/**
 * Grava a vaga (publicar, editar, a correção da equipe). Sem a coluna `comeca_ja` (ou `contato_por`) no banco,
 * grava de novo sem ela: a vaga sai do mesmo jeito, só sem o "Começa já" (ou sem a escolha "só pelo chat", e fica
 * com o chat e o WhatsApp, como antes da migração 20270221120000).
 */
export async function gravarVaga<
  R extends { comeca_ja?: boolean; contato_por?: string },
  T extends { error: ErroBanco },
>(registro: R, gravar: (r: R) => PromiseLike<T>): Promise<T> {
  let r = await gravar(registro);
  const sem = { ...registro };
  for (let i = 0; i < 2; i++) {
    if (sem.comeca_ja !== undefined && faltaColuna(r.error, "comeca_ja")) {
      console.warn("Publike: falta a migração 20261212 (comeca_ja); a vaga salvou sem o “Começa já”.");
      delete sem.comeca_ja;
    } else if (sem.contato_por !== undefined && faltaColuna(r.error, "contato_por")) {
      console.warn("Publike: falta a migração 20270221 (contato_por); a vaga salvou com o chat e o WhatsApp.");
      delete sem.contato_por;
    } else return r;
    r = await gravar(sem);
  }
  return r;
}

/**
 * Se a vaga está marcada como "Começa já" (false sem a coluna ou sem a vaga). A equipe passa o cliente dela,
 * que lê também a vaga em análise.
 */
export async function comecaJaDaVaga(id: string, cliente?: ClienteBanco): Promise<boolean> {
  if (MODO_DEMO || !UUID.test(id)) return false;
  const supabase = cliente ?? (await criarClienteServidor());
  const { data, error } = await supabase.from("anuncios").select("comeca_ja").eq("id", id).maybeSingle();
  if (error && !faltaColuna(error, "comeca_ja"))
    console.warn(`Publike: não deu para ler o “Começa já”: ${error.message}`);
  return Boolean(data?.comeca_ja);
}
