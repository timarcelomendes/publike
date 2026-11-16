"use server";

import { refresh } from "next/cache";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import {
  appsDoWebhook,
  conferirModelos,
  conferirNumero,
  configMeta,
  enviarTeste,
  ligarWebhookDaConta,
  registrarNumero,
  type SituacaoModelos,
} from "@/lib/servidor/whatsapp";
import { clienteAdminOuNulo, type ClienteBanco } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { TIPOS_WHATSAPP } from "@/lib/whatsapp-tipos";

// Admin › WhatsApp (migração 20270619120000; claude/plano-whatsapp-oficial.md): ligar, o modo de teste, os limites,
// cadastrar e conferir os modelos na Meta, o número e a mensagem de teste. Só a equipe publike.org.

async function banco(): Promise<ClienteBanco | null> {
  const admin = await clienteAdminOuNulo();
  return admin ?? ((await possoVerTela("/admin/whatsapp")) ? await criarClienteServidor() : null);
}

const TIPOS = TIPOS_WHATSAPP.map((t) => t.tipo);

export async function salvarWhatsapp(dados: {
  ativo: boolean;
  paraTodos: boolean;
  numerosTeste: string;
  limiteDia: number;
  limiteMes: number;
  porContaDia: number;
  tiposLigados: string[];
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
  const ligados = new Set((dados.tiposLigados ?? []).filter((t) => TIPOS.includes(t)));
  const { error } = await c.rpc("admin_salvar_whatsapp", {
    p_ativo: Boolean(dados.ativo),
    p_para_todos: Boolean(dados.paraTodos),
    p_numeros_teste: numeros,
    p_limite_dia: Math.round(Number(dados.limiteDia) || 0),
    p_limite_mes: Math.round(Number(dados.limiteMes) || 0),
    p_por_conta_dia: Math.round(Number(dados.porContaDia) || 1),
    p_tipos_desligados: TIPOS.filter((t) => !ligados.has(t)),
  });
  if (error) return { ok: false, erro: error.message || "Não deu para salvar agora." };
  refresh();
  return { ok: true, mensagem: "Salvo." };
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
        : `Mandamos o aviso ${r.modelo} com dados de exemplo. Confira no WhatsApp desse número.`,
  };
}
