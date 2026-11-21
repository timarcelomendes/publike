"use server";

import { randomInt } from "node:crypto";
import { refresh } from "next/cache";
import { LOGIN_CELULAR, MODO_DEMO } from "@/lib/config";
import { formatarTelefone } from "@/lib/formato";
import { impressaoDoCodigoDeLigar, MARCA_DO_CODIGO_DE_LIGAR, textoDoCodigoDeLigar } from "@/lib/servidor/codigo-whatsapp";
import { acessoFila } from "@/lib/servidor/filas";
import { configMeta, enviarTexto } from "@/lib/servidor/whatsapp";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { telefoneDoLogin } from "@/lib/telefone-login";
import { MANDE_UM_OI } from "@/lib/whatsapp-oficial";

// Meu perfil › Entrar também pelo WhatsApp (20/11/2026; migração 20270818120000). Quem entra com o e-mail liga o
// WhatsApp ao login com um código do Publike (não o "phone_change" do Supabase Auth, que o gancho recusa): o código vai
// pela conversa (só na janela de 24 horas), o banco guarda só a impressão dele, e o número certo vira o celular do
// login. A pessoa é sempre a da sessão conferida no Auth (getUser), nunca um id que vem do navegador.

export type ResultadoWhatsappDeAcesso =
  | { ok: true; numero?: string }
  | { ok: false; erro: string; mandarOi?: boolean; restam?: number };

const ERROS: Record<string, string> = {
  numero_invalido: "Confira o número, com DDD. Ex.: (62) 99999-0000.",
  // a conta da equipe do Publike ou da moderação (e a suspensa ou apagada) entra só com o e-mail
  conta_invalida: "Esta conta não pode entrar pelo WhatsApp: entre com o e-mail.",
  ja_tem: "Esta conta já tem um WhatsApp vinculado.",
  ja_tem_outro: "Esta conta já tem outro WhatsApp vinculado.",
  numero_em_uso: "Esse WhatsApp já está vinculado a outra conta do Publike. Se ela é sua, entre por ela.",
  muitos_pedidos: "Muitos códigos pedidos seguidos. Espere uma hora e tente de novo.",
  fora_da_janela: MANDE_UM_OI,
  codigo_vencido: "O código venceu. Peça um novo.",
  codigo_errado: "Código errado. Confira e tente de novo.",
  muitas_tentativas: "Muitas tentativas erradas. Peça um código novo.",
  sem_email: "Para desvincular, a conta precisa entrar também com um e-mail confirmado.",
};

const DESLIGADO = "O entrar pelo WhatsApp não está ligado agora.";

/** A pessoa da sessão, conferida no Auth. */
async function quemEsta() {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.auth.getUser();
  return error || !data.user ? null : data.user;
}

/** Manda o código de ligar para o WhatsApp digitado. */
export async function pedirCodigoParaLigar(numero: string): Promise<ResultadoWhatsappDeAcesso> {
  if (MODO_DEMO || !LOGIN_CELULAR) return { ok: false, erro: DESLIGADO };
  const usuario = await quemEsta();
  if (!usuario) return { ok: false, erro: "Sua sessão acabou. Entre de novo e tente." };
  if (usuario.phone) return { ok: false, erro: ERROS.ja_tem };
  const telefone = telefoneDoLogin(typeof numero === "string" ? numero : "");
  if (!telefone) return { ok: false, erro: ERROS.numero_invalido };
  const acesso = acessoFila();
  const cfg = configMeta();
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const hash = impressaoDoCodigoDeLigar(usuario.id, telefone, codigo);
  if (!acesso || !cfg || !hash) return { ok: false, erro: DESLIGADO };
  const { data, error } = await acesso.cliente.rpc("servidor_whatsapp_ligacao_pedir", {
    p_chave: acesso.chave,
    p_usuario: usuario.id,
    p_numero: telefone,
    p_hash: hash,
  });
  if (error) return { ok: false, erro: "Não deu para pedir o código agora. Tente de novo em instantes." };
  const r = data as { ok: boolean; erro?: string; conversa?: string; numero?: string };
  if (!r.ok || !r.conversa || !r.numero) {
    const erro = r.erro ?? "";
    return { ok: false, erro: ERROS[erro] ?? "Não deu para pedir o código agora.", mandarOi: erro === "fora_da_janela" };
  }
  const envio = await enviarTexto(cfg, r.numero, textoDoCodigoDeLigar(codigo));
  if (!envio.ok) {
    console.error("Publike: o código de ligar o WhatsApp não saiu:", envio.erro);
    return { ok: false, erro: "O WhatsApp não mandou o código agora. Tente de novo em instantes." };
  }
  await acesso.cliente.rpc("servidor_whatsapp_conversa_saida", {
    p_chave: acesso.chave,
    p_conversa: r.conversa,
    p_texto: MARCA_DO_CODIGO_DE_LIGAR,
    p_wamid: envio.wamid,
  });
  return { ok: true, numero: formatarTelefone(telefone) };
}

/** Confere o código e liga o WhatsApp ao login da conta. */
export async function confirmarCodigoParaLigar(numero: string, codigo: string): Promise<ResultadoWhatsappDeAcesso> {
  if (MODO_DEMO || !LOGIN_CELULAR) return { ok: false, erro: DESLIGADO };
  const usuario = await quemEsta();
  if (!usuario) return { ok: false, erro: "Sua sessão acabou. Entre de novo e tente." };
  const telefone = telefoneDoLogin(typeof numero === "string" ? numero : "");
  if (!telefone) return { ok: false, erro: ERROS.numero_invalido };
  const digitos = (typeof codigo === "string" ? codigo : "").replace(/\D/g, "");
  if (digitos.length !== 6) return { ok: false, erro: "O código tem 6 números." };
  const acesso = acessoFila();
  const hash = impressaoDoCodigoDeLigar(usuario.id, telefone, digitos);
  if (!acesso || !hash) return { ok: false, erro: DESLIGADO };
  const { data, error } = await acesso.cliente.rpc("servidor_whatsapp_ligacao_conferir", {
    p_chave: acesso.chave,
    p_usuario: usuario.id,
    p_numero: telefone,
    p_hash: hash,
  });
  if (error) return { ok: false, erro: "Não deu para conferir o código agora. Tente de novo em instantes." };
  const r = data as { ok: boolean; erro?: string | null; restam?: number };
  if (!r.ok) {
    const erro = r.erro ?? "";
    return {
      ok: false,
      erro:
        erro === "codigo_errado" && typeof r.restam === "number"
          ? `Código errado. ${r.restam === 1 ? "Resta 1 tentativa" : `Restam ${r.restam} tentativas`}.`
          : (ERROS[erro] ?? "Não deu para vincular agora."),
      restam: r.restam,
    };
  }
  refresh();
  return { ok: true, numero: formatarTelefone(telefone) };
}

/** Desliga o WhatsApp do login (só quem também entra com o e-mail confirmado). */
export async function desligarWhatsappDoLogin(): Promise<ResultadoWhatsappDeAcesso> {
  if (MODO_DEMO || !LOGIN_CELULAR) return { ok: false, erro: DESLIGADO };
  const usuario = await quemEsta();
  if (!usuario) return { ok: false, erro: "Sua sessão acabou. Entre de novo e tente." };
  const acesso = acessoFila();
  if (!acesso) return { ok: false, erro: DESLIGADO };
  const { data, error } = await acesso.cliente.rpc("servidor_whatsapp_login_desligar", {
    p_chave: acesso.chave,
    p_usuario: usuario.id,
  });
  if (error) return { ok: false, erro: "Não deu para desvincular agora. Tente de novo em instantes." };
  if (data === "sem_email") return { ok: false, erro: ERROS.sem_email };
  refresh();
  return { ok: true };
}
