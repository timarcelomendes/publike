"use server";

import { refresh, updateTag } from "next/cache";
import { TAG_CONTATO_DAS_VAGAS } from "@/lib/servidor/numero-do-publike";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import { clienteAdminOuNulo, type ClienteBanco } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { CHAVES_TEXTOS_VAGAS, LIMITES_VAGAS_WHATSAPP, TEXTOS_VAGAS } from "@/lib/vagas-pelo-whatsapp";

// Admin › Publicar pelo WhatsApp (migração 20270806120000): ligar e desligar o recurso e cada parte dele, os limites e
// os textos das respostas. No computador do dono e, no site no ar, para a equipe publike.org.

async function banco(): Promise<ClienteBanco | null> {
  const admin = await clienteAdminOuNulo();
  return admin ?? ((await possoVerTela("/admin/publicar-pelo-whatsapp")) ? await criarClienteServidor() : null);
}

export type ConfigVagasDoAdmin = {
  ligado: boolean;
  fotos: boolean;
  pdf: boolean;
  texto: boolean;
  por_mensagem: number | string;
  leituras_dia: number | string;
  confirmar: boolean;
  oferecer_avisos: boolean;
  no_site: boolean;
  textos: Record<string, string>;
};

const inteiro = (v: number | string, [min, max]: readonly [number, number]) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

export async function salvarVagasPeloWhatsapp(dados: ConfigVagasDoAdmin): Promise<Resultado> {
  const c = await banco();
  if (!c) return { ok: false, erro: "Só a equipe do Publike." };
  const porMensagem = inteiro(dados.por_mensagem, LIMITES_VAGAS_WHATSAPP.por_mensagem.faixa);
  if (porMensagem == null) return { ok: false, erro: "As vagas por mensagem vão de 1 a 10." };
  const leiturasDia = inteiro(dados.leituras_dia, LIMITES_VAGAS_WHATSAPP.leituras_dia.faixa);
  if (leiturasDia == null) return { ok: false, erro: "As leituras por número por dia vão de 1 a 50." };
  // só os textos mudados (igual ao padrão ou vazio: vale o padrão)
  const textos: Record<string, string> = {};
  for (const k of CHAVES_TEXTOS_VAGAS) {
    const v = (dados.textos?.[k] ?? "").replace(/\r/g, "").trim();
    if (!v || v === TEXTOS_VAGAS[k].padrao) continue;
    if (v.length > TEXTOS_VAGAS[k].max)
      return { ok: false, erro: `“${TEXTOS_VAGAS[k].nome}” vai até ${TEXTOS_VAGAS[k].max} letras.` };
    textos[k] = v;
  }
  const { error } = await c.rpc("admin_salvar_whatsapp_vagas", {
    p_ligado: Boolean(dados.ligado),
    p_fotos: Boolean(dados.fotos),
    p_pdf: Boolean(dados.pdf),
    p_texto: Boolean(dados.texto),
    p_por_mensagem: porMensagem,
    p_leituras_dia: leiturasDia,
    p_confirmar: Boolean(dados.confirmar),
    p_oferecer_avisos: Boolean(dados.oferecer_avisos),
    p_no_site: Boolean(dados.no_site),
    p_textos: textos,
  });
  if (error) {
    console.error("Publike: não deu para salvar o Publicar pelo WhatsApp:", error.message);
    return {
      ok: false,
      erro: error.code === "PGRST202" ? "Falta a migração 20270806120000 neste banco." : "Não deu para salvar. Tente de novo.",
    };
  }
  // o "Prefere pelo WhatsApp?" do site muda na hora (sem esperar o cache de horas)
  updateTag(TAG_CONTATO_DAS_VAGAS);
  refresh();
  return { ok: true, mensagem: "Salvo. Vale para a próxima mensagem que chegar." };
}
