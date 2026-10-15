"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { mensagemDeErro } from "@/lib/erros";
import { mandarEmailDeAcesso } from "@/lib/servidor/email-acesso";
import { processarFilas } from "@/lib/servidor/filas";
import { clienteAdminOuNulo, type ClienteBanco } from "@/lib/supabase/admin";
import type { EstadoForm, Resultado } from "@/lib/tipos";
import { errosPorCampo, lerAnuncio, lerPerfil, registroDoAnuncio, UUID } from "@/lib/validacao";

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

  let aviso = "";
  if (formData.get("enviar_acesso") === "on") {
    const envio = await mandarEmailDeAcesso(c, { email: login, nome: d.nome, primeiro: true, vagas: 0 });
    aviso = envio.ok ? "&acesso=1" : `&acesso=0&erro_acesso=${encodeURIComponent(envio.erro)}`;
  }
  revalidatePath("/admin/usuarios");
  redirect(`/admin/usuarios/${id}?criada=1${aviso}`);
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

  const [{ data: perfil }, { count }] = await Promise.all([
    c.from("perfis").select("nome").eq("id", usuarioId).maybeSingle(),
    c.from("anuncios").select("id", { count: "exact", head: true }).eq("autor_id", usuarioId).eq("status", "ativo"),
  ]);
  const envio = await mandarEmailDeAcesso(c, {
    email,
    nome: perfil?.nome ?? "tudo bem",
    // nunca entrou: vai o texto de boas-vindas, que passa pelo perfil para aceitar as regras
    primeiro: !data.user.last_sign_in_at,
    vagas: count ?? 0,
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

  // a IA revisa o texto logo depois, como em qualquer vaga
  after(processarFilas);
  revalidatePath("/");
  redirect(`/admin/usuarios/${usuarioId}?publicada=${data.id}`);
}
