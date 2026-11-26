"use server";

import { diaADiaDoFormulario } from "@/lib/jeito-de-trabalhar";
import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import {
  emailDoConvite,
  limparTelefone,
  linkDasVagas,
  MENSAGENS_CONVITE,
  mensagemDoConvite,
  mensagensDoConvite,
  rascunhoValido,
  STATUS_CONVITE,
  vagasNaGupy,
  type Convite,
  type MensagemConvite,
  type NovoConvite,
  type StatusConvite,
} from "@/lib/convites";
import { CIDADES } from "@/lib/constantes";
import { paginaDeVagasDaGupy } from "@/lib/gupy";
import { urlDosEmails } from "@/lib/servidor/ambiente";
import { mensagemDeErro } from "@/lib/erros";
import { ErroIA, iaConfigurada } from "@/lib/ia/openai";
import { lerVagas } from "@/lib/ia/ler-vagas";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import type { EstadoForm, Resultado } from "@/lib/tipos";
import { errosPorCampo, lerAnuncio, lerPerfil, lerServicos, registroDoAnuncio, UUID } from "@/lib/validacao";
import { centroDoBairro } from "@/lib/servidor/cep";
import { ajustarErros, completarAnuncio } from "@/lib/servidor/completar-anuncio";
import { salvarContatoDireto } from "@/lib/servidor/contato-direto";
import { processarFilas } from "@/lib/servidor/filas";
import { salvarTriagem } from "@/lib/servidor/triagem";
import { mandarPelaCaixa } from "@/lib/servidor/email-empresas";
import { areasSemRepetir, oficio as dadosDoOficio } from "@/lib/constantes";
import { tituloDaFuncao } from "@/lib/funcao-cbo";
import { oficioDoRamo } from "@/lib/ramos-prestadores";
import { PRACA_PADRAO } from "@/lib/pracas";
import { gravarVaga } from "@/lib/servidor/comeca-ja";
import { modeloPara } from "@/lib/ia/funcionalidades";
import { emailCorrigido, emailValido } from "@/lib/email-valido";
import { telefoneDoLogin } from "@/lib/telefone-login";

// Convites às empresas: importar a lista, marcar a situação e anotar. Só no admin.

const FORA = "O admin só funciona no seu computador, com o site rodando em modo de desenvolvimento.";
const TEL = /^\d{10,11}$/;
// o link das vagas e a escolha da mensagem (sem a migração, o PostgREST não conhece as colunas)
const MIGRACAO_SITE = "20270724120000_convites_vagas_no_site.sql";
const semColuna = (e: { code?: string } | null) => e?.code === "PGRST204" || e?.code === "42703";

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
    emailValido(n.email) ? n.email.trim().slice(0, 200) : null;
  // quem já foi chamado (colunas situacao e enviado_em do arquivo): a situação e o dia, nunca no futuro
  const status = n.status && STATUS_CONVITE.includes(n.status) ? n.status : "a_enviar";
  const dia = typeof n.enviada_em === "string" ? Date.parse(n.enviada_em) : NaN;
  const enviada_em =
    status !== "a_enviar" && Number.isFinite(dia) && dia <= Date.now() + 864e5 ? new Date(dia).toISOString() : null;
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
    // todas as linhas com as mesmas colunas (o insert em lote usa as colunas da lista)
    link_vagas: linkDasVagas(typeof n.link_vagas === "string" ? n.link_vagas : null),
    status,
    enviada_em,
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

  // o link das vagas só existe depois da migração 20270724120000: sem ela, lê só o nome
  let comColuna = true;
  let leitura = await c.from("convites").select("id, nome, link_vagas");
  if (semColuna(leitura.error)) {
    comColuna = false;
    leitura = (await c.from("convites").select("id, nome")) as typeof leitura;
  }
  const { data: atuais, error: erroLer } = leitura;
  if (erroLer)
    return { ok: false, erro: mensagemDeErro(erroLer, "Não deu para ler a lista. A migração dos convites já rodou?") };
  // a mesma chave do banco (convites_nome_idx: lower(btrim(nome))), com os espaços de dentro juntos
  const chave = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const existentes = new Map((atuais ?? []).map((a) => [chave(a.nome), a]));
  // a mesma empresa duas vezes no mesmo lote (26/11/2026: "Isso já foi feito antes." e nada entrava): um convite só,
  // com as vagas e os contatos juntos
  const doLote = new Map<string, NovoConvite>();
  for (const n of limpos) {
    if (existentes.has(chave(n.nome))) continue;
    const igual = doLote.get(chave(n.nome));
    if (!igual) {
      doLote.set(chave(n.nome), { ...n, nome: n.nome.replace(/\s+/g, " ").trim() });
      continue;
    }
    doLote.set(chave(n.nome), {
      ...igual,
      vagas: [...new Set([...igual.vagas, ...n.vagas])].slice(0, 20),
      whatsapp: [...new Set([...igual.whatsapp, ...n.whatsapp])].slice(0, 5),
      telefones: [...new Set([...igual.telefones, ...n.telefones])].slice(0, 5),
      email: igual.email ?? n.email,
      rascunho: igual.rascunho ?? n.rascunho,
      link_vagas: igual.link_vagas ?? n.link_vagas,
    });
  }
  const novos = [...doLote.values()];
  const semLink = !comColuna && limpos.some((n) => n.link_vagas);
  let jaNaLista = 0;
  if (novos.length) {
    const linhas = comColuna
      ? novos
      : novos.map((n) => {
          const resto = { ...n };
          delete resto.link_vagas;
          return resto;
        });
    const { error } = await c.from("convites").insert(linhas);
    // alguém entrou na lista no meio (outra aba, dois cliques): um por um, e o repetido fica de fora
    if (error?.code === "23505") {
      for (const linha of linhas) {
        const { error: erroDeUm } = await c.from("convites").insert(linha);
        if (erroDeUm?.code === "23505") jaNaLista++;
        else if (erroDeUm) return { ok: false, erro: mensagemDeErro(erroDeUm, "Não deu para importar agora.") };
      }
    } else if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para importar agora.") };
  }
  // quem já estava e ganhou no arquivo o link das vagas: só o link entra (o resto fica como estava)
  let linksNovos = 0;
  if (comColuna) {
    for (const n of limpos) {
      const atual = existentes.get(chave(n.nome));
      if (!atual || !n.link_vagas || atual.link_vagas) continue;
      const { error } = await c.from("convites").update({ link_vagas: n.link_vagas }).eq("id", atual.id);
      if (!error) linksNovos++;
    }
  }
  refresh();
  const entraram = novos.length - jaNaLista;
  const repetidas = limpos.filter((n) => existentes.has(chave(n.nome))).length + jaNaLista;
  // a mesma empresa mais de uma vez no lote: virou um convite só
  const juntadas = limpos.length - entraram - repetidas;
  return {
    ok: true,
    mensagem:
      `${entraram === 1 ? "1 convite entrou" : `${entraram} convites entraram`} na lista.` +
      (juntadas > 0 ? ` ${juntadas === 1 ? "1 empresa repetida no lote foi juntada" : `${juntadas} empresas repetidas no lote foram juntadas`}.` : "") +
      (repetidas
        ? ` ${repetidas === 1 ? "1 já estava e ficou como estava" : `${repetidas} já estavam e ficaram como estavam`}`
        : "") +
      (repetidas && linksNovos ? `, ${linksNovos === 1 ? "1 ganhou" : `${linksNovos} ganharam`} o link das vagas.` : repetidas ? "." : "") +
      (semLink
        ? ` O link das vagas ficou de fora: rode a migração ${MIGRACAO_SITE} no Supabase e importe o arquivo de novo (nos que já estão na lista, entra só o link).`
        : ""),
  };
}

/** Muda a situação do convite (e guarda quando foi enviado). */
export async function mudarConvite(id: string, status: StatusConvite): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id) || !STATUS_CONVITE.includes(status)) return { ok: false, erro: "Pedido inválido." };
  // "*": a escolha da mensagem só existe depois da migração 20270724120000
  const { data: antes } = await c.from("convites").select("*").eq("id", id).maybeSingle();
  if (!antes) return { ok: false, erro: "Este convite não existe mais. Atualize a página." };
  const mudanca: { status: StatusConvite; enviada_em?: string; mensagem?: null; enviada_por?: "whatsapp" } = { status };
  if (status === "enviada" && !antes.enviada_em) {
    mudanca.enviada_em = new Date().toISOString();
    // marcado à mão como Enviei: foi pelo WhatsApp (o e-mail marca sozinho, em enviarConviteEmail); sem a coluna
    // (migração 20270913120000), o select "*" não a traz e fica de fora
    if ("enviada_por" in antes && !antes.enviada_por) mudanca.enviada_por = "whatsapp";
  }
  // a mensagem escolhida era para a situação de antes: volta a sugerida (Enviei sugere retomar a conversa)
  if (antes.status !== status && antes.mensagem) mudanca.mensagem = null;
  const { error } = await c.from("convites").update(mudanca).eq("id", id);
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true };
}

/** A mensagem escolhida no cartão (null: volta a sugerida). Sem a migração, avisa e a tela fica com a escolha. */
export async function escolherMensagemDoConvite(id: string, qual: MensagemConvite | null): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id) || (qual !== null && !MENSAGENS_CONVITE.includes(qual))) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.from("convites").update({ mensagem: qual }).eq("id", id);
  if (semColuna(error))
    return { ok: false, erro: `Para guardar a mensagem escolhida, rode a migração ${MIGRACAO_SITE} no Supabase.` };
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  return { ok: true };
}

/** O link da página de vagas da empresa (a Gupy ou o site dela). Vazio tira o link. */
export async function salvarLinkDasVagas(id: string, link: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const bruto = String(link ?? "").trim();
  const limpo = bruto ? linkDasVagas(bruto) : null;
  if (bruto && !limpo)
    return { ok: false, erro: "Confira o link: cole o endereço da página de vagas, como https://empresa.gupy.io." };
  const { error } = await c.from("convites").update({ link_vagas: limpo }).eq("id", id);
  if (semColuna(error)) return { ok: false, erro: `Para guardar o link, rode a migração ${MIGRACAO_SITE} no Supabase.` };
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: limpo ? "Link salvo." : "Link tirado." };
}

/**
 * Ajusta o contato do convite (26/11/2026, Marcelo: o e-mail da Receita veio "gamil.com"): o e-mail, os WhatsApp e os
 * telefones, separados por vírgula. Vazio tira.
 */
export async function ajustarContatoDoConvite(
  id: string,
  contato: { email: string; whatsapp: string; telefones: string },
): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const email = String(contato.email ?? "").trim().toLowerCase();
  if (email && !emailValido(email)) return { ok: false, erro: "Confira o e-mail: algo como nome@empresa.com.br." };
  const numeros = (texto: string) => {
    const lista = String(texto ?? "")
      .split(/[,;\n]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      // o que não tem número também é erro ("abc" não some calado)
      .map((t) => t.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, ""));
    return { certos: [...new Set(lista.filter((t) => TEL.test(t)))].slice(0, 5), errados: lista.filter((t) => !TEL.test(t)) };
  };
  const whatsapp = numeros(contato.whatsapp);
  const telefones = numeros(contato.telefones);
  if (whatsapp.errados.length || telefones.errados.length)
    return { ok: false, erro: "Confira os números: com DDD, como (62) 99999-0000." };
  const { error } = await c
    .from("convites")
    .update({ email: email || null, whatsapp: whatsapp.certos, telefones: telefones.certos })
    .eq("id", id);
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: "Contato ajustado." };
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
  if (!iaConfigurada()) {
    return { ok: false, erro: "Falta a chave da IA (OPENAI_API_KEY ou ANTHROPIC_API_KEY) no .env.local." };
  }
  const { data: cfg } = await c.from("config_site").select("*").limit(1).maybeSingle();
  let lida;
  try {
    lida = await lerVagas({ imagens: [imagem], nome: String(nomeArquivo ?? "") }, modeloPara(cfg, "ler"));
  } catch (e) {
    return { ok: false, erro: e instanceof ErroIA ? e.message : "A IA não conseguiu ler esta imagem." };
  }
  const servico = lida.tipo === "servico";
  if (lida.tipo !== "vaga" && !servico)
    return {
      ok: false,
      erro:
        lida.tipo === "golpe"
          ? `Parece golpe${lida.motivo ? `: ${lida.motivo}` : "."}`
          : `Não parece anúncio de vaga nem de serviço${lida.motivo ? `: ${lida.motivo}` : "."}`,
    };
  const nome = (lida.empresa.nome || "").replace(/\s+/g, " ").trim();
  if (nome.length < 2) return { ok: false, erro: "A imagem não diz o nome da empresa." };
  const fones = (l: unknown) =>
    [
      ...new Set(
        (Array.isArray(l) ? l : []).map((t) => limparTelefone(String(t))).filter((t): t is string => Boolean(t)),
      ),
    ].slice(0, 5);
  const whatsapp = fones(lida.empresa.whatsapp);
  const telefones = fones(lida.empresa.telefones).filter((t) => !whatsapp.includes(t));
  const email = emailValido(lida.empresa.email) ? lida.empresa.email.trim().toLowerCase().slice(0, 200) : null;
  if (!whatsapp.length && !telefones.length && !email)
    return { ok: false, erro: `${nome}: a imagem não tem WhatsApp, telefone ou e-mail.` };
  // no serviço, a "vaga" é o serviço principal (o ofício, o nome e o preço): a vitrine do prestador vem pronta
  const rascunho = rascunhoValido(lida.vagas[0]);
  const cargos = lida.vagas.map((v) => v.titulo.trim().slice(0, 80)).filter(Boolean);
  return {
    ok: true,
    convite: {
      nome: nome.slice(0, 120),
      tipo: servico ? "prestador" : lida.empresa.tipo === "agencia" ? "agencia" : "empresa",
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
 * Manda o convite por e-mail pela caixa do Marcelo (marcelo@publike.org, a do e-mail às empresas, com a cópia em
 * Enviados; migração 20270913120000), até o limite do dia. Antes saía pelo ZeptoMail dos avisos do site, que só aceita
 * e-mail transacional. Deu certo: o convite fica como "Enviei", por e-mail.
 */
export async function enviarConviteEmail(
  id: string,
  assinatura: string,
  /** a mensagem escolhida na tela (a prévia que o admin viu); sem ela, a guardada ou a sugerida */
  qual?: MensagemConvite,
): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  // a chave fica em Admin › E-mails › Todos os e-mails (migração 20270201120000)
  const { data: ligado, error: semChave } = await c.rpc("admin_email_ligado", { p_modelo: "convite_convidado" });
  if (!semChave && ligado === false)
    return { ok: false, erro: "O convite por e-mail está desligado em Admin › E-mails › Todos os e-mails." };
  // o limite do dia (sem a migração, 50)
  const { data: dia } = await c.rpc("admin_convites_email");
  const limite = dia as unknown as { por_dia: number; hoje: number; remetente_nome: string | null } | null;
  const porDia = limite?.por_dia ?? 50;
  if ((limite?.hoje ?? 0) >= porDia)
    return {
      ok: false,
      erro: `Hoje já saíram ${porDia} convites por e-mail, o limite do dia. Amanhã tem mais (ou mude o limite aqui em cima).`,
    };
  const { data: conv } = await c.from("convites").select("*").eq("id", id).maybeSingle();
  if (!conv) return { ok: false, erro: "Este convite não existe mais. Atualize a página." };
  const convite = conv as unknown as Convite;
  const para = convite.email;
  if (!para) return { ok: false, erro: "Este convite não tem e-mail." };
  if (!emailValido(para)) return { ok: false, erro: "O e-mail deste convite tem um formato que não dá para usar." };
  const pedida = qual && mensagensDoConvite(convite).includes(qual) ? qual : mensagemDoConvite(convite);
  const { assunto, texto, html } = emailDoConvite(
    convite,
    String(assinatura ?? ""),
    urlDosEmails() ?? "https://publike.org",
    pedida,
  );
  const r = await mandarPelaCaixa({
    para,
    assunto,
    texto,
    html,
    remetenteNome: limite?.remetente_nome || "Marcelo, do Publike",
  });
  if (!r.ok) {
    console.error("Publike: o convite por e-mail não saiu:", r.erro);
    return { ok: false, erro: r.erro };
  }
  // para os números e Enviados de Admin › E-mails, e para o limite do dia
  const { error: semRegistro } = await c.rpc("admin_registrar_email_direto", {
    p_modelo: "convite_convidado",
    p_para: para,
    p_usuario: null,
  });
  if (semRegistro && semRegistro.code !== "PGRST202")
    console.error("Publike: o convite saiu, mas não ficou registrado:", semRegistro.message);
  const mudanca: { status?: "enviada"; enviada_em?: string; enviada_por: "email" } = { enviada_por: "email" };
  if (convite.status === "a_enviar") Object.assign(mudanca, { status: "enviada", enviada_em: new Date().toISOString() });
  const { error: semCanal } = await c.from("convites").update(mudanca).eq("id", id);
  // sem a migração, sem a coluna: marca como antes
  if (semCanal && convite.status === "a_enviar")
    await c.from("convites").update({ status: "enviada", enviada_em: new Date().toISOString() }).eq("id", id);
  refresh();
  return {
    ok: true,
    mensagem: `E-mail enviado para ${para}, pela caixa marcelo@publike.org${r.copia ? ` (a cópia em Enviados falhou: ${r.copia})` : ""}.`,
  };
}

/** O limite de convites por e-mail por dia (Admin › Convites; migração 20270913120000). */
export async function salvarConvitesEmailPorDia(porDia: number | string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const n = Math.round(Number(String(porDia).replace(/\D/g, "")));
  if (!Number.isFinite(n) || n < 1 || n > 300) return { ok: false, erro: "O limite vai de 1 a 300 por dia." };
  const { error } = await c.rpc("admin_convites_email_por_dia", { p_por_dia: n });
  if (error) {
    if (error.code === "PGRST202") return { ok: false, erro: "Rode antes a migração 20270913120000 no Supabase." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  refresh();
  return { ok: true, mensagem: `Salvo: até ${n} convites por e-mail por dia.` };
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
  // a equipe pode usar o link de qualquer site na candidatura no site da empresa
  const leitura = lerAnuncio(formData, { equipe: true });
  if (!leitura.ok)
    return { ok: false, erro: "Confira os campos marcados.", erros: ajustarErros(leitura.erros, trocas) };
  const d = leitura.dados;
  if (d.tipo !== "vaga") return { ok: false, erro: "Pelo convite dá para publicar só vagas." };

  // a conta da empresa: a do convite, a que já usa o e-mail, ou uma nova
  const conta = await garantirConta(c, convite, formData, d.cidade, d.bairro ?? "");
  if ("erro" in conta) return { ok: false, erro: conta.erro };
  const { id: contaId, semEmail } = conta;

  const diaADia = diaADiaDoFormulario(formData, d.tipo);
  const { data: anuncio, error } = await gravarVaga({ ...registroDoAnuncio(d), ...(diaADia ? { dia_a_dia: diaADia } : {}) }, (r) =>
    c
      .from("anuncios")
      .insert({ ...r, tipo: d.tipo, autor_id: contaId })
      .select("id")
      .single(),
  );
  if (error) {
    const erro = mensagemDeErro(error);
    if (error.hint === "contratante" || error.hint === "pagamento_ate" || error.hint === "link_candidatura") {
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
 * A empresa com as vagas na Gupy disse "sim" (Admin › Convites › Publicar as vagas da Gupy por ela): cria a conta, se
 * ainda não tiver, marca o convite como Autorizou e abre o "Puxar do link da Gupy" da conta já com a página de vagas
 * dela, para escolher e publicar todas de uma vez, com o botão "Candidatar no site da empresa".
 */
export async function autorizarVagasDaGupy(
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
  const pagina = paginaDeVagasDaGupy(convite.link_vagas);
  if (!pagina || !vagasNaGupy(convite))
    return { ok: false, erro: "Este convite não tem o link da página de vagas na Gupy. Ponha o link no cartão do convite." };
  if (formData.get("autorizou") !== "on")
    return { ok: false, erro: `Marque que ${convite.nome} autorizou a divulgação das vagas antes de seguir.` };
  const comoAutorizou = String(formData.get("como_autorizou") ?? "")
    .trim()
    .slice(0, 300);
  const pedida = String(formData.get("conta_cidade") ?? "").trim();
  const cidade = (CIDADES as readonly string[]).includes(pedida) ? pedida : PRACA_PADRAO.cidade;
  const bairro = String(formData.get("conta_bairro") ?? "")
    .trim()
    .slice(0, 80);

  const conta = await garantirConta(c, convite, formData, cidade, bairro);
  if ("erro" in conta) return { ok: false, erro: conta.erro };

  // de novo pelo mesmo convite (a lista ficou para depois): a anotação não se repete
  if (convite.status !== "autorizou" || convite.usuario_id !== conta.id) {
    const quando = new Date().toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
    const registro = `Autorizou em ${quando} (vagas da Gupy pelo admin)${comoAutorizou ? `: ${comoAutorizou}` : "."}`;
    const { error } = await c
      .from("convites")
      .update({
        status: "autorizou",
        usuario_id: conta.id,
        nota: [registro, convite.nota].filter(Boolean).join(" · ").slice(0, 500),
      })
      .eq("id", conviteId);
    if (error) return { ok: false, erro: mensagemDeErro(error, "A conta está pronta, mas o convite não mudou.") };
  }
  revalidatePath("/admin/convites");
  redirect(
    `/admin/usuarios/${conta.id}/publicar?gupy=${encodeURIComponent(pagina)}${conta.semEmail ? "&sem_email=1" : ""}`,
  );
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
    const lp = lerPerfil(perfil, { admin: true });
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
          : {
              // o mesmo formato do entrar pelo celular (com o 9 no celular; src/lib/telefone-login.ts)
              phone: telefoneDoLogin(p.whatsapp ?? "") ?? p.whatsapp,
              phone_confirm: true,
              user_metadata: { name: p.nome, criada_pela_equipe: true },
            },
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

/** Uma empresa das listas da base da Receita (Admin › Convites › Abriram, Agências e Prestadores MEI). */
export type EmpresaDaLista = {
  cnpj: string;
  nome: string;
  cnae: string | null;
  ramo: string | null;
  bairro: string | null;
  cidade: string;
  abertura: string | null;
  telefone: string | null;
  email: string | null;
};

/**
 * Põe a empresa da base da Receita na lista de convites (claude/plano-base-de-empresas-da-receita.md, partes 1 e 5):
 * o celular vai como WhatsApp, o fixo como telefone; a empresa nova já leva a vaga típica do ramo (o que mais contrata
 * em Goiás, pelo Caged) e o prestador, o ofício da vitrine. Nome repetido na lista ganha o bairro (ou o fim do CNPJ).
 */
export async function convidarDaReceita(
  e: EmpresaDaLista,
  tipo: "empresa" | "agencia" | "prestador",
): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!e || !/^[0-9A-Z]{12}[0-9]{2}$/.test(String(e.cnpj ?? ""))) return { ok: false, erro: "CNPJ inválido." };
  const { data: ja } = await c.from("convites").select("id").eq("cnpj_receita", e.cnpj).limit(1);
  if (ja?.length) return { ok: true, mensagem: "Essa empresa já está na lista de convites." };

  const digitos = limparTelefone(e.telefone ?? "") ?? "";
  const celular = digitos.length === 11 && digitos[2] === "9";
  let rascunho: NovoConvite["rascunho"] = null;
  let vagas: string[] = [];
  if (tipo === "prestador") {
    const oficio = oficioDoRamo(e.cnae);
    const nome = dadosDoOficio(oficio)?.nome;
    if (oficio && nome) {
      rascunho = rascunhoValido({ oficio, titulo: nome, descricao: "", cidade: e.cidade, bairro: e.bairro ?? "" });
      vagas = [nome];
    }
  } else if (tipo === "empresa" && e.cnae) {
    const { data: funcoes } = await c.rpc("funcoes_do_ramo", { p_cnae: e.cnae, p_regiao: "go", p_limite: 10 });
    const titulo = (funcoes ?? []).map((f) => tituloDaFuncao(f.cbo)).find(Boolean);
    if (titulo) {
      rascunho = rascunhoValido({ titulo, descricao: "", cidade: e.cidade, bairro: e.bairro ?? "", quantidade: 1 });
      vagas = [titulo];
    }
  }
  const aberta = e.abertura ? e.abertura.split("-").reverse().join("/") : null;
  const observacao = [
    `Da base da Receita${e.ramo ? `: ${e.ramo}` : ""}`,
    aberta ? `aberta em ${aberta}` : null,
    [e.bairro, e.cidade].filter(Boolean).join(", "),
    `CNPJ ${e.cnpj}`,
  ]
    .filter(Boolean)
    .join("; ")
    .slice(0, 500);

  const { data: atuais } = await c.from("convites").select("nome");
  const usados = new Set((atuais ?? []).map((a) => a.nome.trim().toLowerCase()));
  const base = String(e.nome ?? "").trim().slice(0, 100) || "Empresa";
  let nome = base;
  if (usados.has(nome.toLowerCase())) nome = e.bairro ? `${base} (${e.bairro})`.slice(0, 120) : base;
  if (usados.has(nome.toLowerCase())) nome = `${base} (${e.cnpj.slice(-6)})`.slice(0, 120);

  const { error } = await c.from("convites").insert({
    nome,
    tipo,
    vagas,
    whatsapp: celular ? [digitos] : [],
    telefones: !celular && digitos ? [digitos] : [],
    // o domínio digitado errado na Receita ("gamil.com") já entra certo
    email: emailValido(e.email) ? (emailCorrigido(e.email) ?? String(e.email).trim().slice(0, 200)) : null,
    observacao,
    rascunho: rascunho as never,
    origem: "receita",
    cnpj_receita: e.cnpj,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para pôr na lista agora.") };
  refresh();
  return { ok: true, mensagem: `${nome} entrou na lista de convites.` };
}

/** Tira um CNPJ das listas da Receita (o pedido chegou por e-mail; migração 20270608120000). */
export async function tirarDasListasDaReceita(cnpj: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const { error } = await c.rpc("admin_receita_sem_convite", { p_cnpj: String(cnpj ?? "") });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para tirar agora.") };
  refresh();
  return { ok: true, mensagem: "Esse CNPJ não aparece mais nas listas." };
}

/** Admin › Convites › Divulgar: marca (ou desmarca) que a mensagem foi mandada a esse CNPJ (migração 20270916120000). */
export async function marcarDivulgacao(cnpj: string, publico: string, mandado: boolean): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const { error } = await c.rpc("admin_divulgar_marcar", {
    p_cnpj: String(cnpj ?? ""),
    p_publico: publico,
    p_mandado: mandado,
  });
  if (error) {
    if (error.code === "PGRST202") return { ok: false, erro: "Rode antes a migração 20270916120000_divulgar_contatos.sql." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  refresh();
  return { ok: true, mensagem: mandado ? "Marcado como mandado." : "Voltou para os que faltam." };
}
