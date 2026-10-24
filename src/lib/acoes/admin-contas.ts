"use server";

import { randomBytes } from "node:crypto";
import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { mensagemDeErro } from "@/lib/erros";
import { limparFotosDeTrabalho } from "@/lib/servidor/arquivos";
import { urlDosEmails } from "@/lib/servidor/ambiente";
import { salvarContatoDireto } from "@/lib/servidor/contato-direto";
import { mandarEmailDeAcesso } from "@/lib/servidor/email-acesso";
import { enviarEmailsPendentes, processarFilas } from "@/lib/servidor/filas";
import { clienteAdminOuNulo, type ClienteBanco } from "@/lib/supabase/admin";
import type { EstadoForm, Resultado } from "@/lib/tipos";
import { errosPorCampo, lerAnuncio, lerPerfil, lerServicos, registroDoAnuncio, UUID } from "@/lib/validacao";
import { salvarTriagem } from "@/lib/servidor/triagem";
import { areasSemRepetir } from "@/lib/constantes";
import { LIMITES_MENSAGEM_EQUIPE } from "@/lib/mensagem-equipe";

// Contas criadas pela equipe (quem pediu ajuda para entrar no Publike, como uma
// agência que mandou a lista de vagas). Só no admin, no computador do dono.

const FORA = "O admin só funciona no seu computador, com o site rodando em modo de desenvolvimento.";
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** A conta que já usa este e-mail para entrar (a busca do admin também olha o e-mail de login). */
async function contaDoEmail(c: ClienteBanco, email: string) {
  const { data } = await c.rpc("admin_listar_usuarios", { p_busca: email, p_filtro: "todos", p_limite: 20 });
  return data?.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
}

/** Cria o login (só com o e-mail, sem senha) e o perfil. O e-mail de acesso vai agora ou depois. */
export async function criarContaPeloAdmin(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };

  const login = String(formData.get("login") ?? "")
    .trim()
    .toLowerCase();
  // o e-mail de contato (o que aparece no match) é o de login, se não vier outro
  if (!String(formData.get("email") ?? "").trim()) formData.set("email", login);
  formData.set("receber_emails", "on");
  const leitura = lerPerfil(formData);
  const erros: Record<string, string> = leitura.success ? {} : errosPorCampo(leitura.error);
  if (!EMAIL.test(login)) erros.login = "Confira o e-mail.";
  if (!leitura.success || Object.keys(erros).length) return { ok: false, erro: "Confira os campos marcados.", erros };
  const d = leitura.data;

  const existente = await contaDoEmail(c, login);
  if (existente) redirect(`/admin/usuarios/${existente}?existente=1`);

  const { data: criado, error: erroLogin } = await c.auth.admin.createUser({
    email: login,
    email_confirm: true,
    user_metadata: { name: d.nome, criada_pela_equipe: true },
  });
  if (erroLogin || !criado.user) {
    return { ok: false, erro: `O Supabase não criou o login: ${erroLogin?.message ?? "erro desconhecido"}` };
  }
  const id = criado.user.id;

  const { error: erroPerfil } = await c
    .from("perfis")
    .insert({ id, nome: d.nome, tipo: d.tipo, cidade: d.cidade, bairro: d.bairro, sobre: d.sobre, cnpj: d.cnpj });
  const { error: erroContato } = erroPerfil
    ? { error: null }
    : await c.from("contatos").insert({ perfil_id: id, whatsapp: d.whatsapp, email: d.email, receber_emails: true });
  const erro = erroPerfil ?? erroContato;
  if (erro) {
    // sem perfil, o login não serve para nada: desfaz para dar para tentar de novo
    await c.auth.admin.deleteUser(id);
    if (erro.hint === "cnpj")
      return { ok: false, erro: "Confira os campos marcados.", erros: { cnpj: mensagemDeErro(erro) } };
    return { ok: false, erro: mensagemDeErro(erro, "Não foi possível criar o perfil.") };
  }
  // conta nova avisa a equipe por e-mail (como no cadastro normal)
  after(processarFilas);
  // veio de um convite (Admin > Convites): o convite fica ligado à conta
  const convite = String(formData.get("convite") ?? "");
  if (UUID.test(convite)) {
    const { error: erroConvite } = await c
      .from("convites")
      .update({ usuario_id: id, status: "autorizou" })
      .eq("id", convite);
    if (erroConvite) console.error("Publike: não deu para ligar o convite à conta:", erroConvite.message);
  }

  let aviso = "";
  if (formData.get("enviar_acesso") === "on") {
    const envio = await mandarEmailDeAcesso(c, { email: login, nome: d.nome, primeiro: true, vagas: 0, servicos: 0 });
    aviso = envio.ok ? "&acesso=1" : `&acesso=0&erro_acesso=${encodeURIComponent(envio.erro)}`;
  }
  revalidatePath("/admin/usuarios");
  redirect(`/admin/usuarios/${id}?criada=1${aviso}`);
}

/**
 * Cria o perfil de uma conta que já entrou (login feito) mas ainda não terminou o perfil: a empresa
 * autorizou e vai completar depois. Com o perfil, dá para publicar em nome dela; no primeiro acesso,
 * ela confere os dados e aceita as regras, como numa conta criada pela equipe.
 */
export async function criarPerfilPeloAdmin(
  usuarioId: string,
  _anterior: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(usuarioId)) return { ok: false, erro: "Conta não encontrada." };
  // a ficha do admin (a mesma da página da conta): o login existe e o e-mail dele
  const { data: ficha, error: erroConta } = await c.rpc("admin_usuario", { p_id: usuarioId });
  const conta = ficha as unknown as { email: string | null; perfil: unknown } | null;
  if (erroConta || !conta) return { ok: false, erro: "Conta não encontrada." };
  if (conta.perfil) redirect(`/admin/usuarios/${usuarioId}/publicar`);

  // o e-mail de contato (o que aparece no match) é o de login, se não vier outro
  if (!String(formData.get("email") ?? "").trim() && conta.email) formData.set("email", conta.email);
  formData.set("receber_emails", "on");
  const leitura = lerPerfil(formData);
  if (!leitura.success) return { ok: false, erro: "Confira os campos marcados.", erros: errosPorCampo(leitura.error) };
  const d = leitura.data;

  const { error: erroPerfil } = await c.from("perfis").insert({
    id: usuarioId,
    nome: d.nome,
    tipo: d.tipo,
    cidade: d.cidade,
    bairro: d.bairro,
    sobre: d.sobre,
    cnpj: d.cnpj,
  });
  if (erroPerfil) {
    if (erroPerfil.hint === "cnpj")
      return { ok: false, erro: "Confira os campos marcados.", erros: { cnpj: mensagemDeErro(erroPerfil) } };
    return { ok: false, erro: mensagemDeErro(erroPerfil, "Não foi possível criar o perfil.") };
  }
  const { error: erroContato } = await c
    .from("contatos")
    .upsert({ perfil_id: usuarioId, whatsapp: d.whatsapp, email: d.email, receber_emails: true });
  if (erroContato) console.error("Publike: o perfil saiu, mas o contato não:", erroContato.message);
  after(processarFilas);
  revalidatePath("/admin/usuarios");
  redirect(`/admin/usuarios/${usuarioId}/publicar?perfil=1${erroContato ? "&contato=0" : ""}`);
}

/** Manda (ou manda de novo) o link de entrar para o e-mail de login da conta. */
export async function enviarAcessoPeloAdmin(usuarioId: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(usuarioId)) return { ok: false, erro: "Pedido inválido." };

  const { data, error } = await c.auth.admin.getUserById(usuarioId);
  const email = data?.user?.email;
  if (error || !data?.user) return { ok: false, erro: "Conta não encontrada." };
  if (!email) return { ok: false, erro: "Esta conta entra pelo celular: não tem e-mail de login para mandar o link." };
  if (data.user.banned_until && new Date(data.user.banned_until).getTime() > Date.now()) {
    return { ok: false, erro: "A conta está suspensa: o link não funcionaria." };
  }

  const ativos = (tipo: "vaga" | "servico") =>
    c
      .from("anuncios")
      .select("id", { count: "exact", head: true })
      .eq("autor_id", usuarioId)
      .eq("status", "ativo")
      .eq("tipo", tipo);
  const [{ data: perfil }, { count: vagas }, { count: servicos }] = await Promise.all([
    c.from("perfis").select("nome").eq("id", usuarioId).maybeSingle(),
    ativos("vaga"),
    ativos("servico"),
  ]);
  const envio = await mandarEmailDeAcesso(c, {
    email,
    nome: perfil?.nome ?? "tudo bem",
    // nunca entrou: vai o texto de boas-vindas, que passa pelo perfil para aceitar as regras
    primeiro: !data.user.last_sign_in_at,
    vagas: vagas ?? 0,
    servicos: servicos ?? 0,
  });
  if (!envio.ok) return { ok: false, erro: envio.erro };
  refresh();
  return { ok: true, mensagem: `Link de acesso enviado para ${email}. Ele vale por pouco tempo e funciona uma vez.` };
}

/** Publica uma vaga em nome da conta, como se ela mesma tivesse publicado. */
export async function publicarEmNomeDe(
  usuarioId: string,
  _anterior: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(usuarioId)) return { ok: false, erro: "Conta não encontrada." };
  const { data: perfil } = await c.from("perfis").select("tipo, suspenso_ate").eq("id", usuarioId).maybeSingle();
  if (!perfil) return { ok: false, erro: "Esta conta ainda não tem perfil. Crie o perfil antes de publicar." };
  if (perfil.suspenso_ate && new Date(perfil.suspenso_ate).getTime() > Date.now()) {
    return { ok: false, erro: "A conta está suspensa: não dá para publicar em nome dela." };
  }

  const leitura = lerAnuncio(formData);
  if (!leitura.ok) return { ok: false, erro: "Confira os campos marcados.", erros: leitura.erros };
  const d = leitura.dados;
  if (d.tipo !== "vaga") return { ok: false, erro: "Pelo admin dá para publicar só vagas." };

  const { data, error } = await c
    .from("anuncios")
    .insert({ ...registroDoAnuncio(d), tipo: d.tipo, autor_id: usuarioId })
    .select("id")
    .single();
  if (error) {
    const erro = mensagemDeErro(error);
    if (error.hint === "contratante" || error.hint === "pagamento_ate") {
      return { ok: false, erro: "Confira os campos marcados.", erros: { [error.hint]: erro } };
    }
    return { ok: false, erro };
  }
  await salvarTriagem(c, data.id, d.triagem);

  // a IA revisa o texto logo depois, como em qualquer vaga
  after(processarFilas);
  revalidatePath("/");
  redirect(`/admin/usuarios/${usuarioId}?publicada=${data.id}`);
}

/**
 * Manda um modelo de e-mail para a conta na hora, mesmo com os avisos desligados
 * (para quando a pessoa não recebeu). `dados`: as variáveis do modelo.
 */
export async function enviarEmailParaConta(
  usuarioId: string,
  modelo: string,
  dados: Record<string, string>,
): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(usuarioId) || !/^[a-z_]{3,40}$/.test(modelo)) return { ok: false, erro: "Pedido inválido." };
  const { data: id, error } = await c.rpc("admin_enviar_email", {
    p_usuario: usuarioId,
    p_modelo: modelo,
    p_dados: dados,
  });
  if (error || id == null) return { ok: false, erro: mensagemDeErro(error) };

  const envio = await enviarEmailsPendentes(50);
  const { data: estado } = await c.rpc("admin_status_email", { p_id: id });
  const s = estado?.[0];
  refresh();
  if (s?.status === "enviado") return { ok: true, mensagem: "E-mail enviado. Peça para a pessoa olhar também o spam." };
  if (envio.motivo) return { ok: false, erro: `O e-mail ficou na fila: ${envio.motivo}` };
  if (envio.semEndereco)
    return { ok: false, erro: "O e-mail ficou na fila: falta o endereço do site no ar (PUBLIKE_URL_PUBLICA)." };
  return {
    ok: false,
    erro: `O servidor de e-mail recusou: ${s?.erro ?? envio.erros.find((e) => e.id === id)?.erro ?? "erro desconhecido"}`,
  };
}

/**
 * Mensagem da equipe: chega no sino da conta e, com `email`, também no e-mail (a resposta vai para a
 * equipe). O e-mail sai na hora, como no "Enviar agora".
 */
export async function mandarMensagemDaEquipe(
  contaId: string,
  assunto: string,
  texto: string,
  email: boolean,
): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(contaId)) return { ok: false, erro: "Pedido inválido." };
  const { data, error } = await c.rpc("admin_mandar_mensagem_equipe", {
    p_conta: contaId,
    p_assunto: assunto.slice(0, LIMITES_MENSAGEM_EQUIPE.assunto + 20),
    p_texto: texto.slice(0, LIMITES_MENSAGEM_EQUIPE.texto + 50),
    p_email: email,
  });
  if (error?.code === "PGRST202") return { ok: false, erro: "Rode antes a migração da mensagem da equipe." };
  if (error || !data) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  if (!data.email_id) return { ok: true, mensagem: "Mensagem no sino da conta." };

  const envio = await enviarEmailsPendentes(50);
  const { data: estado } = await c.rpc("admin_status_email", { p_id: data.email_id });
  const s = estado?.[0];
  if (s?.status === "enviado") return { ok: true, mensagem: "Mensagem no sino e no e-mail da conta." };
  if (envio.motivo) return { ok: false, erro: `Foi para o sino, mas o e-mail ficou na fila: ${envio.motivo}` };
  return {
    ok: false,
    erro: `Foi para o sino, mas o servidor de e-mail recusou: ${s?.erro ?? envio.erros.find((e) => e.id === data.email_id)?.erro ?? "erro desconhecido"}`,
  };
}

/** Boas-vindas para quem se cadastrou, não publicou nada e ainda não recebeu. */
export async function enviarBoasVindasPendentes(): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const { data: total, error } = await c.rpc("admin_boas_vindas_pendentes");
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  if (!total) {
    refresh();
    return {
      ok: true,
      mensagem:
        "Ninguém para receber: todo mundo sem anúncio já recebeu, desligou os avisos ou não tem e-mail confirmado.",
    };
  }
  const envio = await enviarEmailsPendentes(50);
  refresh();
  if (envio.motivo) return { ok: false, erro: `${total} e-mail(s) ficaram na fila: ${envio.motivo}` };
  const falhas = envio.falhas ? ` ${envio.falhas} falharam: veja em E-mails.` : "";
  return { ok: true, mensagem: `Boas-vindas enviadas para ${total} conta(s).${falhas}` };
}

/** Monta (ou atualiza) a vitrine de serviços da conta, com as regras de "Meus serviços". */
export async function salvarServicosEmNomeDe(
  usuarioId: string,
  _anterior: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(usuarioId)) return { ok: false, erro: "Conta não encontrada." };

  const leitura = lerServicos(formData);
  if (!leitura.ok) return { ok: false, erro: "Confira os campos marcados.", erros: leitura.erros };
  const d = leitura.dados;
  // pelo admin não sobe foto nova: só ficam as que já estão na pasta da conta
  if (d.servicos.some((s) => s.fotos.some((f) => !f.startsWith(`${usuarioId}/`)))) {
    return { ok: false, erro: "Pelo admin não dá para enviar fotos." };
  }
  const atende = areasSemRepetir(d.atende);

  const { error } = await c.rpc("admin_salvar_servicos_de", {
    p_usuario: usuarioId,
    p_servicos: d.servicos.map((s) => ({
      ...(s.id ? { id: s.id } : {}),
      oficio: s.oficio,
      categoria: s.categoria,
      titulo: s.titulo,
      descricao: s.descricao,
      pagamento_valor: s.pagamento_valor,
      pagamento_unidade: s.pagamento_unidade,
      fotos: s.fotos,
    })),
    p_cidade: d.cidade,
    p_bairro: d.bairro,
    p_lat: d.lat,
    p_lng: d.lng,
    p_atende: atende,
    p_horario: d.horario,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não foi possível salvar a vitrine agora.") };
  await salvarContatoDireto(c, usuarioId, formData);

  // fotos que nenhum serviço usa mais saem do Storage (como em "Meus serviços")
  const { data: todos } = await c.from("anuncios").select("fotos").eq("autor_id", usuarioId);
  await limparFotosDeTrabalho(
    c,
    usuarioId,
    (todos ?? []).flatMap((a) => a.fotos),
  );
  after(processarFilas);
  revalidatePath("/");
  redirect(`/admin/usuarios/${usuarioId}?servicos=1`);
}

// ------------------------------------------------------------------ acesso da conta

/** "(62) 99999-0000" → "5562999990000" (o Supabase guarda assim). Vazio: null. */
function telefoneDeLogin(valor: string): string | null | "invalido" {
  let d = valor.replace(/\D/g, "");
  if (!d) return null;
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return /^\d{10,11}$/.test(d) ? `55${d}` : "invalido";
}

/**
 * Troca o e-mail e o celular de login da conta (já confirmados: a equipe
 * conferiu com a pessoa) e, se pedido, o contato que aparece nos matches.
 */
export async function alterarLoginPeloAdmin(
  usuarioId: string,
  _anterior: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(usuarioId)) return { ok: false, erro: "Pedido inválido." };

  const { data: atual, error: erroLer } = await c.auth.admin.getUserById(usuarioId);
  if (erroLer || !atual?.user) return { ok: false, erro: "Conta não encontrada." };

  const email = String(formData.get("email_login") ?? "")
    .trim()
    .toLowerCase();
  const telefone = telefoneDeLogin(String(formData.get("telefone_login") ?? ""));
  const erros: Record<string, string> = {};
  if (email && !EMAIL.test(email)) erros.email_login = "Confira o e-mail.";
  if (telefone === "invalido") erros.telefone_login = "Use o DDD e o número, como (62) 99999-0000.";
  if (!email && !telefone) erros.email_login = "A conta precisa de um e-mail ou de um celular para entrar.";
  if (Object.keys(erros).length) return { ok: false, erro: "Confira os campos marcados.", erros };

  const mudarEmail = email && email !== (atual.user.email ?? "").toLowerCase();
  const mudarTelefone = telefone && telefone !== "invalido" && telefone !== (atual.user.phone ?? "");
  if (!mudarEmail && !mudarTelefone && formData.get("atualizar_contato") !== "on") {
    return { ok: false, erro: "Nada mudou." };
  }
  if (mudarEmail) {
    const dono = await contaDoEmail(c, email);
    if (dono && dono !== usuarioId) {
      return {
        ok: false,
        erro: "Confira os campos marcados.",
        erros: { email_login: "Esse e-mail já é de outra conta." },
      };
    }
  }

  if (mudarEmail || mudarTelefone) {
    const { error } = await c.auth.admin.updateUserById(usuarioId, {
      ...(mudarEmail ? { email, email_confirm: true } : {}),
      ...(mudarTelefone ? { phone: telefone as string, phone_confirm: true } : {}),
    });
    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes("phone")) {
        return {
          ok: false,
          erro: "Confira os campos marcados.",
          erros: { telefone_login: "Esse celular já é de outra conta." },
        };
      }
      if (m.includes("email")) {
        return {
          ok: false,
          erro: "Confira os campos marcados.",
          erros: { email_login: "Esse e-mail já é de outra conta." },
        };
      }
      return { ok: false, erro: `O Supabase não trocou: ${error.message}` };
    }
  }

  // o contato dos matches acompanha, se pedido (WhatsApp = celular de login)
  if (formData.get("atualizar_contato") === "on") {
    const contato: { email?: string; whatsapp?: string } = {};
    if (email) contato.email = email;
    if (telefone && telefone !== "invalido") contato.whatsapp = telefone;
    if (Object.keys(contato).length) {
      const { error } = await c.from("contatos").update(contato).eq("perfil_id", usuarioId);
      if (error) return { ok: false, erro: `O login mudou, mas o contato não: ${mensagemDeErro(error)}` };
    }
  }

  refresh();
  const partes = [mudarEmail && `e-mail de login: ${email}`, mudarTelefone && "celular de login trocado"].filter(
    Boolean,
  );
  return {
    ok: true,
    mensagem: partes.length ? `Pronto (${partes.join("; ")}). Agora mande o link de acesso.` : "Contato atualizado.",
  };
}

/**
 * Um link de entrar para a equipe mandar à pessoa por outro caminho (WhatsApp),
 * quando o e-mail não chega. Vale uma vez e por pouco tempo.
 */
export async function gerarLinkDeAcesso(usuarioId: string): Promise<Resultado & { link?: string }> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(usuarioId)) return { ok: false, erro: "Pedido inválido." };
  const site = urlDosEmails();
  if (!site) return { ok: false, erro: "Falta o endereço do site no ar (PUBLIKE_URL_PUBLICA) para montar o link." };
  const { data: u } = await c.auth.admin.getUserById(usuarioId);
  const conta = u?.user;
  const email = conta?.email;
  if (!conta || !email) {
    return { ok: false, erro: "A conta não tem e-mail de login. Coloque um e-mail acima e tente de novo." };
  }
  if (conta.banned_until && new Date(conta.banned_until).getTime() > Date.now()) {
    return { ok: false, erro: "A conta está suspensa: o link não funcionaria." };
  }
  const { data, error } = await c.auth.admin.generateLink({ type: "magiclink", email });
  const token = data?.properties?.hashed_token;
  if (error || !token) return { ok: false, erro: "O Supabase não gerou o link agora. Tente de novo." };
  const proximo = conta.last_sign_in_at ? "/painel" : "/perfil?completar=1&next=/painel";
  const params = new URLSearchParams({ token_hash: token, type: "magiclink", next: proximo });
  return { ok: true, mensagem: "Link gerado.", link: `${site}/auth/callback?${params}` };
}

/**
 * Conta sem e-mail (criada pelo admin, a empresa disse "sim" no WhatsApp): gera o link /acesso/<token>
 * e a mensagem para o WhatsApp de contato. A empresa abre, coloca o e-mail e entra com ele.
 */
export async function gerarAcessoPorWhatsapp(
  usuarioId: string,
): Promise<{ ok: true; link: string; whatsapp: string; mensagem: string } | { ok: false; erro: string }> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(usuarioId)) return { ok: false, erro: "Pedido inválido." };
  const { data: u } = await c.auth.admin.getUserById(usuarioId);
  if (!u?.user) return { ok: false, erro: "Conta não encontrada." };
  if (u.user.email) return { ok: false, erro: `A conta já entra pelo e-mail ${u.user.email}: use Enviar acesso.` };
  const [{ data: perfil }, { data: contato }, { data: anuncio }] = await Promise.all([
    c.from("perfis").select("nome").eq("id", usuarioId).maybeSingle(),
    c.from("contatos").select("whatsapp").eq("perfil_id", usuarioId).maybeSingle(),
    c
      .from("anuncios")
      .select("id, titulo, tipo")
      .eq("autor_id", usuarioId)
      .order("tipo", { ascending: false }) // a vaga antes do serviço
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!perfil) return { ok: false, erro: "Esta conta ainda não tem perfil." };
  if (!contato?.whatsapp) return { ok: false, erro: "A conta não tem WhatsApp de contato." };
  const token = randomBytes(32).toString("hex");
  const { error } = await c.from("acessos_conta").insert({ token, perfil_id: usuarioId });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para gerar o link. A migração já rodou?") };
  const site = urlDosEmails() ?? "https://publike.org";
  const link = `${site}/acesso/${token}`;
  const fim = "O link vale por 30 dias e só uma vez. Qualquer dúvida, é só responder aqui.";
  // vitrine de serviços (prestador): a mensagem é para a pessoa, não para a empresa
  const mensagem = (
    anuncio?.tipo === "servico"
      ? [
          `Olá, ${perfil.nome}! Aqui é do Publike.`,
          `Sua vitrine de serviços já está no ar: ${site}/anuncio/${anuncio.id}`,
          `Para colocar fotos dos seus trabalhos e cuidar da vitrine, abra este link e coloque o seu e-mail (é por ele que você entra, sem senha):\n${link}`,
          fim,
        ]
      : [
          `Olá, pessoal da ${perfil.nome}! Aqui é do Publike.`,
          anuncio
            ? `A vaga de ${anuncio.titulo} já está no ar: ${site}/anuncio/${anuncio.id}`
            : "A conta de vocês no Publike já está pronta.",
          `Para ver os candidatos e cuidar da vaga, abra este link e coloque o e-mail da empresa (é por ele que vocês entram, sem senha):\n${link}`,
          fim,
        ]
  ).join("\n\n");
  return { ok: true, link, whatsapp: contato.whatsapp, mensagem };
}
