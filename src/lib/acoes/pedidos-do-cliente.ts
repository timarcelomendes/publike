"use server";

import { after } from "next/server";
import { refresh } from "next/cache";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { MAX_CAMPOS, TOKEN_CLIENTE } from "@/lib/pedidos-do-cliente";
import { processarFilas } from "@/lib/servidor/filas";
import { dentroDoLimite, embaralhar, enderecoDeQuemPediu } from "@/lib/servidor/limite";
import { lerLinkDoCliente, type LinkDoCliente } from "@/lib/servidor/pedidos-do-cliente";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { EstadoForm, Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// O cliente da agência pede a vaga e acompanha o prazo (migração 20270307120000). O link do cliente funciona sem
// login: o token é a chave, e o banco confere tudo de novo (link ligado, até 10 pedidos por dia).

const SEM_MIGRACAO = "Os pedidos dos clientes ainda não estão disponíveis. Tente de novo mais tarde.";

function campo(formData: FormData, nome: string, max: number) {
  const v = String(formData.get(nome) ?? "")
    .replace(/[ \t]+/g, " ")
    .trim();
  return v ? v.slice(0, max) : null;
}

/** O cliente pede uma vaga pelo link. */
export async function pedirVagaPeloLink(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const token = String(formData.get("token") ?? "");
  if (!TOKEN_CLIENTE.test(token)) return { ok: false, erro: "Este link não vale. Peça um novo à agência." };
  if (!dentroDoLimite(`pedido:${embaralhar(await enderecoDeQuemPediu())}`, 20, 60 * 60_000)) {
    return { ok: false, erro: "Muitos pedidos em pouco tempo. Tente de novo daqui a pouco." };
  }
  const cargo = campo(formData, "cargo", MAX_CAMPOS.cargo);
  const erros: Record<string, string> = {};
  if (!cargo || cargo.length < 3) erros.cargo = "Escreva o cargo da vaga.";
  const quantidade = Number(formData.get("quantidade") ?? 1);
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 99) erros.quantidade = "De 1 a 99 pessoas.";
  const paraQuando = String(formData.get("para_quando") ?? "");
  if (paraQuando && !/^\d{4}-\d{2}-\d{2}$/.test(paraQuando)) erros.para_quando = "Escolha a data no calendário.";
  if (Object.keys(erros).length) return { ok: false, erro: "Confira os campos marcados.", erros };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("portal_pedir_vaga", {
    p_token: token,
    p_cargo: cargo!,
    p_quantidade: quantidade,
    p_salario: campo(formData, "salario", MAX_CAMPOS.salario),
    p_horario: campo(formData, "horario", MAX_CAMPOS.horario),
    p_local: campo(formData, "local", MAX_CAMPOS.local),
    p_requisitos: campo(formData, "requisitos", MAX_CAMPOS.requisitos),
    p_para_quando: paraQuando || null,
    p_observacoes: campo(formData, "observacoes", MAX_CAMPOS.observacoes),
    p_quem: campo(formData, "quem", MAX_CAMPOS.quem),
  });
  if (error) {
    return { ok: false, erro: error.code === "PGRST202" ? SEM_MIGRACAO : mensagemDeErro(error, "Não deu para mandar o pedido agora.") };
  }
  after(processarFilas);
  refresh();
  return { ok: true, mensagem: "Pedido enviado. A agência recebe agora e responde por aqui." };
}

/** O cliente cancela um pedido que ainda não terminou. */
export async function cancelarPedidoPeloLink(token: string, pedido: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!TOKEN_CLIENTE.test(token) || !UUID.test(pedido)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await (await criarClienteServidor()).rpc("portal_cancelar_pedido", { p_token: token, p_pedido: pedido });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para cancelar agora.") };
  after(processarFilas);
  refresh();
  return { ok: true, mensagem: "Pedido cancelado. A agência fica sabendo." };
}

export type AcaoDoPedido = "aceitar" | "recusar" | "prazo" | "ligar" | "finalistas" | "concluir" | "cancelar" | "reabrir";
const ACOES: AcaoDoPedido[] = ["aceitar", "recusar", "prazo", "ligar", "finalistas", "concluir", "cancelar", "reabrir"];

const MENSAGEM: Record<AcaoDoPedido, string> = {
  aceitar: "Pedido aceito. O cliente vê o prazo no link.",
  recusar: "Pedido recusado. O cliente vê o motivo no link.",
  prazo: "Prazo mudado.",
  ligar: "Vaga ligada ao pedido.",
  finalistas: "Marcado: finalistas enviados.",
  concluir: "Pedido concluído.",
  cancelar: "Pedido cancelado.",
  reabrir: "Pedido aberto de novo.",
};

/** A agência responde o pedido: aceitar (com o prazo), recusar (com o motivo), mudar o prazo, ligar a vaga… */
export async function responderPedido(
  pedido: string,
  acao: AcaoDoPedido,
  extra: { data?: string | null; motivo?: string | null; anuncio?: string | null } = {},
): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(pedido) || !ACOES.includes(acao)) return { ok: false, erro: "Pedido inválido." };
  if (extra.data && !/^\d{4}-\d{2}-\d{2}$/.test(extra.data)) return { ok: false, erro: "Escolha a data no calendário." };
  if (extra.anuncio && !UUID.test(extra.anuncio)) return { ok: false, erro: "Vaga não encontrada." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/painel/pedidos" };
  const { error } = await (await criarClienteServidor()).rpc("responder_pedido", {
    p_pedido: pedido,
    p_acao: acao,
    p_data: extra.data || null,
    p_motivo: extra.motivo?.trim().slice(0, 300) || null,
    p_anuncio: extra.anuncio || null,
  });
  if (error) {
    return { ok: false, erro: error.code === "PGRST202" ? SEM_MIGRACAO : mensagemDeErro(error, "Não deu para salvar agora.") };
  }
  refresh();
  return { ok: true, mensagem: MENSAGEM[acao] };
}

/** O link do cliente: trocar (o antigo para de valer), ligar ou desligar. */
export async function mudarLinkDoCliente(
  cliente: string,
  acao: "trocar" | "ligar" | "desligar",
): Promise<{ ok: true; link: LinkDoCliente; mensagem: string } | { ok: false; erro: string }> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(cliente) || !["trocar", "ligar", "desligar"].includes(acao)) return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta." };
  const { data, error } = await (await criarClienteServidor()).rpc("link_do_cliente", { p_cliente: cliente, p_acao: acao });
  const link = lerLinkDoCliente(data);
  if (error || !link) return { ok: false, erro: error?.code === "PGRST202" ? SEM_MIGRACAO : mensagemDeErro(error, "Não deu agora.") };
  refresh();
  return {
    ok: true,
    link,
    mensagem:
      acao === "trocar"
        ? "Link novo pronto. O antigo parou de valer: mande o novo ao cliente."
        : acao === "desligar"
          ? "Link desligado: o cliente não abre mais."
          : "Link ligado de novo.",
  };
}
