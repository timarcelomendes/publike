"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import nodemailer from "nodemailer";
import {
  emailDoConvite,
  limparTelefone,
  rascunhoValido,
  STATUS_CONVITE,
  type Convite,
  type NovoConvite,
  type StatusConvite,
} from "@/lib/convites";
import { configSmtp, urlDosEmails } from "@/lib/servidor/ambiente";
import { mensagemDeErro } from "@/lib/erros";
import { ErroIA, iaConfigurada, MODELO_PADRAO } from "@/lib/ia/openai";
import { lerVagaDaImagem } from "@/lib/ia/vaga-da-imagem";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import type { EstadoForm, Resultado } from "@/lib/tipos";
import { errosPorCampo, lerAnuncio, lerPerfil, lerServicos, registroDoAnuncio, UUID } from "@/lib/validacao";
import { centroDoBairro } from "@/lib/servidor/cep";
import { ajustarErros, completarAnuncio } from "@/lib/servidor/completar-anuncio";
import { salvarContatoDireto } from "@/lib/servidor/contato-direto";
import { processarFilas } from "@/lib/servidor/filas";
import { salvarTriagem } from "@/lib/servidor/triagem";
import { areasSemRepetir } from "@/lib/constantes";
import { PRACA_PADRAO } from "@/lib/pracas";

// Convites às empresas: importar a lista, marcar a situação e anotar. Só no admin.

const FORA = "O admin só funciona no seu computador, com o site rodando em modo de desenvolvimento.";
const TEL = /^\d{10,11}$/;

function conferir(n: NovoConvite): NovoConvite | null {
  const nome = String(n?.nome ?? "").trim();
  if (nome.length < 2 || nome.length > 120) return null;
  const lista = (v: unknown, max: number, tam: number) =>
    Array.isArray(v)
      ? v
          .map((x) => String(x).trim().slice(0, tam))
          .filter(Boolean)
          .slice(0, max)
      : [];
  const whatsapp = lista(n.whatsapp, 5, 11).filter((t) => TEL.test(t));
  const telefones = lista(n.telefones, 5, 11).filter((t) => TEL.test(t));
  const email =
    typeof n.email === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(n.email) ? n.email.slice(0, 200) : null;
  return {
    nome,
    tipo: n.tipo === "agencia" || n.tipo === "prestador" ? n.tipo : "empresa",
    vagas: lista(n.vagas, 20, 80),
    whatsapp,
    telefones,
    email,
    observacao: typeof n.observacao === "string" && n.observacao.trim() ? n.observacao.trim().slice(0, 500) : null,
    rascunho: rascunhoValido(n.rascunho),
    origem: n.origem === "imagem" ? "imagem" : "arquivo",
  };
}

/** Importa as empresas do arquivo. Quem já está na lista (mesmo nome) fica como está. */
export async function importarConvites(itens: NovoConvite[]): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!Array.isArray(itens) || !itens.length)
    return { ok: false, erro: "O arquivo não tem nenhuma empresa para importar." };
  if (itens.length > 500) return { ok: false, erro: "São mais de 500 empresas: divida o arquivo em partes." };
  const limpos = itens.map(conferir).filter((n): n is NovoConvite => Boolean(n));

  const { data: atuais, error: erroLer } = await c.from("convites").select("nome");
  if (erroLer)
    return { ok: false, erro: mensagemDeErro(erroLer, "Não deu para ler a lista. A migração dos convites já rodou?") };
  const chave = (s: string) => s.trim().toLowerCase();
  const existentes = new Set((atuais ?? []).map((a) => chave(a.nome)));
  const novos = limpos.filter((n) => !existentes.has(chave(n.nome)));
  if (novos.length) {
    const { error } = await c.from("convites").insert(novos);
    if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para importar agora.") };
  }
  refresh();
  const repetidas = limpos.length - novos.length;
  return {
    ok: true,
    mensagem:
      `${novos.length === 1 ? "1 convite entrou" : `${novos.length} convites entraram`} na lista.` +
      (repetidas ? ` ${repetidas === 1 ? "1 já estava" : `${repetidas} já estavam`} e ficaram como estavam.` : ""),
  };
}

/** Muda a situação do convite (e guarda quando foi enviado). */
export async function mudarConvite(id: string, status: StatusConvite): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id) || !STATUS_CONVITE.includes(status)) return { ok: false, erro: "Pedido inválido." };
  const { data: antes } = await c.from("convites").select("status, enviada_em").eq("id", id).maybeSingle();
  if (!antes) return { ok: false, erro: "Este convite não existe mais. Atualize a página." };
  const mudanca: { status: StatusConvite; enviada_em?: string } = { status };
  if (status === "enviada" && !antes.enviada_em) mudanca.enviada_em = new Date().toISOString();
  const { error } = await c.from("convites").update(mudanca).eq("id", id);
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true };
}

export async function anotarConvite(id: string, nota: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c
    .from("convites")
    .update({ nota: nota.trim().slice(0, 500) || null })
    .eq("id", id);
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  return { ok: true, mensagem: "Anotação salva." };
}

export async function apagarConvite(id: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.from("convites").delete().eq("id", id);
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true };
}

/**
 * Lê a imagem de um anúncio de vaga com a IA e devolve a empresa pronta para importar
 * (ou o motivo de ter ficado de fora). Nada é salvo: o admin confere antes de importar.
 */
export async function lerConviteDaImagem(
  imagem: string,
  nomeArquivo: string,
): Promise<{ ok: true; convite: NovoConvite } | { ok: false; erro: string }> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (typeof imagem !== "string" || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(imagem))
    return { ok: false, erro: "Arquivo que não é imagem." };
  if (imagem.length > 2_000_000) return { ok: false, erro: "Imagem grande demais." };
  if (!iaConfigurada()) return { ok: false, erro: "Falta a chave da IA (OPENAI_API_KEY) no .env.local." };
  const { data: cfg } = await c.from("config_site").select("ia_modelo").limit(1).maybeSingle();
  let lida;
  try {
    lida = await lerVagaDaImagem(imagem, String(nomeArquivo ?? ""), cfg?.ia_modelo ?? MODELO_PADRAO);
  } catch (e) {
    return { ok: false, erro: e instanceof ErroIA ? e.message : "A IA não conseguiu ler esta imagem." };
  }
  const servico = Boolean(lida.e_servico) && !lida.e_vaga;
  if (!lida.e_vaga && !servico)
    return { ok: false, erro: `Não parece anúncio de vaga nem de serviço${lida.motivo ? `: ${lida.motivo}` : "."}` };
  const nome = (lida.empresa || "").replace(/\s+/g, " ").trim();
  if (nome.length < 2) return { ok: false, erro: "A imagem não diz o nome da empresa." };
  const fones = (l: unknown) =>
    [
      ...new Set(
        (Array.isArray(l) ? l : []).map((t) => limparTelefone(String(t))).filter((t): t is string => Boolean(t)),
      ),
    ].slice(0, 5);
  const whatsapp = fones(lida.whatsapp);
  const telefones = fones(lida.telefones).filter((t) => !whatsapp.includes(t));
  const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lida.email ?? "") ? lida.email.toLowerCase().slice(0, 200) : null;
  if (!whatsapp.length && !telefones.length && !email)
    return { ok: false, erro: `${nome}: a imagem não tem WhatsApp, telefone ou e-mail.` };
  const rascunho = rascunhoValido(lida.vaga);
  const cargos = (Array.isArray(lida.cargos) ? lida.cargos : [])
    .map((v) => String(v).trim().slice(0, 80))
    .filter(Boolean);
  return {
    ok: true,
    convite: {
      nome: nome.slice(0, 120),
      tipo: servico ? "prestador" : lida.tipo === "agencia" ? "agencia" : "empresa",
      vagas: [...new Set(cargos.length ? cargos : rascunho ? [rascunho.titulo] : [])].slice(0, 20),
      whatsapp,
      telefones,
      email,
      observacao: `Lida da imagem ${String(nomeArquivo ?? "").slice(0, 80)}`.trim(),
      rascunho,
      origem: "imagem",
    },
  };
}

/**
 * Manda o convite por e-mail direto pelo Publike (o mesmo SMTP dos avisos do site): sem depender
 * do programa de e-mail do computador. Deu certo: o convite fica como "Enviei".
 */
export async function enviarConviteEmail(id: string, assinatura: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const smtp = configSmtp();
  if (!smtp)
    return {
      ok: false,
      erro: "O envio de e-mail não está configurado neste computador (SMTP no .env.local). Use Copiar mensagem.",
    };
  const { data: conv } = await c.from("convites").select("*").eq("id", id).maybeSingle();
  if (!conv) return { ok: false, erro: "Este convite não existe mais. Atualize a página." };
  const convite = conv as unknown as Convite;
  const para = convite.email;
  if (!para) return { ok: false, erro: "Este convite não tem e-mail." };
  const { assunto, texto, html } = emailDoConvite(
    convite,
    String(assinatura ?? ""),
    urlDosEmails() ?? "https://publike.org",
  );
  const transporte = nodemailer.createTransport({
    host: smtp.servidor,
    port: smtp.porta,
    secure: smtp.seguro,
    requireTLS: !smtp.seguro,
    auth: { user: smtp.usuario, pass: smtp.senha },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  try {
    await transporte.sendMail({
      from: { name: "Publike", address: smtp.remetente },
      to: para,
      subject: assunto,
      text: texto,
      html,
    });
  } catch (e) {
    console.error("Publike: o convite por e-mail não saiu:", e instanceof Error ? e.message : String(e));
    return { ok: false, erro: "O e-mail não saiu. Confira o SMTP no .env.local ou use Copiar mensagem." };
  } finally {
    transporte.close();
  }
  if (convite.status === "a_enviar") {
    await c.from("convites").update({ status: "enviada", enviada_em: new Date().toISOString() }).eq("id", id);
  }
  refresh();
  return { ok: true, mensagem: `E-mail enviado para ${para}.` };
}

/**
 * A empresa disse "sim" (no WhatsApp ou por e-mail) mas não abriu o link: o admin publica por ela.
 * Cria a conta da empresa se ainda não tiver (login pelo e-mail, ou pelo WhatsApp), publica a vaga
 * em nome dela e marca o convite como Autorizou, guardando como foi o aceite.
 * Os campos da conta vêm com "conta_" (o formulário da vaga já usa cidade e bairro).
 */
export async function publicarConvitePeloAdmin(
  conviteId: string,
  _anterior: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(conviteId)) return { ok: false, erro: "Convite não encontrado." };
  const { data: conv } = await c.from("convites").select("*").eq("id", conviteId).maybeSingle();
  if (!conv) return { ok: false, erro: "Este convite não existe mais." };
  const convite = conv as unknown as Convite;
  if (formData.get("autorizou") !== "on") {
    return { ok: false, erro: `Marque que ${convite.nome} autorizou a publicação antes de publicar.` };
  }
  const comoAutorizou = String(formData.get("como_autorizou") ?? "")
    .trim()
    .slice(0, 300);

  // a vaga primeiro: com erro nela, nenhuma conta é criada (sem categoria, descrição ou ponto no
  // mapa, completa como na publicação normal)
  const trocas = await completarAnuncio(formData);
  const leitura = lerAnuncio(formData);
  if (!leitura.ok)
    return { ok: false, erro: "Confira os campos marcados.", erros: ajustarErros(leitura.erros, trocas) };
  const d = leitura.dados;
  if (d.tipo !== "vaga") return { ok: false, erro: "Pelo convite dá para publicar só vagas." };

  // a conta da empresa: a do convite, a que já usa o e-mail, ou uma nova
  const conta = await garantirConta(c, convite, formData, d.cidade, d.bairro ?? "");
  if ("erro" in conta) return { ok: false, erro: conta.erro };
  const { id: contaId, semEmail } = conta;

  const { data: anuncio, error } = await c
    .from("anuncios")
    .insert({ ...registroDoAnuncio(d), tipo: d.tipo, autor_id: contaId })
    .select("id")
    .single();
  if (error) {
    const erro = mensagemDeErro(error);
    if (error.hint === "contratante" || error.hint === "pagamento_ate") {
      return { ok: false, erro: "Confira os campos marcados.", erros: { [error.hint]: erro } };
    }
    return { ok: false, erro };
  }
  await salvarTriagem(c, anuncio.id, d.triagem);

  const quando = new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  const registro = `Autorizou em ${quando} (publicada pelo admin)${comoAutorizou ? `: ${comoAutorizou}` : "."}`;
  await c
    .from("convites")
    .update({
      status: "autorizou",
      usuario_id: contaId,
      anuncio_id: anuncio.id,
      aceite_em: new Date().toISOString(),
      nota: [registro, convite.nota].filter(Boolean).join(" · ").slice(0, 500),
    })
    .eq("id", conviteId);

  // a IA revisa o texto, como em qualquer vaga; a conta nova avisa a equipe
  after(processarFilas);
  revalidatePath("/");
  redirect(`/admin/usuarios/${contaId}?publicada=${anuncio.id}${semEmail ? "&sem_email=1" : ""}`);
}

/**
 * O prestador disse "sim" ao convite: o admin confere os serviços lidos do anúncio e monta a vitrine
 * no nome dele (a conta é criada aqui, se ainda não existir). O convite fica como Autorizou.
 */
export async function montarVitrinePeloAdmin(
  conviteId: string,
  _anterior: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(conviteId)) return { ok: false, erro: "Convite não encontrado." };
  const { data: conv } = await c.from("convites").select("*").eq("id", conviteId).maybeSingle();
  if (!conv) return { ok: false, erro: "Este convite não existe mais." };
  const convite = conv as unknown as Convite;
  if (formData.get("autorizou") !== "on") {
    return { ok: false, erro: `Marque que ${convite.nome} autorizou a publicação antes de salvar.` };
  }
  const comoAutorizou = String(formData.get("como_autorizou") ?? "")
    .trim()
    .slice(0, 300);

  // sem ponto no mapa, o meio do bairro (como na publicação de vaga)
  const bairro = String(formData.get("bairro") ?? "").trim();
  const cidade = String(formData.get("cidade") ?? "").trim() || PRACA_PADRAO.cidade;
  if ((!formData.get("lat") || !formData.get("lng")) && bairro) {
    const centro = await centroDoBairro(bairro, cidade).catch(() => null);
    if (centro) {
      formData.set("lat", String(centro.lat));
      formData.set("lng", String(centro.lng));
    }
  }
  // os serviços primeiro: com erro neles, nenhuma conta é criada
  const leitura = lerServicos(formData);
  if (!leitura.ok) return { ok: false, erro: "Confira os campos marcados.", erros: leitura.erros };
  const d = leitura.dados;
  if (d.servicos.some((s) => s.fotos.length > 0)) return { ok: false, erro: "Pelo admin não dá para enviar fotos." };

  const conta = await garantirConta(c, convite, formData, d.cidade, d.bairro);
  if ("erro" in conta) return { ok: false, erro: conta.erro };
  const { id: contaId, semEmail } = conta;

  const atende = areasSemRepetir(d.atende);
  const { error } = await c.rpc("admin_salvar_servicos_de", {
    p_usuario: contaId,
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
  await salvarContatoDireto(c, contaId, formData);

  const { data: ultimo } = await c
    .from("anuncios")
    .select("id")
    .eq("autor_id", contaId)
    .eq("tipo", "servico")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  const quando = new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  const registro = `Autorizou em ${quando} (vitrine montada pelo admin)${comoAutorizou ? `: ${comoAutorizou}` : "."}`;
  await c
    .from("convites")
    .update({
      status: "autorizou",
      usuario_id: contaId,
      anuncio_id: ultimo?.id ?? convite.anuncio_id,
      aceite_em: new Date().toISOString(),
      nota: [registro, convite.nota].filter(Boolean).join(" · ").slice(0, 500),
    })
    .eq("id", convite.id);
  after(processarFilas);
  revalidatePath("/");
  redirect(`/admin/usuarios/${contaId}?servicos=1${semEmail ? "&sem_email=1" : ""}`);
}

/**
 * A conta de quem disse "sim": a do convite, a que já usa o e-mail, ou uma nova (login pelo e-mail,
 * ou pelo WhatsApp quando não tem e-mail). Os campos vêm com "conta_" no formulário.
 */
async function garantirConta(
  c: NonNullable<Awaited<ReturnType<typeof clienteAdminOuNulo>>>,
  convite: Convite,
  formData: FormData,
  cidade: string,
  bairro: string,
): Promise<{ id: string; semEmail: boolean } | { erro: string }> {
  let contaId: string | null = null;
  // conta nova sem e-mail: ainda não tem como entrar (o login é só pelo e-mail)
  let semEmail = false;
  if (convite.usuario_id) {
    const { data: p } = await c.from("perfis").select("id").eq("id", convite.usuario_id).maybeSingle();
    contaId = p?.id ?? null;
  }
  if (!contaId) {
    const perfil = new FormData();
    perfil.set("nome", String(formData.get("conta_nome") ?? ""));
    perfil.set("tipo", String(formData.get("conta_tipo") ?? ""));
    perfil.set("whatsapp", String(formData.get("conta_whatsapp") ?? ""));
    perfil.set("email", String(formData.get("conta_email") ?? ""));
    perfil.set("cnpj", String(formData.get("conta_cnpj") ?? ""));
    perfil.set("cidade", cidade);
    perfil.set("bairro", bairro);
    perfil.set("receber_emails", "on");
    const lp = lerPerfil(perfil);
    if (!lp.success) {
      const e = errosPorCampo(lp.error);
      const [campo, msg] = Object.entries(e)[0] ?? ["", "Confira os dados da conta."];
      const nomes: Record<string, string> = {
        nome: "nome",
        whatsapp: "WhatsApp",
        email: "e-mail",
        cnpj: "CNPJ",
        tipo: "tipo",
      };
      return { erro: `Conta (${nomes[campo] ?? campo}): ${msg}` };
    }
    const p = lp.data;
    if (p.email) {
      const { data: achados } = await c.rpc("admin_listar_usuarios", {
        p_busca: p.email,
        p_filtro: "todos",
        p_limite: 20,
      });
      contaId = achados?.find((u) => u.email?.toLowerCase() === p.email)?.id ?? null;
    }
    if (!contaId) {
      const { data: criado, error: erroLogin } = await c.auth.admin.createUser(
        p.email
          ? { email: p.email, email_confirm: true, user_metadata: { name: p.nome, criada_pela_equipe: true } }
          : { phone: p.whatsapp, phone_confirm: true, user_metadata: { name: p.nome, criada_pela_equipe: true } },
      );
      if (erroLogin || !criado.user) {
        return {
          erro: `O Supabase não criou a conta: ${erroLogin?.message ?? "erro desconhecido"}. Se já existe uma conta, use a página dela em Usuários.`,
        };
      }
      const id = criado.user.id;
      const { error: erroPerfil } = await c
        .from("perfis")
        .insert({ id, nome: p.nome, tipo: p.tipo, cidade: p.cidade, bairro: p.bairro, sobre: null, cnpj: p.cnpj });
      const { error: erroContato } = erroPerfil
        ? { error: null }
        : await c
            .from("contatos")
            .insert({ perfil_id: id, whatsapp: p.whatsapp, email: p.email, receber_emails: true });
      if (erroPerfil ?? erroContato) {
        await c.auth.admin.deleteUser(id);
        return { erro: `Conta: ${mensagemDeErro((erroPerfil ?? erroContato)!)}` };
      }
      contaId = id;
      semEmail = !p.email;
    }
  }
  if (!contaId) return { erro: "Não deu para achar nem criar a conta." };
  return { id: contaId, semEmail };
}
