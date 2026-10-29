import "server-only";
import nodemailer from "nodemailer";
import { conviteDoEmail } from "@/lib/agenda";
import { MODO_DEMO, SITE_URL } from "@/lib/config";
import { linkParaSair, logoPadraoDoEmail, montarEmail, paraSair } from "@/lib/email/montar";
import { EMAIL_DA_EQUIPE } from "@/lib/mensagem-equipe";
import { ErroIA, iaConfigurada, modeloDaIA } from "@/lib/ia/openai";
import { revisarAnuncio, revisarAvaliacao, revisarRecado, type DecisaoIA } from "@/lib/ia/tarefas";
import { criarClienteAdmin, type ClienteBanco } from "@/lib/supabase/admin";
import { criarClientePublico } from "@/lib/supabase/servidor";
import { destinoDoAviso } from "@/lib/destino-aviso";
import { chaveDoServidor, chavesVapid, chaveSecretaSupabase, configSmtp, urlDosEmails } from "./ambiente";
import { enviarPush, type InscricaoPush } from "./web-push";

// O banco põe os e-mails e as revisões da IA em filas. O servidor do site
// esvazia as filas logo depois de cada ação (com after(), sem atrasar a
// resposta). No site publicado, ele usa a chave do servidor; no seu
// computador, pode usar a chave secreta do Supabase.

type AcessoFila = { cliente: ClienteBanco; chave: string };

export function acessoFila(): AcessoFila | null {
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

/**
 * Logo do topo dos e-mails: a escolhida no admin ou a do Publike. Se não der
 * para ler a escolha (banco sem a migração da logo, por exemplo), vai a do Publike.
 */
export async function logoDosEmails(cliente: ClienteBanco, site: string): Promise<string | null> {
  const { data, error } = await cliente.rpc("logo_emails");
  if (error) {
    console.error("Publike: não deu para ler a logo dos e-mails:", error.message);
    return logoPadraoDoEmail(site);
  }
  const escolha = data?.[0];
  if (escolha && !escolha.mostrar) return null;
  return escolha?.url || logoPadraoDoEmail(site);
}

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
      const { error: e } = await cliente.rpc("servidor_marcar_email", {
        p_chave: chave,
        p_id: id,
        p_ok: ok,
        p_erro: erro,
      });
      if (!e) return;
      console.error(`Publike: não deu para marcar o e-mail ${id} (tentativa ${tentativa}):`, e.message);
    }
  }

  const site = base ?? SITE_URL;
  const logo = await logoDosEmails(cliente, site);

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
        // entrevista marcada, confirmada ou cancelada: o convite de agenda vai junto
        const convite = conviteDoEmail(item.dados, site, new Date());
        // o "parar de receber" de um toque (Gmail e Yahoo): só nos avisos que a pessoa pode desligar
        const sair = paraSair(item.dados);
        const email = montarEmail(
          { modelo: item.modelo, grupo: item.grupo, assunto: item.assunto, corpo: item.corpo, botao: item.botao },
          item.dados,
          site,
          logo,
          convite?.google ? [{ rotulo: "Adicionar ao Google Agenda", link: convite.google }] : [],
        );
        await transporte.sendMail({
          from: { name: item.remetente_nome, address: smtp.remetente },
          to: item.para,
          // a mensagem da equipe: quem responde fala com a equipe
          replyTo: item.modelo === "mensagem_equipe" ? EMAIL_DA_EQUIPE : item.responder_para || undefined,
          subject: email.assunto,
          text: email.texto,
          html: email.html,
          headers: {
            "Auto-Submitted": "auto-generated",
            ...(sair
              ? {
                  "List-Unsubscribe": `<${linkParaSair(site, sair, "um_toque")}>`,
                  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                }
              : {}),
          },
          ...(convite
            ? { icalEvent: { method: convite.metodo, filename: "entrevista.ics", content: convite.ics } }
            : {}),
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
  if (!iaConfigurada()) {
    return { ...resultado, motivo: "Falta a chave da IA no servidor (OPENAI_API_KEY ou ANTHROPIC_API_KEY)." };
  }
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
  if (!iaConfigurada()) {
    return { ...resultado, motivo: "Falta a chave da IA no servidor (OPENAI_API_KEY ou ANTHROPIC_API_KEY)." };
  }
  const { cliente, chave } = acesso;

  const { data: itens, error } = await cliente.rpc("servidor_pegar_avaliacoes_ia", {
    p_chave: chave,
    p_limite: limite,
  });
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

/** Recados da linha do tempo: a IA decide se vão ao ar. */
export async function revisarRecadosPendentes(limite = 5): Promise<ResultadoIA> {
  const resultado: ResultadoIA = { revisados: 0, retidos: 0, erros: 0 };
  const acesso = acessoFila();
  if (!acesso) return { ...resultado, motivo: "Falta a chave do servidor (PUBLIKE_CHAVE_SERVIDOR)." };
  if (!iaConfigurada()) {
    return { ...resultado, motivo: "Falta a chave da IA no servidor (OPENAI_API_KEY ou ANTHROPIC_API_KEY)." };
  }
  const { cliente, chave } = acesso;

  const { data: itens, error } = await cliente.rpc("servidor_pegar_recados_ia", { p_chave: chave, p_limite: limite });
  if (error) {
    // sem a migração dos recados, não há fila
    if (error.code !== "PGRST202") console.error("Publike: falha ao ler a fila de recados da IA:", error.message);
    return { ...resultado, motivo: "Não foi possível ler a fila de recados." };
  }

  await Promise.all(
    (itens ?? []).map(async (item) => {
      let decisao: DecisaoIA | null = null;
      let falha = "Erro ao falar com a IA.";
      try {
        decisao = await revisarRecado(item, item.modelo);
      } catch (e) {
        if (e instanceof ErroIA) falha = e.message;
        console.error(`Publike: a IA não revisou o recado ${item.recado_id}:`, textoDoErro(e));
      }
      const { data, error: erroBanco } = await cliente.rpc("servidor_resultado_recado", {
        p_chave: chave,
        p_recado: item.recado_id,
        p_versao: item.versao,
        p_decisao: decisao ? decisao.decisao : "erro",
        p_categorias: decisao ? decisao.categorias : [],
        p_explicacao: decisao ? decisao.explicacao : falha,
        p_modelo: decisao ? decisao.modelo : modeloDaIA(item.modelo).id,
      });
      if (erroBanco) {
        console.error(`Publike: não deu para gravar a revisão do recado ${item.recado_id}:`, erroBanco.message);
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

// ------------------------------------------------------------------ notificações no celular

export type ResultadoPush = { enviadas: number; falhas: number; expiradas: number; motivo?: string };

/** Uma etiqueta curta por assunto: a notificação nova do mesmo assunto troca a antiga no celular. */
function etiqueta(tipo: string, ...partes: (string | null)[]) {
  const id = partes.find(Boolean)?.replace(/-/g, "").slice(0, 16) ?? "";
  return `${tipo.replace(/[^a-z_]/g, "").slice(0, 15)}${id ? `-${id}` : ""}`.slice(0, 32);
}

/**
 * Manda os avisos do sino que estão na fila do celular (Web Push). Sem as chaves VAPID, as
 * notificações estão desligadas: não é erro, a fila espera (e a notificação velha some em 1 dia).
 */
export async function enviarPushPendentes(limite = 20): Promise<ResultadoPush> {
  const resultado: ResultadoPush = { enviadas: 0, falhas: 0, expiradas: 0 };
  const chaves = chavesVapid();
  if (!chaves) return resultado;
  const acesso = acessoFila();
  if (!acesso) return { ...resultado, motivo: "Falta a chave do servidor (PUBLIKE_CHAVE_SERVIDOR)." };
  const { cliente, chave } = acesso;
  const { data: itens, error } = await cliente.rpc("servidor_pegar_push", { p_chave: chave, p_limite: limite });
  if (error) {
    // banco sem a migração das notificações no celular: nada a fazer
    if (error.code === "PGRST202") return resultado;
    console.error("Publike: falha ao ler a fila do celular:", error.message);
    return { ...resultado, motivo: "Não foi possível ler a fila das notificações no celular." };
  }
  for (const item of itens ?? []) {
    const inscricoes = (Array.isArray(item.inscricoes) ? item.inscricoes : []) as InscricaoPush[];
    const dados = {
      titulo: "Publike",
      corpo: item.texto,
      url: destinoDoAviso(item, item.conta_id),
      tag: etiqueta(item.tipo, item.anuncio_id, item.ator_id, item.recado_id),
    };
    const envios = await Promise.all(
      inscricoes.map((i) =>
        enviarPush(i, dados, chaves, {
          topico: dados.tag.replace(/[^A-Za-z0-9_-]/g, ""),
          urgencia: ["mensagem", "match", "entrevista", "mensagem_equipe"].includes(item.tipo) ? "high" : "normal",
        }),
      ),
    );
    let algumaSaiu = inscricoes.length === 0;
    const erros: string[] = [];
    for (const [n, r] of envios.entries()) {
      if (r.ok) algumaSaiu = true;
      else if (r.expirada) {
        resultado.expiradas++;
        await cliente.rpc("servidor_inscricao_expirada", { p_chave: chave, p_endpoint: inscricoes[n].endpoint });
      } else erros.push(r.erro);
    }
    // só tenta de novo quando nenhum aparelho recebeu e algum falhou por um motivo passageiro
    const ok = algumaSaiu || erros.length === 0;
    if (ok) resultado.enviadas++;
    else resultado.falhas++;
    await cliente.rpc("servidor_marcar_push", { p_chave: chave, p_id: item.id, p_ok: ok, p_erro: erros[0] ?? null });
  }
  return resultado;
}

/** Roda depois de cada ação que pode gerar e-mail ou revisão (dentro de after()). */
/**
 * Vaga com curtida parada há 48 horas, de uma conta que nunca entrou (a equipe publicou em nome dela): o
 * contato é liberado e quem curtiu recebe o "Deu match" (migração 20261116120000). Só pela tarefa das filas.
 */
export async function liberarContatosParados(): Promise<{ liberadas: number; motivo?: string }> {
  const acesso = acessoFila();
  if (!acesso) return { liberadas: 0 };
  const { data, error } = await acesso.cliente.rpc("servidor_liberar_contatos_parados", { p_chave: acesso.chave });
  if (error) {
    // banco sem a migração: nada a fazer
    if (error.code === "PGRST202") return { liberadas: 0 };
    console.error("Publike: falha ao liberar os contatos parados:", error.message);
    return { liberadas: 0, motivo: "Não foi possível liberar os contatos das curtidas paradas." };
  }
  return { liberadas: Number(data ?? 0) };
}

/**
 * Curtida sem resposta (migração 20261211120000): o lembrete para quem publicou em 24 h e em 72 h e, em 5 dias, o
 * aviso com as vagas parecidas para quem curtiu. Das 8h às 20h; o banco não repete.
 */
export async function lembrarRespostas(): Promise<{ empresa: number; pessoa: number; motivo?: string }> {
  const acesso = acessoFila();
  if (!acesso) return { empresa: 0, pessoa: 0 };
  const { data, error } = await acesso.cliente.rpc("servidor_lembrar_respostas", { p_chave: acesso.chave });
  if (error) {
    // banco sem a migração: nada a fazer
    if (error.code === "PGRST202") return { empresa: 0, pessoa: 0 };
    console.error("Publike: falha ao lembrar as curtidas sem resposta:", error.message);
    return { empresa: 0, pessoa: 0, motivo: "Não foi possível lembrar as curtidas sem resposta." };
  }
  const r = (data ?? {}) as { empresa?: number; pessoa?: number };
  return { empresa: Number(r.empresa ?? 0), pessoa: Number(r.pessoa ?? 0) };
}

/** As notícias de hoje num aviso só, no sino e no celular: a partir das 18h, uma vez por dia (migração 20261202120000). */
export async function avisarNoticiasDoDia(): Promise<{ avisadas: number; motivo?: string }> {
  const acesso = acessoFila();
  if (!acesso) return { avisadas: 0 };
  const { data, error } = await acesso.cliente.rpc("servidor_avisar_noticias", { p_chave: acesso.chave });
  if (error) {
    // banco sem a migração: nada a fazer
    if (error.code === "PGRST202") return { avisadas: 0 };
    console.error("Publike: falha ao avisar as notícias do dia:", error.message);
    return { avisadas: 0, motivo: "Não foi possível avisar as notícias do dia." };
  }
  return { avisadas: Number(data ?? 0) };
}

/** Os resultados dos testes Publike saem 12 meses depois que a vaga sai do ar (migração 20261204120000). */
export async function limparTestesAntigos(): Promise<{ apagados: number; motivo?: string }> {
  const acesso = acessoFila();
  if (!acesso) return { apagados: 0 };
  const { data, error } = await acesso.cliente.rpc("servidor_limpar_avaliacoes", { p_chave: acesso.chave });
  if (error) {
    if (error.code === "PGRST202") return { apagados: 0 };
    console.error("Publike: falha ao limpar os testes antigos:", error.message);
    return { apagados: 0, motivo: "Não foi possível apagar os resultados antigos dos testes." };
  }
  return { apagados: Number(data ?? 0) };
}

export async function processarFilas() {
  try {
    const [ia, avaliacoes, recados] = await Promise.all([
      revisarAnunciosPendentes(),
      revisarAvaliacoesPendentes(),
      revisarRecadosPendentes(),
    ]);
    if (avaliacoes.erros) console.warn(`Publike: ${avaliacoes.erros} avaliação(ões) vão ser revisadas de novo.`);
    if (recados.erros) console.warn(`Publike: ${recados.erros} recado(s) vão ser revisados de novo.`);
    // a IA pode ter tirado um anúncio do ar: esses avisos também saem agora
    await Promise.all([enviarEmailsPendentes(), enviarPushPendentes()]);
    if (ia.erros) console.warn(`Publike: ${ia.erros} revisão(ões) da IA vão ser tentadas de novo.`);
  } catch (e) {
    console.error("Publike: falha ao processar as filas:", textoDoErro(e));
  }
}
