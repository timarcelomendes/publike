"use server";

import { rotuloConta } from "@/lib/formato";

import { createHash, randomBytes } from "node:crypto";
import { refresh, revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { LOGO_EMAIL } from "@/lib/email/montar";
import { mensagemDeErro } from "@/lib/erros";
import { ErroIA, iaConfigurada, MODELOS_IA } from "@/lib/ia/openai";
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
import { perguntarNosMatches } from "@/lib/servidor/perguntas-do-match";
import { SLUGS_CATEGORIAS } from "@/lib/constantes";
import { ehStatusSugestao } from "@/lib/sugestoes";
import { PUBLICOS_COMUNICADO as PUBLICOS_DO_COMUNICADO } from "@/lib/comunicados";
import { clienteAdminOuNulo, type ClienteBanco } from "@/lib/supabase/admin";
import type { EstadoForm, Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";
import { tituloLegivel } from "@/lib/conferir-anuncio";
import { modeloPara } from "@/lib/ia/funcionalidades";
import { FUNCIONALIDADES_IA, limparApelido } from "@/lib/ia-nomes";
import { TAG_APELIDO_IA } from "@/lib/servidor/apelido-ia";

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

/** Corrige o nome da conta (perfil), com as regras do perfil; fica no registro da equipe (migração 20261206120000). */
export async function corrigirNome(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const usuarioId = texto(formData, "usuario_id");
  if (!UUID.test(usuarioId)) return { ok: false, erro: "Pedido inválido." };
  const nome = texto(formData, "nome").replace(/\s+/g, " ");
  if (nome.length < 2 || nome.length > 80) {
    return { ok: false, erro: "Confira o nome.", erros: { nome: "Use de 2 a 80 letras." } };
  }
  const { data, error } = await c.rpc("admin_corrigir_nome", { p_usuario: usuarioId, p_nome: nome });
  if (error) {
    if (error.code === "PGRST202")
      return { ok: false, erro: "Rode a migração 20261206120000_admin_corrigir_nome.sql primeiro." };
    return { ok: false, erro: mensagemDeErro(error), erros: { nome: mensagemDeErro(error) } };
  }
  refresh();
  return { ok: true, mensagem: `Pronto: o nome agora é “${data ?? nome}”.` };
}

/**
 * Muda o tipo da conta (comércio, empresa ou agência) e corrige ou tira o CNPJ (migração 20270320120000). O selo
 * de verificado sai quando muda; fica no registro da equipe.
 */
export async function mudarTipoECnpj(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const usuarioId = texto(formData, "usuario_id");
  if (!UUID.test(usuarioId)) return { ok: false, erro: "Pedido inválido." };
  const tipo = texto(formData, "tipo");
  if (!["comercio", "empresa", "agencia"].includes(tipo)) {
    return { ok: false, erro: "Confira o tipo.", erros: { tipo: "Escolha comércio, empresa ou agência." } };
  }
  const cnpj = texto(formData, "cnpj").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (tipo === "agencia" && !cnpj) {
    return { ok: false, erro: "Confira o CNPJ.", erros: { cnpj: "Agência precisa de CNPJ." } };
  }
  const { error } = await c.rpc("admin_mudar_tipo_e_cnpj", { p_usuario: usuarioId, p_tipo: tipo, p_cnpj: cnpj || null });
  if (error) {
    if (error.code === "PGRST202")
      return { ok: false, erro: "Rode a migração 20270320120000_admin_tipo_e_cnpj.sql primeiro." };
    const msg = mensagemDeErro(error);
    const campo = error.hint === "cnpj" ? "cnpj" : error.hint === "tipo" ? "tipo" : null;
    return { ok: false, erro: msg, erros: campo ? { [campo]: msg } : undefined };
  }
  refresh();
  return {
    ok: true,
    mensagem: `Pronto: a conta agora é ${rotuloConta(tipo)}${cnpj ? "" : ", sem CNPJ"}. Se tinha o selo de verificado, ele saiu: ligue de novo abaixo se for o caso.`,
  };
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

/** Libera (ou tira) os números do Painel no site (/equipe) para uma conta com e-mail @publike.org. */
export async function liberarPainelNoSite(usuarioId: string, liberar: boolean): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(usuarioId)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.rpc("admin_liberar_painel_no_site", { p_usuario: usuarioId, p_liberar: liberar });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return {
    ok: true,
    mensagem: liberar ? "Pronto: essa conta já vê o Painel no site." : "Essa conta não vê mais o Painel no site.",
  };
}

/**
 * O aviso "liberado para você" (sino, celular e e-mail; migração 20270212120000), uma vez por conta e funcionalidade
 * (de novo só depois de 90 dias). Sem a migração ou com falha, a liberação vale assim mesmo.
 */
async function avisarLiberacao(
  c: NonNullable<Awaited<ReturnType<typeof clienteAdminOuNulo>>>,
  contaId: string,
  funcionalidade: "pagina_de_vagas" | "copiloto" | "testes" | "video" | "automacoes",
) {
  const { data, error } = await c.rpc("admin_avisar_liberacao", { p_conta: contaId, p_funcionalidade: funcionalidade });
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: falha ao avisar a liberação:", error.message);
    return false;
  }
  // o e-mail e o celular saem pelas filas
  if (data) after(processarFilas);
  return Boolean(data);
}

/** Libera (ou tira) o copiloto de contratação, em teste, para uma conta (migração 20261203120000). */
export async function liberarCopiloto(contaId: string, liberar: boolean): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(contaId)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.rpc("admin_liberar_copiloto", { p_conta: contaId, p_liberar: liberar });
  if (error) {
    if (error.code === "PGRST202") return { ok: false, erro: "Rode a migração 20261203120000_copiloto.sql primeiro." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  const avisou = liberar && (await avisarLiberacao(c, contaId, "copiloto"));
  refresh();
  return {
    ok: true,
    mensagem: liberar
      ? "Pronto: essa conta tem a Triagem com IA, sem prazo." + (avisou ? " Ela recebeu o aviso." : "")
      : "Essa conta não vê mais a Triagem com IA (os critérios e as leituras ficam guardados).",
  };
}

/** Libera a página de carreiras sem prazo (ou tira a liberação da equipe), migração 20270117120000. */
export async function liberarPaginaDeVagas(contaId: string, liberar: boolean): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(contaId)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.rpc("admin_liberar_pagina_de_vagas", { p_conta: contaId, p_liberar: liberar });
  if (error) {
    if (error.code === "PGRST202")
      return { ok: false, erro: "Rode a migração 20270117120000_pagina_de_vagas.sql primeiro." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  updateTag(`vagas-da-empresa-${contaId}`);
  const avisou = liberar && (await avisarLiberacao(c, contaId, "pagina_de_vagas"));
  refresh();
  return {
    ok: true,
    mensagem: liberar
      ? "Pronto: essa conta tem a página de carreiras, sem prazo." + (avisou ? " Ela recebeu o aviso." : "")
      : "A liberação da equipe saiu (a conta continua liberada se tiver mais de 10 vagas ou assinatura).",
  };
}

/** Libera a Entrevista em vídeo sem prazo (ou tira). Os 15 dias grátis a conta pede sozinha. */
export async function liberarVideo(contaId: string, liberar: boolean): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(contaId)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.rpc("admin_liberar_video", { p_conta: contaId, p_liberar: liberar });
  if (error) {
    if (error.code === "PGRST202")
      return { ok: false, erro: "Rode a migração 20270104120000_recurso_video.sql primeiro." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  const avisou = liberar && (await avisarLiberacao(c, contaId, "video"));
  refresh();
  return {
    ok: true,
    mensagem: liberar
      ? "Pronto: essa conta tem a Entrevista em vídeo, sem prazo." + (avisou ? " Ela recebeu o aviso." : "")
      : "Essa conta não tem mais a Entrevista em vídeo (as entrevistas feitas ficam guardadas).",
  };
}

/** Libera as Automações personalizadas sem prazo (ou tira). Os 15 dias grátis a conta pede sozinha. */
export async function liberarAutomacoes(contaId: string, liberar: boolean): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(contaId)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.rpc("admin_liberar_automacoes", { p_conta: contaId, p_liberar: liberar });
  if (error) {
    if (error.code === "PGRST202")
      return { ok: false, erro: "Rode a migração 20270114120000_automacoes_sob_medida.sql primeiro." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  const avisou = liberar && (await avisarLiberacao(c, contaId, "automacoes"));
  refresh();
  return {
    ok: true,
    mensagem: liberar
      ? "Pronto: essa conta tem as Automações personalizadas, sem prazo." + (avisou ? " Ela recebeu o aviso." : "")
      : "Essa conta voltou para as automações prontas (o que já estava salvo nas vagas continua valendo).",
  };
}

/** Libera o Teste Prático sem prazo (ou tira). Os 15 dias grátis a conta pede sozinha. */
export async function liberarTestes(contaId: string, liberar: boolean): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(contaId)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.rpc("admin_liberar_testes", { p_conta: contaId, p_liberar: liberar });
  if (error) {
    if (error.code === "PGRST202") return { ok: false, erro: "Rode a migração 20261215120000_experimentar.sql primeiro." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  const avisou = liberar && (await avisarLiberacao(c, contaId, "testes"));
  refresh();
  return {
    ok: true,
    mensagem: liberar
      ? "Pronto: essa conta tem o Teste Prático, sem prazo." + (avisou ? " Ela recebeu o aviso." : "")
      : "Essa conta não tem mais o Teste Prático (os resultados ficam guardados).",
  };
}

/** Põe o anúncio em outra área (Admin › Anúncios › Em Outros). Entra no registro da equipe como "editar_anuncio". */
export async function mudarCategoria(anuncioId: string, categoria: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(anuncioId) || !(SLUGS_CATEGORIAS as readonly string[]).includes(categoria)) {
    return { ok: false, erro: "Pedido inválido." };
  }
  const { error } = await c.from("anuncios").update({ categoria }).eq("id", anuncioId);
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  // sem refresh: a linha fica com o "Agora em…" até recarregar (recarregada, a vaga sai da lista)
  return { ok: true };
}

/** Admin › Anúncios › Para conferir: o título todo em maiúsculas em letra normal (tituloLegivel). */
export async function arrumarTituloDoAnuncio(anuncioId: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Pedido inválido." };
  const { data, error } = await c.from("anuncios").select("titulo").eq("id", anuncioId).maybeSingle();
  if (error || !data) return { ok: false, erro: error ? mensagemDeErro(error) : "Anúncio não encontrado." };
  const titulo = tituloLegivel(data.titulo);
  if (titulo === data.titulo) return { ok: true, mensagem: "O título já estava bom." };
  const { error: erro } = await c.from("anuncios").update({ titulo }).eq("id", anuncioId);
  if (erro) return { ok: false, erro: mensagemDeErro(erro) };
  return { ok: true, mensagem: `Agora: ${titulo}` };
}

/** Publica (ou volta para rascunho) um teste da Publike, depois de revisar (migração 20261204120000). */
export async function publicarTeste(modeloId: string, publicar: boolean): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(modeloId)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.rpc("admin_publicar_avaliacao", { p_modelo: modeloId, p_publicado: publicar });
  if (error) {
    if (error.code === "PGRST202")
      return { ok: false, erro: "Rode a migração 20261204120000_avaliacoes.sql primeiro." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  refresh();
  return {
    ok: true,
    mensagem: publicar ? "Publicado: as empresas já podem pôr este teste nas vagas." : "Voltou para rascunho.",
  };
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
  // as chaves de cada e-mail ficam em Admin › E-mails › Todos: aqui vão como estão
  const { data: atual, error: erroAtual } = await c.rpc("admin_config");
  const cfg = atual?.[0];
  if (erroAtual || !cfg) return { ok: false, erro: "Não deu para ler as configurações. Tente de novo." };
  const { error } = await c.rpc("admin_salvar_config_emails", {
    // o liga e desliga geral fica na Visão geral (ligarEmailsDoSite): aqui vai como está
    p_emails_ativos: cfg.emails_ativos,
    p_remetente_nome: nome,
    p_responder_para: responder || null,
    p_email_curtida: cfg.email_curtida,
    p_email_match: cfg.email_match,
    p_email_moderacao: cfg.email_moderacao,
    p_email_conta: cfg.email_conta,
    p_avisos_para: avisos,
    p_aviso_denuncia: cfg.aviso_denuncia,
    p_aviso_cadastro: cfg.aviso_cadastro,
    p_aviso_retirado: cfg.aviso_retirado,
    p_email_boas_vindas: cfg.email_boas_vindas ?? true,
    ...(cfg.aviso_falha !== undefined && cfg.aviso_falha !== null ? { p_aviso_falha: cfg.aviso_falha } : {}),
  });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: "Configurações salvas." };
}

/** Os números dos e-mails: o limite por dia, o dia e a hora da semana e o Volte a contratar (20270201120000). */
const NUMEROS_EMAIL = {
  por_dia: { de: 1, ate: 200, nome: "o limite por dia" },
  semana_dia: { de: 1, ate: 7, nome: "o dia da semana" },
  semana_hora: { de: 0, ate: 23, nome: "a hora" },
  reativar_sem_vaga_dias: { de: 1, ate: 90, nome: "os dias sem vaga no ar" },
  reativar_janela_dias: { de: 30, ate: 365, nome: "os dias das vagas de antes" },
  reativar_intervalo_dias: { de: 7, ate: 90, nome: "os dias entre avisos" },
  reativar_max_seguidos: { de: 1, ate: 10, nome: "os avisos seguidos" },
  reativar_minimo_talentos: { de: 1, ate: 10, nome: "o mínimo de talentos" },
} as const;

export async function salvarParametrosEmail(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const valores = {} as Record<keyof typeof NUMEROS_EMAIL, number>;
  const erros: Record<string, string> = {};
  for (const [campo, regra] of Object.entries(NUMEROS_EMAIL) as [keyof typeof NUMEROS_EMAIL, (typeof NUMEROS_EMAIL)[keyof typeof NUMEROS_EMAIL]][]) {
    const n = Number(texto(formData, campo));
    if (!Number.isInteger(n) || n < regra.de || n > regra.ate) erros[campo] = `Use de ${regra.de} a ${regra.ate}.`;
    else valores[campo] = n;
  }
  if (Object.keys(erros).length) return { ok: false, erro: "Confira os números.", erros };
  const { error } = await c.rpc("admin_salvar_parametros_email", {
    p_por_dia: valores.por_dia,
    p_semana_dia: valores.semana_dia,
    p_semana_hora: valores.semana_hora,
    p_reativar_sem_vaga_dias: valores.reativar_sem_vaga_dias,
    p_reativar_janela_dias: valores.reativar_janela_dias,
    p_reativar_intervalo_dias: valores.reativar_intervalo_dias,
    p_reativar_max_seguidos: valores.reativar_max_seguidos,
    p_reativar_minimo_talentos: valores.reativar_minimo_talentos,
  });
  if (error) {
    if (error.code === "PGRST202")
      return { ok: false, erro: "Rode antes a migração 20270201120000_central_de_emails.sql no Supabase." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  refresh();
  return { ok: true, mensagem: "Números salvos. Valem a partir do próximo e-mail." };
}

/** No máximo 1 e-mail do modelo a cada N minutos para a mesma pessoa (null: sem limite). */
export async function mudarIntervaloEmail(modelo: string, minutos: number | null): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!/^[a-z_]{3,40}$/.test(String(modelo ?? ""))) return { ok: false, erro: "Esse e-mail não existe." };
  if (minutos !== null && (!Number.isInteger(minutos) || minutos < 1 || minutos > 10080))
    return { ok: false, erro: "Use de 1 minuto a 7 dias, ou deixe em branco para não ter limite." };
  const { error } = await c.rpc("admin_intervalo_email", { p_modelo: modelo, p_minutos: minutos });
  if (error) {
    if (error.code === "PGRST202")
      return { ok: false, erro: "Rode antes a migração 20270201120000_central_de_emails.sql no Supabase." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  refresh();
  return { ok: true, mensagem: minutos === null ? "Sem limite de frequência." : "Frequência salva." };
}

/** O saldo de e-mails do ZeptoMail e o próximo vencimento, como o ZeptoMail mostra (migração 20261126120000). */
export async function salvarCreditosEmail(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const emails = Number(texto(formData, "emails").replace(/\D/g, ""));
  if (!texto(formData, "emails") || !Number.isInteger(emails) || emails > 100_000_000) {
    return { ok: false, erro: "Confira o saldo.", erros: { emails: "Ponha quantos e-mails o ZeptoMail mostra." } };
  }
  const total = texto(formData, "total") ? Number(texto(formData, "total").replace(/\D/g, "")) : null;
  if (total !== null && (!Number.isInteger(total) || total < 1 || total < emails || total > 100_000_000)) {
    return {
      ok: false,
      erro: "Confira o total.",
      erros: { total: "O total é o número depois da barra (19450 / 20000)." },
    };
  }
  const vence = texto(formData, "vence_em");
  if (vence && !/^\d{4}-\d{2}-\d{2}$/.test(vence)) {
    return { ok: false, erro: "Confira a data.", erros: { vence_em: "Confira a data do vencimento." } };
  }
  const { error } = await c.rpc("admin_salvar_creditos_email", {
    p_emails: emails,
    p_total: total,
    p_vence_em: vence || null,
  });
  if (error) {
    if (error.code === "PGRST202")
      return { ok: false, erro: "Rode antes a migração 20261126120000_emails_enviados_desde.sql no Supabase." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  refresh();
  return { ok: true, mensagem: "Saldo salvo. Daqui para frente, cada e-mail enviado sai dele." };
}

const PUBLICOS_COMUNICADO = PUBLICOS_DO_COMUNICADO.map((p) => p.id as string);
const MIGRACAO_COMUNICADOS = "Rode antes a migração 20261129120000_comunicados.sql no Supabase.";
const MIGRACAO_SEM_CURRICULO = "Rode antes a migração 20270223120000_comunicado_sem_curriculo.sql no Supabase.";

/** O erro do banco no comunicado; o público "pessoas sem currículo" pede a migração dele. */
function erroDoComunicado(error: { code?: string; message: string }, publico: string) {
  if (error.code === "PGRST202") return MIGRACAO_COMUNICADOS;
  if (publico === "pessoas_sem_curriculo" && /desconhecido/i.test(error.message)) return MIGRACAO_SEM_CURRICULO;
  return mensagemDeErro(error);
}

/** O link do comunicado: só caminho do site ("/testar-app?de=sino"), ou nenhum. undefined: inválido. */
function linkDoComunicado(valor: string) {
  if (!valor) return null;
  return /^\/([^/\\]|$)/.test(valor) && !/\s/.test(valor) && valor.length <= 300 ? valor : undefined;
}

/** Quantas contas recebem o comunicado agora (antes de mandar). */
export async function contarComunicado(publico: string, link: string): Promise<Resultado & { total?: number }> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!PUBLICOS_COMUNICADO.includes(publico)) return { ok: false, erro: "Escolha o público." };
  const l = linkDoComunicado(link.trim());
  if (l === undefined) return { ok: false, erro: "O link é um caminho do site, começando com /." };
  const { data, error } = await c.rpc("admin_contar_comunicado", { p_publico: publico, p_link: l });
  if (error) return { ok: false, erro: erroDoComunicado(error, publico) };
  return { ok: true, total: data ?? 0 };
}

/** O comunicado no sino de todas as contas do público (migração 20261129120000). */
export async function enviarComunicado(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const publico = texto(formData, "publico");
  const mensagem = texto(formData, "texto");
  const link = linkDoComunicado(texto(formData, "link"));
  if (!PUBLICOS_COMUNICADO.includes(publico)) {
    return { ok: false, erro: "Escolha o público.", erros: { publico: "Escolha quem recebe." } };
  }
  if (mensagem.length < 10 || mensagem.length > 240) {
    return { ok: false, erro: "Confira o texto.", erros: { texto: "Escreva de 10 a 240 letras." } };
  }
  if (link === undefined) {
    return {
      ok: false,
      erro: "Confira o link.",
      erros: { link: "Use um caminho do site, começando com / (ex.: /testar-app)." },
    };
  }
  const { data: total, error } = await c.rpc("admin_enviar_comunicado", {
    p_publico: publico,
    p_texto: mensagem,
    p_link: link,
  });
  if (error) return { ok: false, erro: erroDoComunicado(error, publico) };
  refresh();
  return {
    ok: true,
    mensagem: total
      ? `Comunicado no sino de ${total} conta(s).`
      : "Ninguém recebeu: o público está vazio ou todos já receberam este link.",
  };
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

/** Liga ou desliga o "Volte a contratar", para as empresas sem vaga no ar (migração 20270130120000). */
/** Liga ou desliga um e-mail (Admin › E-mails › Todos; migração 20270201120000). */
export async function ligarEmail(modelo: string, ligado: boolean): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!/^[a-z_]{3,40}$/.test(String(modelo ?? ""))) return { ok: false, erro: "Esse e-mail não existe." };
  const { error } = await c.rpc("admin_ligar_email", { p_modelo: modelo, p_ligado: Boolean(ligado) });
  if (error) {
    if (error.code === "PGRST202")
      return { ok: false, erro: "Rode antes a migração 20270201120000_central_de_emails.sql no Supabase." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  refresh();
  return { ok: true, mensagem: ligado ? "Ligado." : "Desligado: este e-mail não sai mais." };
}

export async function ligarReativar(ligado: boolean): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const { error } = await c.rpc("admin_ligar_reativar", { p_ligado: ligado });
  if (error) {
    if (error.code === "PGRST202")
      return { ok: false, erro: "Rode antes a migração 20270130120000_crescimento_empresas.sql no Supabase." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  refresh();
  return {
    ok: true,
    mensagem: ligado
      ? "Ligado: sai toda segunda, a partir das 9h, para quem está sem vaga no ar."
      : "Desligado: nada mais sai.",
  };
}

/**
 * Os matches sem contato (Admin › Retorno; claude/plano-match-no-chat.md, parte 2): as perguntas do match no chat de
 * quem ainda não recebeu e um aviso por empresa (no máximo um a cada 7 dias). O robô manda as primeiras logo depois
 * e o resto nas rodadas de 5 minutos.
 */
export async function perguntarNosMatchesSemContato(): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const { data, error } = await c.rpc("admin_avisar_matches_sem_contato");
  if (error) {
    if (error.code === "PGRST202")
      return { ok: false, erro: "Rode antes a migração 20270202120000_perguntas_no_match.sql no Supabase." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  const r = (data ?? {}) as { perguntas?: number; avisadas?: number };
  const perguntas = Number(r.perguntas) || 0;
  const avisadas = Number(r.avisadas) || 0;
  after(async () => {
    await perguntarNosMatches(50);
    await processarFilas();
  });
  refresh();
  if (!perguntas && !avisadas) return { ok: true, mensagem: "Nada para mandar agora." };
  return {
    ok: true,
    mensagem: `Pronto: ${[
      perguntas
        ? `as perguntas vão para ${perguntas === 1 ? "1 pessoa" : `${perguntas} pessoas`} (em até 5 minutos)`
        : "",
      avisadas ? `${avisadas === 1 ? "1 empresa foi avisada" : `${avisadas} empresas foram avisadas`}` : "",
    ]
      .filter(Boolean)
      .join(" e ")}.`,
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

const CONVITES = [
  "convite_perfil",
  "convite_curriculo",
  "convite_empresa",
  "convite_agencia",
  "convite_servicos",
  "convite_vitrine",
];

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

/** O liga e desliga geral dos e-mails do site (Admin › E-mails › Visão geral); o resto da configuração fica igual. */
export async function ligarEmailsDoSite(ligado: boolean): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const { data: atual, error: erroAtual } = await c.rpc("admin_config");
  const cfg = atual?.[0];
  if (erroAtual || !cfg) return { ok: false, erro: "Não deu para ler as configurações. Tente de novo." };
  const { error } = await c.rpc("admin_salvar_config_emails", {
    p_emails_ativos: ligado === true,
    p_remetente_nome: cfg.remetente_nome,
    p_responder_para: cfg.responder_para,
    p_email_curtida: cfg.email_curtida,
    p_email_match: cfg.email_match,
    p_email_moderacao: cfg.email_moderacao,
    p_email_conta: cfg.email_conta,
    p_avisos_para: cfg.avisos_para,
    p_aviso_denuncia: cfg.aviso_denuncia,
    p_aviso_cadastro: cfg.aviso_cadastro,
    p_aviso_retirado: cfg.aviso_retirado,
    p_email_boas_vindas: cfg.email_boas_vindas ?? true,
    ...(cfg.aviso_falha !== undefined && cfg.aviso_falha !== null ? { p_aviso_falha: cfg.aviso_falha } : {}),
  });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  if (ligado) after(processarFilas);
  refresh();
  return {
    ok: true,
    mensagem: ligado
      ? "Ligados: os e-mails voltam a sair, com as chaves de cada um."
      : "Desligados: nenhum e-mail sai (o sino continua).",
  };
}

/** Manda de novo um e-mail que falhou (Admin › E-mails › Enviados). */
export async function reenviarEmail(id: number): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!Number.isSafeInteger(id)) return { ok: false, erro: "Pedido inválido." };
  const { data, error } = await c.rpc("admin_reenviar_email", { p_id: id });
  if (error) {
    if (error.code === "PGRST202")
      return { ok: false, erro: "Rode antes a migração 20270203120000_emails_enviados.sql no Supabase." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  if (!data) return { ok: false, erro: "Este e-mail não está mais com falha." };
  after(processarFilas);
  refresh();
  return { ok: true, mensagem: "Voltou para a fila: sai em instantes." };
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
  const base = {
    p_moderacao: marcado(formData, "ia_moderacao"),
    p_melhorar_texto: marcado(formData, "ia_melhorar_texto"),
    p_resumo: marcado(formData, "ia_resumo"),
    p_modelo: modelo,
  };
  let { error } = await c.rpc("admin_salvar_config_ia", { ...base, p_reserva: marcado(formData, "ia_reserva") });
  // banco sem a migração da reserva (20261201120000): salva o resto
  const semReserva = error?.code === "PGRST202";
  if (semReserva) ({ error } = await c.rpc("admin_salvar_config_ia", base));
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
  // o modelo de cada funcionalidade e o apelido (claude/plano-ia-por-funcionalidade.md)
  const modelos: Record<string, string> = {};
  for (const f of FUNCIONALIDADES_IA) {
    const m = texto(formData, `modelo_${f.id}`);
    if (m && MODELOS_IA.some((x) => x.id === m)) modelos[f.id] = m;
  }
  const apelidoBruto = texto(formData, "ia_apelido");
  const apelido = limparApelido(apelidoBruto);
  if (apelidoBruto && !apelido) {
    return { ok: false, erro: "O resto foi salvo. O apelido da IA tem até 20 letras (pode ter espaço e hífen)." };
  }
  const { error: erroModelos } = await c.rpc("admin_salvar_ia_por_funcionalidade", {
    p_modelos: modelos,
    p_apelido: apelido,
  });
  updateTag(TAG_APELIDO_IA);
  if (erroModelos?.code === "PGRST202") {
    return {
      ok: false,
      erro: "O resto foi salvo. Para o modelo de cada funcionalidade e o apelido, rode a migração 20270208120000_ia_por_funcionalidade.sql no Supabase.",
    };
  }
  if (erroModelos) return { ok: false, erro: mensagemDeErro(erroModelos) };
  if (semReserva) {
    return {
      ok: false,
      erro: "O resto foi salvo. Para ligar ou desligar a reserva, rode a migração 20261201120000_ia_reserva.sql no Supabase.",
    };
  }
  return { ok: true, mensagem: "Configurações da IA salvas. O botão do assistente muda em alguns minutos." };
}

export async function gerarResumoIA(): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!iaConfigurada()) {
    return { ok: false, erro: "Falta a chave da IA no servidor (OPENAI_API_KEY ou ANTHROPIC_API_KEY)." };
  }
  const [{ data: dados, error }, { data: config }] = await Promise.all([
    c.rpc("admin_dados_para_resumo", { p_dias: 7 }),
    c.rpc("admin_config"),
  ]);
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  try {
    const resumo = await escreverResumo(dados, modeloPara(config?.[0], "admin"));
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
