import "server-only";
import { cookies } from "next/headers";
import { after } from "next/server";
import { VERSAO_TERMOS } from "@/lib/constantes";
import { COOKIE_NOME_INDICACAO, nomeParaPerfil } from "@/lib/indicacao-email";
import { COOKIE_INTENCAO, lerIntencao } from "@/lib/intencao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { temContato } from "@/lib/validacao";
import { marcarConversao } from "./conversao";
import { processarFilas } from "./filas";

// O perfil que nasce sozinho (07/11/2026, pedido do Marcelo depois de medir: em 30 dias, 34 contas do Google e do
// LinkedIn entraram e pararam no "completar cadastro"; quem completa leva 1 minuto, quem desiste sai na hora e quase
// ninguém volta). Quem entra pelo Google, LinkedIn ou Facebook procurando trabalho já tem o nome e o e-mail na conta
// da rede: o perfil nasce com eles, como "pessoa" em Goiânia, sem bairro e sem WhatsApp (pedidos depois, quando
// fazem falta). O aceite das regras e da política é o "Ao entrar, você aceita…" do botão da rede (decidido com o
// Marcelo) e fica registrado como sempre. Quem vai contratar (publicar vaga, a página de empresas, a resposta
// "Procuro funcionário") e os caminhos com jornada própria (equipe, convites, serviços) seguem para o cadastro de
// sempre.
// Também nasce sozinho o perfil de quem entrou pelo link de uma vaga indicada por e-mail (/indicacao/<código>,
// 09/11/2026): com o link de entrar no e-mail, vale o nome que a pessoa escreveu na página da indicação (o aceite é
// o "Ao entrar, você aceita…" da mesma página).

const REDES = new Set(["google", "linkedin_oidc", "facebook"]);

/** Os caminhos de quem vai contratar ou tem uma jornada própria: passam pelo cadastro completo. */
const COM_CADASTRO = ["/publicar", "/empresas", "/painel/servicos", "/equipe", "/convite", "/finalistas", "/proposta"];

/** O nome que veio da rede, se der para usar como está (2 a 80 letras, sem telefone, e-mail ou link). */
function nomeDaRede(meta: Record<string, unknown>) {
  const juntos = [meta.given_name, meta.family_name].filter((x) => typeof x === "string" && x.trim()).join(" ");
  const nome = [meta.full_name, meta.name, juntos].find((x): x is string => typeof x === "string" && x.trim().length > 0);
  const limpo = nome?.replace(/\s+/g, " ").trim().slice(0, 80) ?? "";
  return limpo.length >= 2 && !temContato(limpo) ? limpo : null;
}

/** O nome guardado na página da indicação (o cookie vem codificado). */
function lerNome(valor: string | undefined) {
  try {
    return valor ? decodeURIComponent(valor) : null;
  } catch {
    return null;
  }
}

/**
 * Cria o perfil de quem acabou de entrar pela rede e ainda não tem um. true: criou (a pessoa segue direto para onde
 * ia); false: não deu ou não é o caso (segue para o "completar cadastro", como antes).
 */
export async function criarPerfilSozinho(destino: string): Promise<boolean> {
  if (COM_CADASTRO.some((c) => destino === c || destino.startsWith(`${c}/`) || destino.startsWith(`${c}?`))) return false;
  const pote = await cookies();
  const intencao = lerIntencao(pote.get(COOKIE_INTENCAO)?.value);
  if (intencao === "contratar_pessoa") return false;

  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const provedor = String(user.app_metadata?.provider ?? "");
  const pelaIndicacao = provedor === "email" && destino.startsWith("/indicacao/");
  if (!REDES.has(provedor) && !pelaIndicacao) return false;
  const nome = REDES.has(provedor)
    ? nomeDaRede(user.user_metadata ?? {})
    : nomeParaPerfil(lerNome(pote.get(COOKIE_NOME_INDICACAO)?.value));
  const email = user.email?.trim().toLowerCase() ?? "";
  if (!nome || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return false;

  const { error } = await supabase.rpc("salvar_perfil", {
    p_nome: nome,
    p_tipo: "pessoa",
    p_cidade: "Goiânia",
    p_bairro: null,
    p_sobre: null,
    p_servicos: [],
    p_foto: null,
    p_whatsapp: null,
    p_email: email,
    p_receber_emails: true,
    p_cnpj: null,
  });
  if (error) {
    console.error(`Publike: o perfil não nasceu sozinho (segue para o cadastro): ${error.message}`);
    return false;
  }
  // o que a conta faz: procurar trabalho (ou oferecer serviços, para quem respondeu isso na página inicial)
  await supabase.rpc("salvar_meus_modos", { p_modos: [intencao === "oferecer_servico" ? "servicos" : "trabalhar"] });
  // o aceite das regras e da política (o "Ao entrar, você aceita…" do botão): o mesmo registro do cadastro
  let { error: erroAceite } = await supabase.rpc("registrar_aceite", { p_versao: VERSAO_TERMOS });
  if (erroAceite) ({ error: erroAceite } = await supabase.rpc("registrar_aceite", { p_versao: VERSAO_TERMOS }));
  // sem o registro, o site pede o aceite no próximo acesso (o mesmo das contas criadas pela equipe)
  if (erroAceite) console.error(`Publike: não deu para registrar o aceite do perfil que nasceu sozinho: ${erroAceite.message}`);
  // como no cadastro: a conta nova vale para a campanha e a equipe recebe o "Novo cadastro"
  await marcarConversao("cadastro");
  after(processarFilas);
  return true;
}
