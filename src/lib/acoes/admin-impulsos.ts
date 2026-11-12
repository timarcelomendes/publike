"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { mensagemDeErro } from "@/lib/erros";
import { contasAcessiveis, contaDeAnuncios, situacaoGoogleAds } from "@/lib/servidor/google-ads-api";
import { cuidarDosImpulsos } from "@/lib/servidor/impulsos";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import { clienteAdminOuNulo, type ClienteBanco } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Json } from "@/lib/supabase/tipos-banco";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// Admin › Impulsos (migração 20270423120000): os preços, o impulso grátis, o raio e a ligação com o Google Ads.

const FORA = "Só a equipe do Publike mexe nos impulsos.";

/**
 * O admin do computador do dono (a chave secreta) ou, no site no ar, a equipe publike.org com a própria conta (sem a
 * chave secreta; o banco confere de novo em cada função e registra quem fez).
 */
async function clienteDosImpulsos(): Promise<ClienteBanco | null> {
  const admin = await clienteAdminOuNulo();
  if (admin) return admin;
  return (await possoVerTela("/admin/impulsos")) ? await criarClienteServidor() : null;
}

export type PrecoImpulso = { dias: number; valor: number; verba: number; ligado: boolean };
export type ConfigImpulso = {
  cortesia_ligada: boolean;
  cortesia_dias: number;
  cortesia_verba: number;
  raio_capital: number;
  raio_outras: number;
  // o impulso automático do Publike nas vagas paradas (migração 20270428120000)
  auto_ligado: boolean;
  auto_verba_mes: number;
  auto_dias: number;
  auto_verba: number;
  auto_simultaneos: number;
  auto_avisar: boolean;
};

export async function salvarImpulsoAdmin(precos: PrecoImpulso[], config: ConfigImpulso): Promise<Resultado> {
  const c = await clienteDosImpulsos();
  if (!c) return { ok: false, erro: FORA };
  for (const p of precos) {
    if (!(p.valor >= 5 && p.valor <= 10000) || !(p.verba >= 1 && p.verba < p.valor))
      return { ok: false, erro: `Confira o impulso de ${p.dias} dias: a verba tem de ser menor que o preço.` };
  }
  if (!(config.cortesia_dias >= 1 && config.cortesia_dias <= 15) || !(config.cortesia_verba >= 1 && config.cortesia_verba <= 200))
    return { ok: false, erro: "O impulso grátis vai de 1 a 15 dias, com R$ 1 a R$ 200 de anúncio." };
  if (![config.raio_capital, config.raio_outras].every((r) => Number.isInteger(r) && r >= 1 && r <= 65))
    return { ok: false, erro: "O raio vai de 1 a 65 km." };
  if (!(config.auto_verba_mes >= 0 && config.auto_verba_mes <= 20000))
    return { ok: false, erro: "O teto do mês do automático vai de R$ 0 a R$ 20.000." };
  if (!(Number.isInteger(config.auto_dias) && config.auto_dias >= 1 && config.auto_dias <= 15))
    return { ok: false, erro: "O impulso automático vai de 1 a 15 dias." };
  if (!(config.auto_verba >= 1 && config.auto_verba <= 500))
    return { ok: false, erro: "Cada impulso automático leva de R$ 1 a R$ 500." };
  if (!(Number.isInteger(config.auto_simultaneos) && config.auto_simultaneos >= 1 && config.auto_simultaneos <= 50))
    return { ok: false, erro: "Ao mesmo tempo, de 1 a 50 vagas." };
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
  const c = await clienteDosImpulsos();
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

export type VagaParaImpulso = {
  id: string;
  titulo: string;
  bairro: string;
  cidade: string;
  conta: string;
  curtidas: number;
  parada: boolean;
  impulsionada: boolean;
};

/** As vagas no ar de qualquer cliente, pelo título ou pelo nome de quem publicou (as paradas primeiro). */
export async function vagasParaImpulso(busca: string): Promise<{ ok: true; vagas: VagaParaImpulso[] } | { ok: false; erro: string }> {
  const c = await clienteDosImpulsos();
  if (!c) return { ok: false, erro: FORA };
  const { data, error } = await c.rpc("admin_vagas_para_impulso", { p_busca: busca.slice(0, 80) });
  if (error) {
    if (error.code === "PGRST202") return { ok: false, erro: "Rode a migração 20270424120000_impulso_pelo_admin.sql primeiro." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  return { ok: true, vagas: (data ?? []) as unknown as VagaParaImpulso[] };
}

/** Impulsiona a vaga de um cliente sem cobrar (origem 'admin'): o robô cria o anúncio na próxima volta. */
export async function impulsionarPeloAdmin(dados: {
  anuncio: string;
  dias: number;
  verba: number;
  avisar: boolean;
}): Promise<Resultado> {
  const c = await clienteDosImpulsos();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(dados.anuncio)) return { ok: false, erro: "Escolha a vaga." };
  if (!Number.isInteger(dados.dias) || dados.dias < 1 || dados.dias > 30)
    return { ok: false, erro: "O impulso vai de 1 a 30 dias." };
  if (!(dados.verba >= 1 && dados.verba <= 1000)) return { ok: false, erro: "A verba vai de R$ 1 a R$ 1.000." };
  if (!situacaoGoogleAds().ligado) return { ok: false, erro: "Ligue o Google Ads antes (veja Está tudo ok?)." };
  const { data, error } = await c.rpc("admin_impulsionar", {
    p_anuncio: dados.anuncio,
    p_dias: dados.dias,
    p_verba: dados.verba,
    p_avisar: dados.avisar,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  const r = data as { ok?: boolean; erro?: string } | null;
  if (!r?.ok) return { ok: false, erro: r?.erro ?? "Não deu para impulsionar." };
  after(() => cuidarDosImpulsos().catch(() => {}));
  refresh();
  return { ok: true, mensagem: "Impulso criado. O anúncio vai para o Google em instantes e entra no ar quando for aprovado." };
}

/** Para um impulso: antes de entrar no ar, cancela; no ar, o robô tira do Google. */
export async function pararImpulsoPeloAdmin(id: string): Promise<Resultado> {
  const c = await clienteDosImpulsos();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const { data, error } = await c.rpc("admin_parar_impulso", { p_id: id });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  const r = data as { ok?: boolean; erro?: string } | null;
  if (!r?.ok) return { ok: false, erro: r?.erro ?? "Não deu para parar." };
  after(() => cuidarDosImpulsos().catch(() => {}));
  refresh();
  return { ok: true, mensagem: "Parado." };
}
