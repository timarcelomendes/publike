import "server-only";
import { cache } from "react";
import { MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { lerModos, modoPadrao, MODOS, modosDoTipo, type ModoPainel } from "@/lib/modo-painel";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { obterIntencao } from "./intencao";

/** Os modos guardados no banco e se o banco já tem as funções (a migração dos modos rodou). */
const lerModosDoBanco = cache(async (): Promise<{ existe: boolean; modos: ModoPainel[] | null }> => {
  if (MODO_DEMO || !(await obterUsuario())) return { existe: false, modos: null };
  const { data, error } = await (await criarClienteServidor()).rpc("meus_modos");
  if (error) {
    // PGRST202: a função ainda não existe (migração por rodar): segue como antes
    if (error.code !== "PGRST202") console.error(`Publike: falha ao ler os modos da conta: ${error.message}`);
    return { existe: error.code !== "PGRST202", modos: null };
  }
  const modos = lerModos(data);
  return { existe: true, modos: modos.length ? modos : null };
});

/**
 * O que a conta marcou em "O que você quer fazer no Publike?" (Procurar trabalho, Oferecer
 * serviços, Contratar). `null`: ainda não marcou (conta nova) ou o banco ainda sem a migração.
 */
export const modosMarcados = cache(async (): Promise<ModoPainel[] | null> => (await lerModosDoBanco()).modos);

/** O banco já guarda os modos (sem a migração, a pergunta não aparece no perfil). */
export const modosNoBanco = cache(async (): Promise<boolean> => (await lerModosDoBanco()).existe);

/**
 * Os modos que a conta usa: os marcados no perfil; sem marcação (ou sem a migração), os três,
 * como antes.
 */
export const modosDaConta = cache(
  async (): Promise<ModoPainel[]> => (await modosMarcados()) ?? MODOS.map((m) => m.valor),
);

/**
 * A atividade principal da conta (Contratar, Trabalhar ou Serviços): a do tipo de conta e do que a
 * pessoa disse que quer fazer, se ela marcou essa; senão, a primeira que marcou. Fixa: não se troca
 * na tela (o painel mostra todas as atividades juntas; o Início é o mesmo feed para todos). Decide a
 * página Hoje e a segunda aba da barra de baixo no celular.
 */
export async function modoDaConta(): Promise<ModoPainel> {
  const [perfil, intencao, modos] = await Promise.all([
    obterMeuPerfil().catch(() => null),
    obterIntencao().catch(() => null),
    modosDaConta(),
  ]);
  const padrao = modoPadrao(perfil?.tipo, intencao);
  return modos.includes(padrao) ? padrao : (modos[0] ?? padrao);
}

/**
 * As atividades que aparecem no menu do painel, a principal primeiro: as que a conta marcou (só as
 * que o tipo de conta permite). Sem marcação, só a principal (antes, as três ficavam para trocar).
 */
export async function atividadesDoMenu(): Promise<ModoPainel[]> {
  const [perfil, marcados, principal] = await Promise.all([
    obterMeuPerfil().catch(() => null),
    modosMarcados(),
    modoDaConta(),
  ]);
  const doTipo = modosDoTipo(perfil?.tipo);
  const lista = (marcados ?? [principal]).filter((m) => doTipo.includes(m));
  return [principal, ...lista.filter((m) => m !== principal)];
}
