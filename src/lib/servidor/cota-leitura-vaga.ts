import "server-only";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { MODELO_PADRAO } from "@/lib/ia/openai";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import { criarClienteServidor, criarClientePublico } from "@/lib/supabase/servidor";
import { acessoFila } from "./filas";
import { dentroDoLimite, embaralhar, enderecoDeQuemPediu } from "./limite";

// A cota da leitura da vaga pela IA (a foto e o texto colado, no passo 1 do publicar). Com conta: a cota da ajuda
// da IA da conta (o admin, no computador dele, não gasta). Sem conta (migração 20270126120000): por endereço de
// internet e por dia, com um teto do dia para todos os visitantes juntos; o login só é pedido ao publicar.

/** Leituras por dia de quem ainda não entrou (por endereço de internet). */
export const LEITURAS_SEM_CONTA = 5;
/** Leituras por dia de todos os visitantes juntos. */
const TETO_SEM_CONTA = 300;

export const ACABOU_SEM_CONTA = `Você já usou a leitura da IA ${LEITURAS_SEM_CONTA} vezes hoje sem conta. Entre na sua conta para continuar, ou preencha a vaga à mão.`;

/** Conta este uso e diz o modelo da IA; ou o erro para a tela. */
export async function usarLeituraDaVaga(): Promise<{ modelo: string } | { erro: string }> {
  const usuario = await obterUsuario();
  if (usuario) {
    const admin = await clienteAdminOuNulo();
    if (admin) {
      const { data } = await admin.rpc("admin_config");
      return { modelo: data?.[0]?.ia_modelo ?? MODELO_PADRAO };
    }
    const supabase = await criarClienteServidor();
    const { error } = await supabase.rpc("usar_ia_texto");
    if (error) return { erro: mensagemDeErro(error) };
    const { data } = await supabase.rpc("config_publica");
    return { modelo: data?.[0]?.ia_modelo ?? MODELO_PADRAO };
  }

  const quem = `ip:${embaralhar(await enderecoDeQuemPediu())}`;
  // rajada: no máximo 3 por minuto (na memória); por dia, quem conta é o banco
  if (!dentroDoLimite(`leitura-vaga:${quem}`, 3, 60_000))
    return { erro: "Muitas leituras seguidas. Espere um minutinho e tente de novo." };
  // sem contar o uso no banco, a IA não lê: o gasto nunca fica sem limite
  const acesso = acessoFila();
  if (!acesso) return { erro: "Entre na sua conta para usar a leitura da IA." };
  const { data: pode, error } = await acesso.cliente.rpc("servidor_usar_ia_visitante", {
    p_chave: acesso.chave,
    p_quem: quem,
    p_limite: LEITURAS_SEM_CONTA,
    p_teto: TETO_SEM_CONTA,
  });
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: não deu para contar a leitura sem conta:", error.message);
    // no computador, o motivo de verdade (sem a migração, quem não entrou não usa a IA)
    if (error.code === "PGRST202" && process.env.NODE_ENV !== "production")
      return { erro: "Falta rodar a migração 20270126120000_ia_sem_conta.sql no banco para ler sem conta." };
    return { erro: "Entre na sua conta para usar a leitura da IA." };
  }
  if (pode !== true) return { erro: ACABOU_SEM_CONTA };
  const { data } = await criarClientePublico().rpc("config_publica");
  return { modelo: data?.[0]?.ia_modelo ?? MODELO_PADRAO };
}
