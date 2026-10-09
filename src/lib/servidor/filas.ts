import "server-only";
import nodemailer from "nodemailer";
import { MODO_DEMO, SITE_URL } from "@/lib/config";
import { montarEmail } from "@/lib/email/montar";
import { ErroIA, iaConfigurada, modeloDaIA } from "@/lib/ia/openai";
import { revisarAnuncio, revisarAvaliacao, type DecisaoIA } from "@/lib/ia/tarefas";
import { criarClienteAdmin, type ClienteBanco } from "@/lib/supabase/admin";
import { criarClientePublico } from "@/lib/supabase/servidor";
import { chaveDoServidor, chaveSecretaSupabase, configSmtp, urlDosEmails } from "./ambiente";

// O banco põe os e-mails e as revisões da IA em filas. O servidor do site
// esvazia as filas logo depois de cada ação (com after(), sem atrasar a
// resposta). No site publicado, ele usa a chave do servidor; no seu
// computador, pode usar a chave secreta do Supabase.

type AcessoFila = { cliente: ClienteBanco; chave: string };

function acessoFila(): AcessoFila | null {
  if (MODO_DEMO) return null;
  const chave = chaveDoServidor();
  if (chave) return { cliente: criarClientePublico(), chave };
  if (chaveSecretaSupabase()) return { cliente: criarClienteAdmin(), chave: "" };
  return null;
}

/** Para o admin mostrar o que falta configurar. */
export function situacaoFilas() {
  return {
    acesso: chaveDoServidor() ? "chave do servidor" : chaveSecretaSupabase() ? "chave secreta" : null,
    smtp: Boolean(configSmtp()),
    /** Sem endereço público, este servidor só manda o e-mail de teste. */
    enderecoEmails: urlDosEmails(),
    ia: iaConfigurada(),
  };
}

function textoDoErro(e: unknown) {
  if (e instanceof Error) return e.message.slice(0, 400);
  return String(e).slice(0, 400);
}

// ------------------------------------------------------------------ e-mails

export type ResultadoEmails = {
  enviados: number;
  falhas: number;
  erros: { id: number; para: string; erro: string }[];
  motivo?: string;
  /** Sem endereço público do site: os avisos para as pessoas ficaram na fila. */
  semEndereco?: boolean;
};

export async function enviarEmailsPendentes(limite = 10): Promise<ResultadoEmails> {
  const resultado: ResultadoEmails = { enviados: 0, falhas: 0, erros: [] };
  const acesso = acessoFila();
  if (!acesso) return { ...resultado, motivo: "Falta a chave do servidor (PUBLIKE_CHAVE_SERVIDOR)." };
  const smtp = configSmtp();
  if (!smtp) {
    return {
      ...resultado,
      motivo: "Falta configurar o e-mail no servidor (SMTP_SERVIDOR, SMTP_USUARIO, SMTP_SENHA e SMTP_REMETENTE).",
    };
  }
  const { cliente, chave } = acesso;
  // Sem o endereço público do site, os links sairiam para localhost: aqui só
  // vai o e-mail de teste; o resto espera o site publicado (ou PUBLIKE_URL_PUBLICA).
  const base = urlDosEmails();
  if (!base) resultado.semEndereco = true;

  const { data: itens, error } = await cliente.rpc("servidor_pegar_emails", {
    p_chave: chave,
    p_limite: limite,
    p_so_teste: !base,
  });
  if (error) {
    console.error("Publike: falha ao ler a fila de e-mails:", error.message);
    return { ...resultado, motivo: "Não foi possível ler a fila de e-mails." };
  }
  if (!itens?.length) return resultado;

  // Marca o resultado no banco. Tenta duas vezes: se a marca não pegar, o
  // e-mail volta para a fila em 15 minutos e pode sair repetido.
  async function marcar(id: number, ok: boolean, erro?: string) {
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      const { error: e } = await cliente.rpc("servidor_marcar_email", { p_chave: chave, p_id: id, p_ok: ok, p_erro: erro });
      if (!e) return;
      console.error(`Publike: não deu para marcar o e-mail ${id} (tentativa ${tentativa}):`, e.message);
    }
  }

  const transporte = nodemailer.createTransport({
    host: smtp.servidor,
    port: smtp.porta,
    secure: smtp.seguro,
    requireTLS: !smtp.seguro,
    auth: { user: smtp.usuario, pass: smtp.senha },
    pool: true,
    maxConnections: 1,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  try {
    for (const item of itens) {
      try {
        const email = montarEmail(
          { modelo: item.modelo, grupo: item.grupo, assunto: item.assunto, corpo: item.corpo, botao: item.botao },
          item.dados,
          base ?? SITE_URL,
        );
        await transporte.sendMail({
          from: { name: item.remetente_nome, address: smtp.remetente },
          to: item.para,
          replyTo: item.responder_para || undefined,
          subject: email.assunto,
          text: email.texto,
          html: email.html,
          headers: { "Auto-Submitted": "auto-generated" },
        });
      } catch (e) {
        const erro = textoDoErro(e);
        console.error(`Publike: e-mail ${item.id} (${item.modelo}) não saiu:`, erro);
        await marcar(item.id, false, erro);
        resultado.falhas++;
        resultado.erros.push({ id: item.id, para: item.para, erro });
        continue;
      }
      await marcar(item.id, true);
      resultado.enviados++;
    }
  } finally {
    transporte.close();
  }
  return resultado;
}

// ------------------------------------------------------------------ IA

export type ResultadoIA = { revisados: number; retidos: number; erros: number; motivo?: string };

export async function revisarAnunciosPendentes(limite = 5): Promise<ResultadoIA> {
  const resultado: ResultadoIA = { revisados: 0, retidos: 0, erros: 0 };
  const acesso = acessoFila();
  if (!acesso) return { ...resultado, motivo: "Falta a chave do servidor (PUBLIKE_CHAVE_SERVIDOR)." };
  if (!iaConfigurada()) return { ...resultado, motivo: "Falta a chave da IA no servidor (OPENAI_API_KEY)." };
  const { cliente, chave } = acesso;

  const { data: itens, error } = await cliente.rpc("servidor_pegar_revisoes_ia", { p_chave: chave, p_limite: limite });
  if (error) {
    console.error("Publike: falha ao ler a fila da IA:", error.message);
    return { ...resultado, motivo: "Não foi possível ler a fila da IA." };
  }

  await Promise.all(
    (itens ?? []).map(async (item) => {
      let decisao: DecisaoIA | null = null;
      let falha = "Erro ao falar com a IA.";
      try {
        decisao = await revisarAnuncio(item, item.modelo);
      } catch (e) {
        if (e instanceof ErroIA) falha = e.message;
        console.error(`Publike: a IA não revisou o anúncio ${item.anuncio_id}:`, textoDoErro(e));
      }
      // Erro também é gravado: o banco tenta de novo (até 3 vezes) e depois
      // mostra o anúncio para a moderação.
      const { data, error: erroBanco } = await cliente.rpc("servidor_resultado_ia", {
        p_chave: chave,
        p_anuncio: item.anuncio_id,
        p_versao: item.versao,
        p_decisao: decisao ? decisao.decisao : "erro",
        p_categorias: decisao ? decisao.categorias : [],
        p_explicacao: decisao ? decisao.explicacao : falha,
        p_modelo: decisao ? decisao.modelo : modeloDaIA(item.modelo).id,
      });
      if (erroBanco) {
        console.error(`Publike: não deu para gravar a revisão do anúncio ${item.anuncio_id}:`, erroBanco.message);
      }
      if (!decisao || erroBanco) {
        resultado.erros++;
        return;
      }
      resultado.revisados++;
      if (data === "retido") resultado.retidos++;
    }),
  );
  return resultado;
}

/** Comentários e respostas das avaliações: a IA decide se podem aparecer. */
export async function revisarAvaliacoesPendentes(limite = 5): Promise<ResultadoIA> {
  const resultado: ResultadoIA = { revisados: 0, retidos: 0, erros: 0 };
  const acesso = acessoFila();
  if (!acesso) return { ...resultado, motivo: "Falta a chave do servidor (PUBLIKE_CHAVE_SERVIDOR)." };
  if (!iaConfigurada()) return { ...resultado, motivo: "Falta a chave da IA no servidor (OPENAI_API_KEY)." };
  const { cliente, chave } = acesso;

  const { data: itens, error } = await cliente.rpc("servidor_pegar_avaliacoes_ia", { p_chave: chave, p_limite: limite });
  if (error) {
    console.error("Publike: falha ao ler a fila de avaliações da IA:", error.message);
    return { ...resultado, motivo: "Não foi possível ler a fila de avaliações." };
  }

  await Promise.all(
    (itens ?? []).map(async (item) => {
      let decisao: DecisaoIA | null = null;
      let falha = "Erro ao falar com a IA.";
      try {
        decisao = await revisarAvaliacao(item, item.modelo);
      } catch (e) {
        if (e instanceof ErroIA) falha = e.message;
        console.error(`Publike: a IA não revisou a avaliação ${item.avaliacao_id}:`, textoDoErro(e));
      }
      const { data, error: erroBanco } = await cliente.rpc("servidor_resultado_avaliacao", {
        p_chave: chave,
        p_avaliacao: item.avaliacao_id,
        p_parte: item.parte,
        p_versao: item.versao,
        p_decisao: decisao ? decisao.decisao : "erro",
        p_categorias: decisao ? decisao.categorias : [],
        p_explicacao: decisao ? decisao.explicacao : falha,
        p_modelo: decisao ? decisao.modelo : modeloDaIA(item.modelo).id,
      });
      if (erroBanco) {
        console.error(`Publike: não deu para gravar a revisão da avaliação ${item.avaliacao_id}:`, erroBanco.message);
      }
      if (!decisao || erroBanco) {
        resultado.erros++;
        return;
      }
      resultado.revisados++;
      if (data === "retido") resultado.retidos++;
    }),
  );
  return resultado;
}

/** Roda depois de cada ação que pode gerar e-mail ou revisão (dentro de after()). */
export async function processarFilas() {
  try {
    const [ia, avaliacoes] = await Promise.all([revisarAnunciosPendentes(), revisarAvaliacoesPendentes()]);
    if (avaliacoes.erros) console.warn(`Publike: ${avaliacoes.erros} avaliação(ões) vão ser revisadas de novo.`);
    // a IA pode ter tirado um anúncio do ar: esses avisos também saem agora
    await enviarEmailsPendentes();
    if (ia.erros) console.warn(`Publike: ${ia.erros} revisão(ões) da IA vão ser tentadas de novo.`);
  } catch (e) {
    console.error("Publike: falha ao processar as filas:", textoDoErro(e));
  }
}
