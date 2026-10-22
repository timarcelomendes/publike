import "server-only";
import { origemValida } from "@/lib/origem";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/**
 * Logo depois de entrar (celular, e-mail ou Google): se a pessoa chegou por uma campanha, o banco
 * anota de qual. O banco só conta conta nova (criada nas últimas 2 horas) e vale a primeira; quem
 * já tinha conta e clicou no anúncio não vira cadastro da campanha. Se falhar, a pessoa segue do
 * mesmo jeito: a conta só fica sem campanha.
 */
export async function registrarOrigemDaConta(origem: string | null | undefined) {
  if (!origemValida(origem)) return;
  try {
    const { error } = await (await criarClienteServidor()).rpc("registrar_origem", { p_origem: origem });
    if (error) console.error(`Publike: não deu para anotar a campanha da conta: ${error.message}`);
  } catch (e) {
    console.error("Publike: não deu para anotar a campanha da conta:", e);
  }
}
