import "server-only";
import { cookies } from "next/headers";
import { after } from "next/server";
import { obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { COOKIE_INTENCAO, lerIntencao, type Intencao } from "@/lib/intencao";
import { soOlharComoPessoa } from "@/lib/servidor/so-olhar";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/**
 * O que a pessoa disse que quer fazer no Publike.
 * Logada: a resposta guardada na conta. Sem login: a desta visita (cookie de sessão).
 */
export async function obterIntencao(): Promise<Intencao | null> {
  const intencao = await intencaoGuardada();
  // empresa, comércio e agência não procuram trabalho (uma resposta antiga, de antes de criar a conta,
  // ou do cookie da visita): para elas, vale "procuro funcionário". No "só olhar", vê como pessoa.
  if (intencao === "trabalho" || intencao === "talento") {
    const perfil = await obterMeuPerfil().catch(() => null);
    if (perfil && perfil.tipo !== "pessoa" && !(await soOlharComoPessoa())) return "contratar_pessoa";
  }
  return intencao;
}

async function intencaoGuardada(): Promise<Intencao | null> {
  const doCookie = lerIntencao((await cookies()).get(COOKIE_INTENCAO)?.value);
  const usuario = await obterUsuario();
  if (!usuario) return doCookie;

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("minha_intencao");
  if (error) {
    console.error(`Publike: falha ao ler a intenção: ${error.message}`);
    return doCookie;
  }
  const daConta = lerIntencao(data ?? undefined);
  if (daConta) return daConta;
  // respondeu antes de entrar: passa a resposta para a conta
  if (doCookie) {
    after(async () => {
      const { error: e } = await supabase.rpc("salvar_intencao", { p_intencao: doCookie });
      if (e) console.error(`Publike: falha ao guardar a intenção: ${e.message}`);
    });
  }
  return doCookie;
}
