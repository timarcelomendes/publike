import "server-only";
import { FORMATO_DA_ENTRADA, origemValida } from "@/lib/origem";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export type OrigemDaConta = {
  /** a campanha do link ("google:servicos") */
  origem?: string | null;
  /** de onde chegou sem campanha ("busca:google", "direto"), desde 18/11/2026 */
  chegada?: string | null;
  /** o caminho da página de entrada ("/vagas/goiania/frentista") */
  entrada?: string | null;
};

/**
 * Logo depois de entrar (celular, e-mail ou Google): o banco anota de onde a conta nova veio, a campanha do link e,
 * sem ela também, o canal da chegada e a página de entrada (claude/plano-organico.md). O banco só conta conta nova
 * (criada nas últimas 2 horas) e vale a primeira; quem já tinha conta e clicou no anúncio não vira cadastro da
 * campanha. Se falhar, a pessoa segue do mesmo jeito: a conta só fica sem origem.
 */
export async function registrarOrigemDaConta({ origem, chegada, entrada }: OrigemDaConta) {
  const p_origem = origemValida(origem) ? origem : null;
  const p_chegada = origemValida(chegada) ? chegada : null;
  const p_entrada = entrada && FORMATO_DA_ENTRADA.test(entrada) ? entrada : null;
  if (!p_origem && !p_chegada) return;
  try {
    const supabase = await criarClienteServidor();
    let { error } = await supabase.rpc("registrar_origem", { p_origem, p_chegada, p_entrada });
    // o banco ainda sem a migração 20270802120000 (só a campanha): anota como antes
    if (error?.code === "PGRST202" && p_origem) ({ error } = await supabase.rpc("registrar_origem", { p_origem }));
    else if (error?.code === "PGRST202") error = null;
    if (error) console.error(`Publike: não deu para anotar a origem da conta: ${error.message}`);
  } catch (e) {
    console.error("Publike: não deu para anotar a origem da conta:", e);
  }
}
