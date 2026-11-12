"use server";

import { refresh } from "next/cache";
import { mensagemDeErro } from "@/lib/erros";
import { contasAcessiveis, contaDeAnuncios, situacaoGoogleAds } from "@/lib/servidor/google-ads-api";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/tipos-banco";
import type { Resultado } from "@/lib/tipos";

// Admin › Impulsos (migração 20270423120000): os preços, o impulso grátis, o raio e a ligação com o Google Ads.

const FORA = "O admin só funciona no seu computador, com o site rodando em modo de desenvolvimento.";

export type PrecoImpulso = { dias: number; valor: number; verba: number; ligado: boolean };
export type ConfigImpulso = {
  cortesia_ligada: boolean;
  cortesia_dias: number;
  cortesia_verba: number;
  raio_capital: number;
  raio_outras: number;
};

export async function salvarImpulsoAdmin(precos: PrecoImpulso[], config: ConfigImpulso): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  for (const p of precos) {
    if (!(p.valor >= 5 && p.valor <= 10000) || !(p.verba >= 1 && p.verba < p.valor))
      return { ok: false, erro: `Confira o impulso de ${p.dias} dias: a verba tem de ser menor que o preço.` };
  }
  if (!(config.cortesia_dias >= 1 && config.cortesia_dias <= 15) || !(config.cortesia_verba >= 1 && config.cortesia_verba <= 200))
    return { ok: false, erro: "O impulso grátis vai de 1 a 15 dias, com R$ 1 a R$ 200 de anúncio." };
  if (![config.raio_capital, config.raio_outras].every((r) => Number.isInteger(r) && r >= 1 && r <= 65))
    return { ok: false, erro: "O raio vai de 1 a 65 km." };
  const { error } = await c.rpc("admin_salvar_impulso", {
    p_precos: precos as unknown as Json,
    p_config: config as unknown as Json,
  });
  if (error) {
    if (error.code === "PGRST202") return { ok: false, erro: "Rode a migração 20270423120000_impulsionar.sql primeiro." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  refresh();
  return { ok: true, mensagem: "Salvo." };
}

/** Confere a ligação com o Google Ads: o acesso e se a conta de anúncios está entre as que ele enxerga. */
export async function testarGoogleAds(): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const s = situacaoGoogleAds();
  if (!s.ligado) return { ok: false, erro: `Falta no servidor: ${s.falta.join(", ")}.` };
  try {
    const contas = await contasAcessiveis();
    const minha = contaDeAnuncios();
    if (!contas.includes(minha) && !process.env.GOOGLE_ADS_CONTA_GESTORA)
      return {
        ok: false,
        erro: `O acesso funciona, mas não enxerga a conta ${minha}. Ele vê: ${contas.join(", ") || "nenhuma"}.`,
      };
    return { ok: true, mensagem: `Ligado. O acesso enxerga ${contas.length} ${contas.length === 1 ? "conta" : "contas"}.` };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Não deu para falar com o Google Ads." };
  }
}
