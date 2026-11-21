"use server";

import { after } from "next/server";
import { refresh, updateTag } from "next/cache";
import { retomarConversa } from "@/lib/servidor/atendimento-whatsapp";
import { TAG_CONTATO_DAS_VAGAS } from "@/lib/servidor/numero-do-publike";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import {
  appsDoWebhook,
  conferirModelos,
  conferirNumero,
  configMeta,
  datasetDaConta,
  enviarTeste,
  enviarTexto,
  ligarWebhookDaConta,
  registrarNumero,
  type SituacaoModelos,
} from "@/lib/servidor/whatsapp";
import { clienteAdminOuNulo, type ClienteBanco } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { PARAMETROS_WHATSAPP, TIPOS_WHATSAPP, type ParametroWhatsapp } from "@/lib/whatsapp-tipos";

// Admin › WhatsApp (migrações 20270619120000, 20270710120000 e 20270714120000; claude/plano-whatsapp-oficial.md):
// ligar, o modo de teste, os limites (os do mês de quem contrata, no grátis e com plano) e os parâmetros do envio,
// cadastrar e conferir os modelos na Meta, o número e a mensagem de teste. Só a equipe publike.org.

async function banco(): Promise<ClienteBanco | null> {
  const admin = await clienteAdminOuNulo();
  return admin ?? ((await possoVerTela("/admin/whatsapp")) ? await criarClienteServidor() : null);
}

const TIPOS = TIPOS_WHATSAPP.map((t) => t.tipo);

/** Como cada parâmetro aparece na mensagem de erro. */
const NOME_DO_PARAMETRO: Record<ParametroWhatsapp, string> = {
  hora_inicio: "O começo do horário de envio",
  hora_fim: "O fim do horário de envio",
  por_conta_dia: "O limite por pessoa por dia",
  por_conta_dia_empresa: "O limite por conta de quem contrata por dia",
  juntar_minutos: "A espera para juntar as candidaturas",
  intervalo_vaga_horas: "O intervalo entre os avisos de uma vaga",
  mensagem_minutos: "A espera da mensagem do chat",
  intervalo_conversa_horas: "O intervalo entre os avisos de uma conversa",
  validade_horas: "Quanto o aviso pode esperar na fila",
  limite_mes_gratis: "O limite do mês de quem contrata no grátis",
  limite_mes_plano: "O limite do mês de quem contrata com plano",
};

/** Número inteiro dentro da faixa, ou a frase do erro. */
function inteiro(valor: unknown, nome: string, min: number, max: number): number | string {
  const n = typeof valor === "string" && !valor.trim() ? NaN : Number(valor);
  if (!Number.isInteger(n) || n < min || n > max)
    return `${nome}: use um número inteiro de ${min.toLocaleString("pt-BR")} a ${max.toLocaleString("pt-BR")}.`;
  return n;
}

export async function salvarWhatsapp(dados: {
  ativo: boolean;
  paraTodos: boolean;
  numerosTeste: string;
  limiteDia: number | string;
  limiteMes: number | string;
  tiposLigados: string[];
  /** os parâmetros do envio (o que faltar fica como está) */
  parametros: Partial<Record<ParametroWhatsapp, number | string>>;
}): Promise<Resultado> {
  const c = await banco();
  if (!c) return { ok: false, erro: "Só a equipe do Publike." };
  const numeros = String(dados.numerosTeste ?? "")
    .split(/[\s,;]+/)
    .map((n) => n.replace(/\D/g, ""))
    .filter(Boolean)
    .map((n) => (n.length <= 11 ? `55${n}` : n));
  const ruins = numeros.filter((n) => !/^55[1-9][0-9][0-9]{8,9}$/.test(n));
  if (ruins.length) return { ok: false, erro: `Número de teste inválido: ${ruins[0]}. Use DDD e número, como 62 99999-0000.` };
  const limiteDia = inteiro(dados.limiteDia, "O limite por dia", 0, 100_000);
  if (typeof limiteDia === "string") return { ok: false, erro: limiteDia };
  const limiteMes = inteiro(dados.limiteMes, "O limite por mês", 0, 1_000_000);
  if (typeof limiteMes === "string") return { ok: false, erro: limiteMes };
  const p: Partial<Record<ParametroWhatsapp, number>> = {};
  for (const k of Object.keys(PARAMETROS_WHATSAPP) as ParametroWhatsapp[]) {
    const v = dados.parametros?.[k];
    if (v === undefined || v === null) continue;
    const [min, max] = PARAMETROS_WHATSAPP[k].faixa;
    const n = inteiro(v, NOME_DO_PARAMETRO[k], min, max);
    if (typeof n === "string") return { ok: false, erro: n };
    p[k] = n;
  }
  if (p.por_conta_dia === undefined) return { ok: false, erro: "Falta o limite por pessoa por dia." };
  if (p.hora_inicio !== undefined && p.hora_fim !== undefined && p.hora_inicio >= p.hora_fim)
    return { ok: false, erro: "O horário de envio precisa começar antes de terminar." };
  if (p.limite_mes_gratis !== undefined && p.limite_mes_plano !== undefined && p.limite_mes_plano < p.limite_mes_gratis)
    return { ok: false, erro: "O limite do mês com plano não pode ser menor que o do grátis." };
  const ligados = new Set((dados.tiposLigados ?? []).filter((t) => TIPOS.includes(t)));
  const { error } = await c.rpc("admin_salvar_whatsapp", {
    p_ativo: Boolean(dados.ativo),
    p_para_todos: Boolean(dados.paraTodos),
    p_numeros_teste: numeros,
    p_limite_dia: limiteDia,
    p_limite_mes: limiteMes,
    p_por_conta_dia: p.por_conta_dia,
    p_tipos_desligados: TIPOS.filter((t) => !ligados.has(t)),
    p_por_conta_dia_empresa: p.por_conta_dia_empresa,
    p_hora_inicio: p.hora_inicio,
    p_hora_fim: p.hora_fim,
    p_juntar_minutos: p.juntar_minutos,
    p_intervalo_vaga_horas: p.intervalo_vaga_horas,
    p_mensagem_minutos: p.mensagem_minutos,
    p_intervalo_conversa_horas: p.intervalo_conversa_horas,
    p_validade_horas: p.validade_horas,
    p_limite_mes_gratis: p.limite_mes_gratis,
    p_limite_mes_plano: p.limite_mes_plano,
  });
  if (error) {
    // o site já novo e o banco ainda sem a migração 20270714120000 (a função não conhece os limites do mês)
    if (error.code === "PGRST202") return { ok: false, erro: "Falta rodar a migração 20270714120000 no banco." };
    return { ok: false, erro: error.message || "Não deu para salvar agora." };
  }
  // o "Prefere pelo WhatsApp?" do site some ou volta na hora (Publicar pelo WhatsApp, migração 20270806120000)
  updateTag(TAG_CONTATO_DAS_VAGAS);
  refresh();
  return { ok: true, mensagem: "Salvo. Os parâmetros valem a partir do próximo aviso." };
}

/** Cadastra na Meta os modelos que faltam e confere a aprovação de todos. */
export async function conferirModelosAgora(): Promise<Resultado> {
  const c = await banco();
  if (!c) return { ok: false, erro: "Só a equipe do Publike." };
  const cfg = configMeta();
  if (!cfg) return { ok: false, erro: "Faltam o WHATSAPP_TOKEN e o WHATSAPP_PHONE_ID na Vercel." };
  const { data } = await c.rpc("admin_whatsapp");
  const antes = ((data as { config?: { modelos?: SituacaoModelos } } | null)?.config?.modelos ?? {}) as SituacaoModelos;
  const r = await conferirModelos(
    cfg,
    antes,
    async (m) => {
      const { error } = await c.rpc("admin_whatsapp_salvar_modelos", { p_modelos: m });
      if (error) throw new Error(error.message);
    },
    true,
  ).catch((e: unknown) => ({ ok: false, erro: e instanceof Error ? e.message : String(e), modelos: antes }));
  if (!r.ok) return { ok: false, erro: `A Meta não respondeu: ${r.erro}` };
  refresh();
  const aprovados = Object.values(r.modelos).filter((m) => m.status === "APPROVED").length;
  return { ok: true, mensagem: `${aprovados} de ${Object.keys(r.modelos).length} modelos aprovados.` };
}

export type NumeroDaMeta = {
  ok: boolean;
  erro?: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  messaging_limit_tier?: string;
  name_status?: string;
  code_verification_status?: string;
  platform_type?: string;
  /** os apps inscritos no webhook da conta, ou por que não deu para conferir */
  webhook?: { apps: string[] } | { erro: string };
};

/** O número do Publike na Meta: o nome, a qualidade, o limite por dia, o registro na API e o webhook da conta. */
export async function conferirNumeroAgora(): Promise<NumeroDaMeta> {
  if (!(await banco())) return { ok: false, erro: "Só a equipe do Publike." };
  const cfg = configMeta();
  if (!cfg) return { ok: false, erro: "Faltam o WHATSAPP_TOKEN e o WHATSAPP_PHONE_ID na Vercel." };
  const [numero, webhook] = await Promise.all([conferirNumero(cfg), appsDoWebhook(cfg)]);
  return { ...numero, webhook: webhook.ok ? { apps: webhook.apps } : { erro: webhook.erro } };
}

/** Registra o número na API de nuvem com o PIN de 6 números (a Meta aceita 10 tentativas a cada 3 dias). */
export async function registrarNumeroAgora(pin: string): Promise<Resultado> {
  if (!(await banco())) return { ok: false, erro: "Só a equipe do Publike." };
  const cfg = configMeta();
  if (!cfg) return { ok: false, erro: "Faltam o WHATSAPP_TOKEN e o WHATSAPP_PHONE_ID na Vercel." };
  const p = String(pin ?? "").trim();
  if (!/^\d{6}$/.test(p)) return { ok: false, erro: "O PIN tem 6 números." };
  const r = await registrarNumero(cfg, p);
  if (!r.ok) return { ok: false, erro: `A Meta recusou: ${r.erro}` };
  return { ok: true, mensagem: "Número registrado na API. Guarde o PIN: é a confirmação em duas etapas do número." };
}

/** Inscreve o app no webhook da conta do WhatsApp (sem isso, a entrega, a leitura e os botões não chegam). */
export async function ligarWebhookAgora(): Promise<Resultado> {
  if (!(await banco())) return { ok: false, erro: "Só a equipe do Publike." };
  const cfg = configMeta();
  if (!cfg) return { ok: false, erro: "Faltam o WHATSAPP_TOKEN e o WHATSAPP_PHONE_ID na Vercel." };
  const r = await ligarWebhookDaConta(cfg);
  return r.ok ? { ok: true, mensagem: "Webhook ligado nesta conta." } : { ok: false, erro: `A Meta recusou: ${r.erro}` };
}

/**
 * Liga as conversões (migração 20270825120000): pede à Meta o conjunto de dados da conta do WhatsApp Business (cria se
 * não tem) e guarda o ID no banco. Daí em diante, a vaga publicada por quem veio de um anúncio volta para a Meta.
 */
export async function ligarConversoesAgora(): Promise<Resultado> {
  const c = await banco();
  if (!c) return { ok: false, erro: "Só a equipe do Publike." };
  const cfg = configMeta();
  if (!cfg) return { ok: false, erro: "Faltam o WHATSAPP_TOKEN e o WHATSAPP_PHONE_ID na Vercel." };
  const r = await datasetDaConta(cfg);
  if (!r.ok) return { ok: false, erro: `A Meta recusou: ${r.erro}` };
  const { error } = await c.rpc("admin_salvar_meta_dataset", { p_id: r.id });
  if (error)
    return {
      ok: false,
      erro:
        error.code === "PGRST202"
          ? "Falta aplicar a migração 20270825120000 no banco."
          : `A Meta devolveu o conjunto de dados ${r.id}, mas ele não ficou guardado: ${error.message}`,
    };
  refresh();
  return {
    ok: true,
    mensagem: `${r.criado ? "Conjunto de dados criado" : "Conjunto de dados encontrado"} (${r.id}). As conversões estão ligadas.`,
  };
}

/** A mensagem de teste da Meta (hello_world) para um dos números de teste. */
export async function mandarTesteWhatsapp(numero: string): Promise<Resultado> {
  const c = await banco();
  if (!c) return { ok: false, erro: "Só a equipe do Publike." };
  const cfg = configMeta();
  if (!cfg) return { ok: false, erro: "Faltam o WHATSAPP_TOKEN e o WHATSAPP_PHONE_ID na Vercel." };
  let n = String(numero ?? "").replace(/\D/g, "");
  if (n.length <= 11) n = `55${n}`;
  const { data } = await c.rpc("admin_whatsapp");
  const config = (data as { config?: { numeros_teste?: string[]; modelos?: SituacaoModelos } } | null)?.config;
  const lista = (config?.numeros_teste ?? []) as string[];
  if (!lista.includes(n)) return { ok: false, erro: "Ponha o número na lista de teste e salve antes." };
  const r = await enviarTeste(cfg, n, (config?.modelos ?? {}) as SituacaoModelos);
  if (!r.ok) return { ok: false, erro: `A Meta recusou: ${r.erro}` };
  return {
    ok: true,
    mensagem:
      r.modelo === "hello_world"
        ? "Mandamos o modelo de exemplo da Meta (em inglês). Confira no WhatsApp desse número."
        : r.modelo === "texto"
          ? "Mandamos uma mensagem de teste em texto. Confira no WhatsApp desse número."
          : `Mandamos o aviso ${r.modelo} com dados de exemplo. Confira no WhatsApp desse número.`,
  };
}

/**
 * O pedido do aceite a quem contrata (migração 20270726120000): o sino e o e-mail "Receber os candidatos no
 * WhatsApp?", uma vez para cada conta que ainda não respondeu. Tocar de novo só pede às contas novas.
 */
export async function pedirAceiteDoWhatsapp(): Promise<Resultado> {
  const c = await banco();
  if (!c) return { ok: false, erro: "Só a equipe do Publike." };
  const { data, error } = await c.rpc("admin_whatsapp_pedir_aceite");
  if (error) {
    if (error.code === "PGRST202") return { ok: false, erro: "Falta a migração 20270726120000 no banco." };
    console.error(`Publike: o pedido do aceite do WhatsApp não saiu: ${error.message}`);
    return { ok: false, erro: "Não deu para pedir agora. Tente de novo em instantes." };
  }
  const n = Number(data ?? 0);
  refresh();
  return {
    ok: true,
    mensagem: n
      ? `Pedido feito para ${n === 1 ? "1 conta" : `${n.toLocaleString("pt-BR")} contas`}, no sino e por e-mail.`
      : "Nenhuma conta nova para pedir: todas já receberam o pedido ou já responderam.",
  };
}

// --- O atendimento pelo WhatsApp (migração 20270801120000; claude/plano-whatsapp-atendimento.md) -------------------

/** Liga ou desliga a IA nas conversas e quantas respostas ela dá a cada número por dia. */
export async function salvarAtendimentoWhatsapp(ligado: boolean, porDia: number | string): Promise<Resultado> {
  const c = await banco();
  if (!c) return { ok: false, erro: "Só a equipe do Publike." };
  const n = inteiro(porDia, "As respostas por dia", 1, 200);
  if (typeof n === "string") return { ok: false, erro: n };
  const { error } = await c.rpc("admin_salvar_atendimento_whatsapp", { p_ligado: Boolean(ligado), p_por_dia: n });
  if (error) {
    if (error.code === "PGRST202") return { ok: false, erro: "Falta rodar a migração 20270801120000 no banco." };
    return { ok: false, erro: error.message || "Não deu para salvar agora." };
  }
  // sem o atendimento, o Publicar pelo WhatsApp não responde: o "Prefere pelo WhatsApp?" do site some na hora
  updateTag(TAG_CONTATO_DAS_VAGAS);
  refresh();
  return {
    ok: true,
    mensagem: ligado
      ? "Atendimento ligado: o Publike responde as próximas mensagens."
      : "Atendimento desligado: o número volta a dizer que só manda avisos.",
  };
}

/** A equipe pega a conversa (a IA fica quieta) ou devolve para a IA. */
export async function mudarConversaWhatsapp(
  conversa: string,
  situacao: "robo" | "equipe",
  /** ao devolver: manda os botões do começo de novo, no lugar de responder a última mensagem */
  comBotoes = false,
): Promise<Resultado> {
  const c = await banco();
  if (!c) return { ok: false, erro: "Só a equipe do Publike." };
  const { error } = await c.rpc("admin_whatsapp_conversa_situacao", { p_conversa: conversa, p_situacao: situacao });
  if (error) return { ok: false, erro: error.message || "Não deu para mudar agora." };
  // devolveu: a última mensagem da pessoa, se ficou sem resposta, é respondida agora (na janela de 24 horas)
  let respondendo = false;
  if (situacao === "robo") {
    const { data } = await c.rpc("admin_whatsapp_conversa_numero", { p_conversa: conversa });
    const d = data as { numero: string; janela_aberta: boolean } | null;
    if (d?.numero && d.janela_aberta) {
      respondendo = true;
      after(async () => {
        await retomarConversa(conversa, d.numero, { comBotoes: comBotoes === true }).catch((e) =>
          console.error("Publike: não deu para retomar a conversa do WhatsApp:", e instanceof Error ? e.message : e),
        );
      });
    }
  }
  refresh();
  return {
    ok: true,
    mensagem:
      situacao === "robo"
        ? respondendo
          ? comBotoes === true
            ? "O atendimento automático volta e manda os botões do começo. Atualize em uns segundos."
            : "O atendimento automático volta e já responde a última mensagem, se ficou sem resposta. Atualize em uns segundos."
          : "O atendimento automático volta a responder."
        : "O atendimento automático fica quieto nesta conversa.",
  };
}

/** A equipe responde pelo número do Publike (só na janela de 24 horas depois da última mensagem da pessoa). */
export async function responderConversaWhatsapp(conversa: string, texto: string): Promise<Resultado> {
  const c = await banco();
  if (!c) return { ok: false, erro: "Só a equipe do Publike." };
  const t = String(texto ?? "").trim();
  if (!t) return { ok: false, erro: "Escreva a resposta." };
  if (t.length > 4000) return { ok: false, erro: "A resposta passa de 4.000 letras." };
  const cfg = configMeta();
  if (!cfg) return { ok: false, erro: "Faltam o WHATSAPP_TOKEN e o WHATSAPP_PHONE_ID na Vercel." };
  const { data, error } = await c.rpc("admin_whatsapp_conversa_numero", { p_conversa: conversa });
  if (error || !data) return { ok: false, erro: error?.message || "Não achamos essa conversa." };
  const d = data as { numero: string; janela_aberta: boolean };
  if (!d.janela_aberta)
    return {
      ok: false,
      erro: "Passaram 24 horas desde a última mensagem da pessoa: a Meta só deixa responder com modelo aprovado.",
    };
  const r = await enviarTexto(cfg, d.numero, t);
  if (!r.ok) return { ok: false, erro: `A Meta recusou: ${r.erro}` };
  const { error: erroGravar } = await c.rpc("admin_whatsapp_conversa_registrar", {
    p_conversa: conversa,
    p_texto: t,
    p_wamid: r.wamid ?? "",
  });
  if (erroGravar) return { ok: false, erro: `Saiu, mas não ficou na conversa: ${erroGravar.message}` };
  refresh();
  return { ok: true, mensagem: "Enviada. O atendimento automático fica quieto nesta conversa até você devolver." };
}
