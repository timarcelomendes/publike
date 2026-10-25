"use server";

import { createHash, randomBytes } from "node:crypto";
import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { LOGO_EMAIL } from "@/lib/email/montar";
import { mensagemDeErro } from "@/lib/erros";
import { ErroIA, iaConfigurada, MODELOS_IA, modeloDaIA } from "@/lib/ia/openai";
import { escreverResumo } from "@/lib/ia/tarefas";
import { apagarArquivosDaPessoa } from "@/lib/servidor/arquivos";
import { prepararLogoEmail } from "@/lib/servidor/logo-email";
import {
  enviarEmailsPendentes,
  processarFilas,
  revisarAnunciosPendentes,
  revisarAvaliacoesPendentes,
  revisarRecadosPendentes,
} from "@/lib/servidor/filas";
import { ehStatusSugestao } from "@/lib/sugestoes";
import { clienteAdminOuNulo, type ClienteBanco } from "@/lib/supabase/admin";
import type { EstadoForm, Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// Ações do admin. Todas conferem antes se o admin está aberto no computador
// do dono (modo dev, PUBLIKE_ADMIN=1, chave secreta e endereço local).

const FORA = "O admin só funciona no seu computador, com o site rodando em modo de desenvolvimento.";
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function texto(formData: FormData, nome: string) {
  const v = formData.get(nome);
  return typeof v === "string" ? v.trim() : "";
}

function marcado(formData: FormData, nome: string) {
  return formData.get(nome) === "on";
}

// ------------------------------------------------------------------ contas

// Duração no formato do Supabase Auth ("604800s"), contada até o fim da
// suspensão. Sem fim (ou já vencida): "none", que libera o login.
function duracaoDoBloqueio(fim: string | null) {
  if (!fim) return "none";
  const segundos = Math.ceil((new Date(fim).getTime() - Date.now()) / 1000);
  return segundos > 0 ? `${segundos}s` : "none";
}

// O banco já bloqueia o login e encerra as sessões. Aqui o bloqueio é
// confirmado pela API do Supabase Auth, o caminho oficial (vale mesmo se o
// banco não tiver permissão para mexer no login).
async function confirmarLogin(c: ClienteBanco, usuarioId: string, fim: string | null) {
  const { error } = await c.auth.admin.updateUserById(usuarioId, { ban_duration: duracaoDoBloqueio(fim) });
  if (error) console.error(`Publike: o Supabase Auth não acertou o login de ${usuarioId}:`, error.message);
  return !error;
}

const LOGIN_FALHOU =
  "O Supabase não confirmou o login. Recarregue a página: se aparecer o aviso do login, use o botão de lá.";

export async function suspenderConta(
  usuarioId: string,
  prazo: "7" | "30" | "sempre",
  motivo: string,
): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(usuarioId) || !["7", "30", "sempre"].includes(prazo)) return { ok: false, erro: "Pedido inválido." };
  const { data: fim, error } = await c.rpc("admin_suspender", {
    p_usuario: usuarioId,
    p_dias: prazo === "sempre" ? null : Number(prazo),
    p_motivo: motivo,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  after(processarFilas);
  revalidatePath("/");
  const loginOk = await confirmarLogin(c, usuarioId, fim);
  refresh();
  if (!loginOk) return { ok: false, erro: `A suspensão foi registrada e os anúncios saíram do ar. ${LOGIN_FALHOU}` };
  return {
    ok: true,
    mensagem: prazo === "sempre" ? "Conta banida. Os anúncios saíram do ar." : `Conta suspensa por ${prazo} dias.`,
  };
}

export async function reativarConta(usuarioId: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(usuarioId)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.rpc("admin_reativar", { p_usuario: usuarioId });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  after(processarFilas);
  revalidatePath("/");
  const loginOk = await confirmarLogin(c, usuarioId, null);
  refresh();
  if (!loginOk) return { ok: false, erro: `A conta foi reativada. ${LOGIN_FALHOU}` };
  return { ok: true, mensagem: "Conta reativada." };
}

/** Quando o login ficou diferente da suspensão (a API do Supabase falhou na hora): acerta pelo que está valendo. */
export async function acertarLogin(usuarioId: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(usuarioId)) return { ok: false, erro: "Pedido inválido." };
  const { data, error } = await c.rpc("admin_usuario", { p_id: usuarioId });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  const ficha = data as { suspensao?: { fim?: string } | null } | null;
  if (!ficha) return { ok: false, erro: "Conta não encontrada." };
  const fim = ficha.suspensao?.fim ?? null;
  if (!(await confirmarLogin(c, usuarioId, fim)))
    return { ok: false, erro: "O Supabase não respondeu. Tente de novo daqui a pouco." };
  refresh();
  return { ok: true, mensagem: fim ? "Login bloqueado." : "Login liberado." };
}

export async function mudarVerificado(usuarioId: string, verificado: boolean): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(usuarioId)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.rpc("admin_verificar", { p_usuario: usuarioId, p_verificado: verificado });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: verificado ? "Selo de verificado ligado." : "Selo de verificado tirado." };
}

export async function excluirContaPeloAdmin(usuarioId: string, motivo: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(usuarioId)) return { ok: false, erro: "Pedido inválido." };
  if (motivo.trim().length < 3) return { ok: false, erro: "Escreva o motivo (fica no registro da equipe)." };
  // Confere antes de apagar a foto: se a exclusão for recusada, a foto fica.
  const { data, error: erroFicha } = await c.rpc("admin_usuario", { p_id: usuarioId });
  if (erroFicha) return { ok: false, erro: mensagemDeErro(erroFicha) };
  const ficha = data as { moderador?: boolean } | null;
  if (!ficha) return { ok: false, erro: "Conta não encontrada." };
  if (ficha.moderador) return { ok: false, erro: "Essa pessoa é moderadora. Tire ela da moderação antes." };
  // As fotos saem antes da conta: o Supabase não apaga uma conta que ainda tem arquivos.
  if (!(await apagarArquivosDaPessoa(c, usuarioId))) {
    return { ok: false, erro: "Não foi possível apagar as fotos agora. Tente de novo." };
  }
  const { error } = await c.rpc("admin_excluir_conta", { p_usuario: usuarioId, p_motivo: motivo });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  revalidatePath("/");
  redirect("/admin/usuarios?excluida=1");
}

// ------------------------------------------------------------------ moderadores

export async function adicionarModerador(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const email = texto(formData, "email").toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, erro: "Confira o e-mail.", erros: { email: "Confira o e-mail." } };
  const { error } = await c.rpc("admin_adicionar_moderador", { p_email: email });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: "Pronto: essa pessoa já pode moderar anúncios e denúncias." };
}

export async function removerModerador(perfilId: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(perfilId)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.rpc("admin_remover_moderador", { p_perfil: perfilId });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: "Pessoa tirada da moderação." };
}

// ------------------------------------------------------------------ e-mails

export async function salvarConfigEmails(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const avisos = texto(formData, "avisos_para")
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const invalidos = avisos.filter((e) => !EMAIL.test(e));
  if (invalidos.length) {
    return { ok: false, erro: "Confira os e-mails.", erros: { avisos_para: `Confira: ${invalidos.join(", ")}` } };
  }
  const responder = texto(formData, "responder_para").toLowerCase();
  if (responder && !EMAIL.test(responder)) {
    return { ok: false, erro: "Confira o e-mail de resposta.", erros: { responder_para: "Confira o e-mail." } };
  }
  const nome = texto(formData, "remetente_nome");
  if (nome.length < 2 || nome.length > 60) {
    return { ok: false, erro: "Confira o nome do remetente.", erros: { remetente_nome: "Use de 2 a 60 letras." } };
  }
  const { error } = await c.rpc("admin_salvar_config_emails", {
    p_emails_ativos: marcado(formData, "emails_ativos"),
    p_remetente_nome: nome,
    p_responder_para: responder || null,
    p_email_curtida: marcado(formData, "email_curtida"),
    p_email_match: marcado(formData, "email_match"),
    p_email_moderacao: marcado(formData, "email_moderacao"),
    p_email_conta: marcado(formData, "email_conta"),
    p_avisos_para: avisos,
    p_aviso_denuncia: marcado(formData, "aviso_denuncia"),
    p_aviso_cadastro: marcado(formData, "aviso_cadastro"),
    p_aviso_retirado: marcado(formData, "aviso_retirado"),
    p_email_boas_vindas: marcado(formData, "email_boas_vindas"),
    // a opção só aparece com a migração das falhas (20261104120000); sem ela, nem vai
    ...(formData.has("tem_aviso_falha") ? { p_aviso_falha: marcado(formData, "aviso_falha") } : {}),
  });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: "Configurações salvas." };
}

/** Liga ou desliga as vagas e os talentos que combinam, toda semana (migração 20261119120000). */
export async function ligarCombinam(ligado: boolean): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const { error } = await c.rpc("admin_ligar_combinam", { p_ligado: ligado });
  if (error) {
    if (error.code === "PGRST202")
      return { ok: false, erro: "Rode antes a migração 20261119120000_combinam_da_semana.sql no Supabase." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  refresh();
  return {
    ok: true,
    mensagem: ligado
      ? "Ligado: sai toda segunda, a partir das 9h, junto com a tarefa das filas."
      : "Desligado: nada mais sai.",
  };
}

const SEM_MIGRACAO_LOGO = "Confira se a migração 20261009290000_logo_emails.sql já rodou no Supabase.";

/**
 * Logo do topo dos e-mails. A imagem enviada vira a plaquinha dos e-mails e
 * fica no Storage (pasta "marca") com um nome novo a cada troca: e-mails que já
 * saíram continuam mostrando a imagem deles. "voltar" = logo do Publike.
 */
export async function salvarLogoEmails(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const voltar = formData.get("voltar") === "1";
  const mostrar = voltar || marcado(formData, "mostrar");
  const arquivo = formData.get("arquivo");
  const novo = !voltar && arquivo instanceof File && arquivo.size > 0 ? arquivo : null;

  const { data: config, error: erroConfig } = await c.rpc("admin_config");
  if (erroConfig) return { ok: false, erro: mensagemDeErro(erroConfig) };
  let url = voltar ? null : (config?.[0]?.email_logo_url ?? null);

  if (novo) {
    if (novo.size > LOGO_EMAIL.arquivoMaximo) {
      return { ok: false, erro: "A imagem passa de 800 KB. Envie uma menor.", erros: { arquivo: "Até 800 KB." } };
    }
    const pronta = await prepararLogoEmail(Buffer.from(await novo.arrayBuffer()));
    if (!pronta.ok) return { ok: false, erro: pronta.erro, erros: { arquivo: pronta.erro } };
    const caminho = `emails/logo-${Date.now()}.png`;
    const pasta = c.storage.from("marca");
    const { error: erroEnvio } = await pasta.upload(caminho, pronta.png, {
      contentType: "image/png",
      cacheControl: "31536000",
      upsert: false,
    });
    if (erroEnvio) {
      console.error("Publike: não deu para guardar a logo dos e-mails:", erroEnvio.message);
      return { ok: false, erro: `Não deu para guardar a imagem no Supabase. ${SEM_MIGRACAO_LOGO}` };
    }
    url = pasta.getPublicUrl(caminho).data.publicUrl;
  }

  const { error } = await c.rpc("admin_salvar_logo_emails", { p_mostrar: mostrar, p_url: url });
  if (error?.code === "PGRST202") return { ok: false, erro: SEM_MIGRACAO_LOGO };
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  if (voltar) return { ok: true, mensagem: "A logo do Publike voltou para os e-mails." };
  if (novo) return { ok: true, mensagem: "Logo nova salva. Os próximos e-mails já saem com ela." };
  return { ok: true, mensagem: mostrar ? "Os e-mails saem com a logo." : "Os e-mails saem sem a logo, só com o nome." };
}

export async function salvarModeloEmail(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const { error } = await c.rpc("admin_salvar_modelo_email", {
    p_chave: texto(formData, "chave"),
    p_assunto: texto(formData, "assunto"),
    p_corpo: texto(formData, "corpo"),
    p_botao: texto(formData, "botao") || null,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: "Texto salvo. Os próximos e-mails já saem assim." };
}

export async function restaurarModeloEmail(chave: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const { error } = await c.rpc("admin_restaurar_modelo_email", { p_chave: chave });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: "Texto original de volta." };
}

export async function enviarEmailDeTeste(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const para = texto(formData, "para").toLowerCase();
  if (!EMAIL.test(para)) return { ok: false, erro: "Confira o e-mail.", erros: { para: "Confira o e-mail." } };
  const { data: id, error } = await c.rpc("admin_email_teste", { p_para: para });
  if (error || id == null) return { ok: false, erro: mensagemDeErro(error) };

  const envio = await enviarEmailsPendentes(50);
  if (envio.motivo) return { ok: false, erro: envio.motivo };
  const { data: estado } = await c.rpc("admin_status_email", { p_id: id });
  const s = estado?.[0];
  refresh();
  if (s?.status === "enviado")
    return { ok: true, mensagem: `E-mail enviado para ${para}. Confira a caixa de entrada (e o spam).` };
  return {
    ok: false,
    erro: `O Zoho recusou o envio: ${s?.erro ?? envio.erros.find((e) => e.id === id)?.erro ?? "erro desconhecido"}`,
  };
}

const CONVITES = ["convite_curriculo", "convite_empresa", "convite_agencia", "convite_servicos", "convite_vitrine"];

/** Convite por e-mail para o grupo todo: entra na fila e sai em levas de 50 (o resto, na próxima leva). */
export async function enviarConviteEmail(modelo: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!CONVITES.includes(modelo)) return { ok: false, erro: "Convite desconhecido." };
  const { data: total, error } = await c.rpc("admin_enviar_convite_email", { p_modelo: modelo });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  if (!total) {
    refresh();
    return { ok: true, mensagem: "Ninguém para receber agora: todo mundo do grupo já recebeu ou desligou os avisos." };
  }
  // até 4 levas agora (200 e-mails); o que sobrar sai nas próximas (Processar filas, ou nas ações do site)
  let enviados = 0;
  let falhas = 0;
  for (let i = 0; i < 4; i++) {
    const envio = await enviarEmailsPendentes(50);
    if (envio.motivo) {
      refresh();
      return { ok: false, erro: `${total} e-mail(s) ficaram na fila: ${envio.motivo}` };
    }
    enviados += envio.enviados;
    falhas += envio.falhas;
    if (envio.enviados + envio.falhas < 50) break;
  }
  refresh();
  const resto =
    total - enviados - falhas > 0 ? ` ${total - enviados - falhas} ficaram na fila: use "Processar filas".` : "";
  const comFalha = falhas ? ` ${falhas} falharam: veja em Últimos e-mails.` : "";
  return { ok: true, mensagem: `Convite na fila para ${total} conta(s); ${enviados} já saíram.${resto}${comFalha}` };
}

/** O convite no sino de quem não tem e-mail na conta (uma vez por conta). */
export async function enviarAvisoConvite(modelo: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!CONVITES.includes(modelo)) return { ok: false, erro: "Convite desconhecido." };
  const { data: total, error } = await c.rpc("admin_enviar_aviso_convite", { p_modelo: modelo });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return {
    ok: true,
    mensagem: total
      ? `Aviso no sino de ${total} conta(s) sem e-mail.`
      : "Ninguém para avisar agora: todas as contas sem e-mail do grupo já receberam.",
  };
}

/** O convite para uma conta só (pelo e-mail de login), para ver como chega. */
export async function testarConviteEmail(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const modelo = texto(formData, "modelo");
  const para = texto(formData, "para").toLowerCase();
  if (!CONVITES.includes(modelo)) return { ok: false, erro: "Convite desconhecido." };
  if (!EMAIL.test(para)) return { ok: false, erro: "Confira o e-mail.", erros: { para: "Confira o e-mail." } };
  const { data: id, error } = await c.rpc("admin_convite_email_teste", { p_modelo: modelo, p_email: para });
  if (error || id == null) return { ok: false, erro: mensagemDeErro(error) };
  const envio = await enviarEmailsPendentes(50);
  if (envio.motivo) return { ok: false, erro: envio.motivo };
  const { data: estado } = await c.rpc("admin_status_email", { p_id: id });
  refresh();
  if (estado?.[0]?.status === "enviado") return { ok: true, mensagem: `Teste enviado para ${para}.` };
  return { ok: false, erro: `O e-mail ficou na fila: ${estado?.[0]?.erro ?? "veja em Últimos e-mails"}` };
}

export async function reenviarEmailsComFalha(): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const { data, error } = await c.rpc("admin_reenviar_emails");
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  after(processarFilas);
  refresh();
  return {
    ok: true,
    mensagem: data ? `${data} e-mail(s) voltaram para a fila.` : "Nenhum e-mail com falha nos últimos 7 dias.",
  };
}

export async function processarFilasAgora(): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  // as revisões da IA (anúncios, recados e avaliações) e depois os e-mails, que elas podem gerar
  const [ia, recados, avaliacoes] = await Promise.all([
    revisarAnunciosPendentes(20),
    revisarRecadosPendentes(20),
    revisarAvaliacoesPendentes(20),
  ]);
  const emails = await enviarEmailsPendentes(50);
  refresh();
  const partes = [
    `${emails.enviados} e-mail(s) enviado(s)`,
    emails.falhas ? `${emails.falhas} com falha` : null,
    ia.revisados ? `${ia.revisados} anúncio(s) revisado(s) pela IA` : null,
    recados.revisados ? `${recados.revisados} recado(s) revisado(s) pela IA` : null,
    avaliacoes.revisados ? `${avaliacoes.revisados} avaliação(ões) revisada(s) pela IA` : null,
  ].filter(Boolean);
  const revisados = ia.revisados + recados.revisados + avaliacoes.revisados;
  if (emails.motivo && !emails.enviados && !revisados) return { ok: false, erro: emails.motivo };
  const espera = emails.semEndereco
    ? " Os avisos para as pessoas esperam o endereço do site no ar (PUBLIKE_URL_PUBLICA)."
    : "";
  return { ok: true, mensagem: `${partes.join(", ")}.${espera}` };
}

// ------------------------------------------------------------------ sugestões

export async function moverSugestao(id: number, status: string, posicao: number): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!Number.isSafeInteger(id) || !ehStatusSugestao(status) || !Number.isFinite(posicao)) {
    return { ok: false, erro: "Pedido inválido." };
  }
  const { error } = await c.rpc("admin_mover_sugestao", { p_id: id, p_status: status, p_posicao: posicao });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  return { ok: true };
}

export async function anotarSugestao(id: number, nota: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!Number.isSafeInteger(id) || typeof nota !== "string") return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.rpc("admin_anotar_sugestao", { p_id: id, p_nota: nota.trim() || null });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: "Anotação salva." };
}

export async function apagarSugestao(id: number): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!Number.isSafeInteger(id)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.rpc("admin_apagar_sugestao", { p_id: id });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: "Apagada." };
}

// ------------------------------------------------------------------ IA

export async function salvarConfigIA(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const modelo = texto(formData, "ia_modelo");
  if (!MODELOS_IA.some((m) => m.id === modelo)) return { ok: false, erro: "Escolha um dos modelos da lista." };
  const { error } = await c.rpc("admin_salvar_config_ia", {
    p_moderacao: marcado(formData, "ia_moderacao"),
    p_melhorar_texto: marcado(formData, "ia_melhorar_texto"),
    p_resumo: marcado(formData, "ia_resumo"),
    p_modelo: modelo,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  const { error: erroAssistente } = await c.rpc("admin_salvar_config_assistente", {
    p_ativo: marcado(formData, "chat_ativo"),
  });
  revalidatePath("/publicar");
  refresh();
  if (erroAssistente?.code === "PGRST202") {
    return {
      ok: false,
      erro: "O resto foi salvo. Para ligar ou desligar o assistente, rode a migração 20261010120000_sugestoes_assistente.sql no Supabase.",
    };
  }
  if (erroAssistente) return { ok: false, erro: mensagemDeErro(erroAssistente) };
  return { ok: true, mensagem: "Configurações da IA salvas. O botão do assistente muda em alguns minutos." };
}

export async function gerarResumoIA(): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!iaConfigurada()) return { ok: false, erro: "Falta a chave da IA no servidor (OPENAI_API_KEY)." };
  const [{ data: dados, error }, { data: config }] = await Promise.all([
    c.rpc("admin_dados_para_resumo", { p_dias: 7 }),
    c.rpc("admin_config"),
  ]);
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  try {
    const resumo = await escreverResumo(dados, modeloDaIA(config?.[0]?.ia_modelo).id);
    const { error: erroSalvar } = await c.rpc("admin_salvar_resumo", {
      p_texto: resumo.texto,
      p_dias: 7,
      p_modelo: resumo.modelo,
    });
    if (erroSalvar) return { ok: false, erro: mensagemDeErro(erroSalvar) };
  } catch (e) {
    return { ok: false, erro: e instanceof ErroIA ? e.message : "A IA não conseguiu escrever o resumo agora." };
  }
  refresh();
  return { ok: true, mensagem: "Resumo atualizado." };
}

// ------------------------------------------------------------------ chaves do servidor

export type EstadoChave = EstadoForm & { chave?: string; nome?: string };

/** Gera a chave aqui no servidor do admin; o banco recebe só o hash. A chave aparece uma vez. */
export async function criarChaveServidor(_anterior: EstadoChave, formData: FormData): Promise<EstadoChave> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const nome = texto(formData, "nome");
  if (nome.length < 2 || nome.length > 60) {
    return { ok: false, erro: "Dê um nome para a chave.", erros: { nome: "Por exemplo: Vercel." } };
  }
  const chave = `publike_${randomBytes(32).toString("base64url")}`;
  const hash = createHash("sha256").update(chave, "utf8").digest("hex");
  const { error } = await c.rpc("admin_criar_chave_servidor", { p_nome: nome, p_hash: hash });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, chave, nome };
}

export async function apagarChaveServidor(id: number): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const { error } = await c.rpc("admin_apagar_chave_servidor", { p_id: id });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: "Chave apagada. Quem usava essa chave para de mandar e-mails." };
}

// ------------------------------------------------------------------ anúncios

export async function excluirAnuncioDeVez(id: string, motivo: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.rpc("admin_excluir_anuncio", { p_id: id, p_motivo: motivo || null });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  revalidatePath("/");
  redirect("/admin/anuncios?excluido=1");
}
