"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { ehPapelEquipe, TOKEN_EQUIPE } from "@/lib/equipe";
import { mensagemDeErro } from "@/lib/erros";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// Equipe da agência: trocar a conta pela qual se age, convidar, entrar, mudar o papel, tirar e
// sair. As regras ficam no banco (escolher_conta, aceitar_convite_equipe…).

const SEM_GANCHO = "A troca de conta ainda não está ligada no Publike. Avise o suporte.";

/** A conta que o token novo traz (o gancho do Auth põe "conta" quando a pessoa age pela agência). */
function contaDoToken(token: string | undefined): string | null {
  try {
    const corpo = JSON.parse(Buffer.from((token ?? "").split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof corpo?.conta === "string" ? corpo.conta : null;
  } catch {
    return null;
  }
}

/** Renova o token (para trazer a conta escolhida) e devolve a conta que veio nele. */
async function renovarSessao(supabase: Awaited<ReturnType<typeof criarClienteServidor>>) {
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session) return { ok: false as const };
  return { ok: true as const, conta: contaDoToken(data.session.access_token) };
}

/** Troca a conta pela qual a pessoa age: a da agência (sendo da equipe) ou a própria. */
export async function trocarConta(contaId: string | null): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (contaId !== null && !UUID.test(contaId)) return { ok: false, erro: "Conta não encontrada." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=%2Fpainel" };
  const alvo = contaId === usuario.pessoaId ? null : contaId;
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("escolher_conta", { p_conta: alvo });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  const sessao = await renovarSessao(supabase);
  if (!sessao.ok) return { ok: false, erro: "Não deu para trocar agora. Entre de novo.", ir: "/entrar?next=%2Fpainel" };
  if (sessao.conta !== alvo) {
    // o gancho do Auth não está ligado: a escolha não chega ao token (fica na própria conta)
    if (alvo) await supabase.rpc("escolher_conta", { p_conta: null });
    return { ok: false, erro: SEM_GANCHO };
  }
  return { ok: true };
}

export type ConviteEquipeCriado =
  { ok: true; token: string; expira_em: string } | { ok: false; erro: string; campo?: "nome" | "papel" };

export async function criarConviteEquipe(papel: string, nome: string): Promise<ConviteEquipeCriado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!ehPapelEquipe(papel))
    return { ok: false, erro: "Escolha o papel: administrador ou recrutador.", campo: "papel" };
  const limpo = typeof nome === "string" ? nome.replace(/\s+/g, " ").trim() : "";
  if (limpo && (limpo.length < 2 || limpo.length > 80)) {
    return { ok: false, erro: "Escreva o nome com 2 a 80 letras (ou deixe em branco).", campo: "nome" };
  }
  const { data, error } = await (
    await criarClienteServidor()
  ).rpc("criar_convite_equipe", { p_papel: papel, p_nome: limpo || null });
  const criado = data?.[0];
  if (error || !criado) {
    return error?.hint === "nome"
      ? { ok: false, erro: mensagemDeErro(error), campo: "nome" }
      : { ok: false, erro: mensagemDeErro(error, "Não deu para criar o convite agora. Tente de novo.") };
  }
  refresh();
  return { ok: true, token: criado.token, expira_em: criado.expira_em };
}

export async function cancelarConviteEquipe(id: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Convite não encontrado." };
  const { error } = await (await criarClienteServidor()).rpc("cancelar_convite_equipe", { p_id: id });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: "Convite cancelado: o link não abre mais." };
}

export type EntradaNaEquipe = { ok: true; agindo: boolean } | { ok: false; erro: string; ir?: string };

/** Entrar na equipe pelo link: a pessoa passa a agir pela agência (o token novo traz a conta). */
export async function aceitarConviteEquipe(token: string): Promise<EntradaNaEquipe> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (typeof token !== "string" || !TOKEN_EQUIPE.test(token)) return { ok: false, erro: "Este link não vale." };
  const usuario = await obterUsuario();
  if (!usuario)
    return { ok: false, erro: "Entre na sua conta.", ir: `/entrar?next=${encodeURIComponent(`/equipe/${token}`)}` };
  const supabase = await criarClienteServidor();
  const { data: agencia, error } = await supabase.rpc("aceitar_convite_equipe", { p_token: token });
  if (error) {
    if (error.hint === "perfil") {
      return {
        ok: false,
        erro: mensagemDeErro(error),
        ir: `/perfil?completar=1&next=${encodeURIComponent(`/equipe/${token}`)}`,
      };
    }
    return { ok: false, erro: mensagemDeErro(error, "Não deu para entrar na equipe agora. Tente de novo.") };
  }
  after(processarFilas);
  const sessao = await renovarSessao(supabase);
  return { ok: true, agindo: sessao.ok && sessao.conta === agencia };
}

export async function mudarPapelEquipe(membroId: string, papel: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(membroId) || !ehPapelEquipe(papel)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await (
    await criarClienteServidor()
  ).rpc("mudar_papel_equipe", { p_membro: membroId, p_papel: papel });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: "Papel trocado." };
}

export async function tirarDaEquipe(membroId: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(membroId)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await (await criarClienteServidor()).rpc("tirar_da_equipe", { p_membro: membroId });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  after(processarFilas);
  refresh();
  return { ok: true, mensagem: "Pronto: a pessoa não age mais pela agência." };
}

/** Sair da equipe (a própria pessoa): volta para a própria conta. */
export async function sairDaEquipe(agenciaId: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(agenciaId)) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("sair_da_equipe", { p_agencia: agenciaId });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  after(processarFilas);
  await renovarSessao(supabase);
  return { ok: true, mensagem: "Você saiu da equipe." };
}
