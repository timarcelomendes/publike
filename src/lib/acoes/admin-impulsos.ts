"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { mensagemDeErro } from "@/lib/erros";
import {
  consultar,
  contasAcessiveis,
  contaDeAnuncios,
  ErroGoogleAds,
  situacaoGoogleAds,
} from "@/lib/servidor/google-ads-api";
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

/** Um impulso na lista do admin (admin_impulsos). */
export type ImpulsoDoAdmin = {
  id: string;
  conta: string;
  conta_id: string;
  anuncio_id: string | null;
  titulo: string;
  situacao: string;
  origem: "compra" | "credito" | "cortesia" | "admin";
  dias: number;
  valor: number;
  verba: number;
  gasto: number | null;
  campanha_id: string | null;
  criado_em: string;
  aprovado_em: string | null;
  ate: string | null;
  pausar: boolean;
  erro: string | null;
  erro_desde: string | null;
  motivo: string | null;
  sandbox: boolean;
  automatico?: boolean;
  /** a campanha do cliente da vaga (migração 20270430120000) */
  campanha_cliente_id?: string | null;
  /** o tipo da vaga pelo título (null: Outros) */
  tipo?: string | null;
  totais: { impressoes: number; cliques: number; visitas: number; curtidas: number };
};

/** A campanha de um cliente (várias vagas numa campanha só no Google). */
export type CampanhaDoAdmin = {
  id: string;
  conta_id: string;
  nome: string;
  situacao: string;
  dias: number;
  verba: number;
  criado_em: string;
  aprovado_em: string | null;
  ate: string | null;
  encerrado_em: string | null;
  motivo: string | null;
  erro: string | null;
  erro_desde: string | null;
  campanha_id: string | null;
};

/** O que cada tipo de vaga rendeu nos últimos 90 dias. */
export type ResultadoPorTipo = {
  tipo: string;
  impulsos: number;
  gasto: number;
  impressoes: number;
  cliques: number;
  visitas: number;
  curtidas: number;
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

const comTracos = (c: string) => c.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");

/**
 * Confere a ligação com o Google Ads de ponta a ponta, do jeito que o robô usa: lê a própria conta dos impulsos (com
 * a gestora no cabeçalho, quando há) e a forma de pagamento. Diz o que falta: o vínculo com a gestora, a configuração
 * da conta ou o cartão.
 */
export async function testarGoogleAds(): Promise<Resultado> {
  const c = await clienteDosImpulsos();
  if (!c) return { ok: false, erro: FORA };
  const s = situacaoGoogleAds();
  if (!s.ligado) return { ok: false, erro: `Falta no servidor: ${s.falta.join(", ")}.` };
  const minha = contaDeAnuncios();
  const gestora = (process.env.GOOGLE_ADS_CONTA_GESTORA || "").replace(/\D/g, "");
  let contas: string[];
  try {
    contas = await contasAcessiveis();
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Não deu para falar com o Google Ads." };
  }
  if (!contas.includes(minha) && !gestora)
    return {
      ok: false,
      erro: `O acesso funciona, mas não enxerga a conta ${comTracos(minha)}. Ele vê: ${contas.map(comTracos).join(", ") || "nenhuma"}.`,
    };
  try {
    const [linha] = await consultar<{ customer?: { descriptiveName?: string; status?: string; manager?: boolean } }>(
      "SELECT customer.id, customer.descriptive_name, customer.status, customer.manager FROM customer LIMIT 1",
    );
    const conta = linha?.customer;
    if (conta?.manager)
      return {
        ok: false,
        erro: `A ${comTracos(minha)} é uma conta de administrador. Em GOOGLE_ADS_CONTA vai a conta de anúncios (a Publike Impulsos), e a de administrador vai em GOOGLE_ADS_CONTA_GESTORA.`,
      };
    if (conta?.status && conta.status !== "ENABLED")
      return {
        ok: false,
        erro: `A conta ${comTracos(minha)} ainda não está ativa no Google Ads (${conta.status}). Termine a configuração dela.`,
      };
    const pagamento = await consultar<{ billingSetup?: { status?: string } }>(
      "SELECT billing_setup.id, billing_setup.status FROM billing_setup",
    ).catch(() => null);
    const comPagamento = pagamento?.some((b) => b.billingSetup?.status === "APPROVED");
    const nome = conta?.descriptiveName ? `${conta.descriptiveName} (${comTracos(minha)})` : comTracos(minha);
    if (pagamento && !comPagamento)
      return {
        ok: false,
        erro: `O acesso à ${nome} funciona, mas a conta está sem forma de pagamento aprovada: os anúncios não rodam. Cadastre o cartão em Faturamento.`,
      };
    // a conta está mesmo abaixo da administradora? (sem o vínculo, o robô entra direto, com o acesso do dono)
    const vinculada = gestora
      ? await consultar<{ customerClient?: { id?: string } }>(
          `SELECT customer_client.id FROM customer_client WHERE customer_client.id = ${Number(minha)}`,
          gestora,
        )
          .then((l) => l.length > 0)
          .catch(() => null)
      : null;
    const via =
      vinculada === true
        ? `, pela conta de administrador ${comTracos(gestora)}`
        : vinculada === false
          ? `, direto: ela ainda não está ligada à conta de administrador ${comTracos(gestora)} (aceite o convite de vínculo para ver tudo junto)`
          : "";
    return {
      ok: true,
      mensagem: `Ligado na ${nome}${via}${comPagamento ? ", com pagamento aprovado" : ""}.`,
    };
  } catch (e) {
    const codigos = e instanceof ErroGoogleAds ? e.codigos.join(" ") : "";
    if (/USER_PERMISSION_DENIED/.test(codigos) && gestora)
      return {
        ok: false,
        erro: `A conta ${comTracos(minha)} ainda não está ligada à conta de administrador ${comTracos(gestora)}. Aceite o convite de vínculo na ${comTracos(minha)} (Administrador › Acesso e segurança › Administradores) ou, enquanto isso, tire GOOGLE_ADS_CONTA_GESTORA da Vercel.`,
      };
    if (/CUSTOMER_NOT_ENABLED/.test(codigos))
      return {
        ok: false,
        erro: `A conta ${comTracos(minha)} ainda não está ativa no Google Ads. Termine a configuração dela (e o pagamento).`,
      };
    return { ok: false, erro: e instanceof Error ? e.message : "Não deu para ler a conta no Google Ads." };
  }
}

/** A campanha do cliente que está correndo (as vagas novas dele entram nela). */
export type CampanhaCorrendo = { id: string; situacao: string; ate: string | null; dias: number; verba: number };

export type VagaParaImpulso = {
  id: string;
  titulo: string;
  bairro: string;
  cidade: string;
  criado_em: string;
  expira_em: string | null;
  conta: string;
  conta_id: string;
  conta_tipo: string;
  com_salario: boolean;
  curtidas: number;
  parada: boolean;
  impulsionada: boolean;
  /** o tipo da vaga pelo título (null: Outros) e a sugestão dele (dias, verba por vaga, raio) */
  tipo_id: string | null;
  tipo: string | null;
  sugestao: { dias: number; verba: number; raio: number };
  campanha: CampanhaCorrendo | null;
};

/**
 * As vagas no ar de qualquer cliente: pelo título ou pelo nome de quem publicou, pelo tipo (o id ou "outros") ou todas
 * as de um cliente (as paradas primeiro).
 */
export async function vagasParaImpulso(
  busca: string,
  filtro: { tipo?: string | null; conta?: string | null } = {},
): Promise<{ ok: true; vagas: VagaParaImpulso[] } | { ok: false; erro: string }> {
  const c = await clienteDosImpulsos();
  if (!c) return { ok: false, erro: FORA };
  const tipo = filtro.tipo && (filtro.tipo === "outros" || UUID.test(filtro.tipo)) ? filtro.tipo : null;
  const conta = filtro.conta && UUID.test(filtro.conta) ? filtro.conta : null;
  const { data, error } = await c.rpc("admin_vagas_para_impulso", {
    p_busca: busca.slice(0, 80),
    p_tipo: tipo,
    p_conta: conta,
  });
  if (error) {
    if (error.code === "PGRST202") return { ok: false, erro: "Rode a migração 20270430120000_impulso_por_cliente.sql primeiro." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  return { ok: true, vagas: (data ?? []) as unknown as VagaParaImpulso[] };
}

/**
 * Impulsiona vagas de um cliente numa campanha só no Google, sem cobrar (a verba é do Publike). Se ele já tem uma
 * campanha correndo, as vagas entram nela e a verba soma.
 */
export async function impulsionarCliente(dados: {
  conta: string;
  anuncios: string[];
  dias: number | null;
  verba: number;
  avisar: boolean;
}): Promise<Resultado> {
  const c = await clienteDosImpulsos();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(dados.conta)) return { ok: false, erro: "Escolha o cliente." };
  const anuncios = [...new Set(dados.anuncios)].filter((id) => UUID.test(id));
  if (!anuncios.length || anuncios.length > 50) return { ok: false, erro: "Escolha de 1 a 50 vagas." };
  if (dados.dias !== null && (!Number.isInteger(dados.dias) || dados.dias < 1 || dados.dias > 30))
    return { ok: false, erro: "O impulso vai de 1 a 30 dias." };
  if (!(dados.verba >= anuncios.length && dados.verba <= 5000))
    return { ok: false, erro: "A verba vai de R$ 1 por vaga a R$ 5.000." };
  if (!situacaoGoogleAds().ligado) return { ok: false, erro: "Ligue o Google Ads antes (veja o alto da página)." };
  const { data, error } = await c.rpc("admin_impulsionar_cliente", {
    p_conta: dados.conta,
    p_anuncios: anuncios,
    p_dias: dados.dias,
    p_verba: Math.round(dados.verba * 100) / 100,
    p_avisar: dados.avisar,
  });
  if (error) {
    if (error.code === "PGRST202") return { ok: false, erro: "Rode a migração 20270430120000_impulso_por_cliente.sql primeiro." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  const r = data as { ok?: boolean; erro?: string; juntou?: boolean; vagas?: number } | null;
  if (!r?.ok) return { ok: false, erro: r?.erro ?? "Não deu para impulsionar." };
  after(() => cuidarDosImpulsos().catch(() => {}));
  refresh();
  const uma = r.vagas === 1;
  return {
    ok: true,
    mensagem: r.juntou
      ? uma
        ? "A vaga entrou na campanha que já corre para este cliente."
        : `As ${r.vagas} vagas entraram na campanha que já corre para este cliente.`
      : uma
        ? "Campanha criada. A vaga vai para o Google em instantes e entra no ar quando o Google aprovar."
        : `Campanha criada com ${r.vagas} vagas. Elas vão para o Google em instantes e entram no ar quando o Google aprovar.`,
  };
}

/** Para a campanha do cliente inteira: as vagas antes do ar voltam; as no ar saem do Google na próxima volta. */
export async function pararCampanhaDoCliente(id: string): Promise<Resultado> {
  const c = await clienteDosImpulsos();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const { data, error } = await c.rpc("admin_parar_campanha", { p_id: id });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  const r = data as { ok?: boolean; erro?: string } | null;
  if (!r?.ok) return { ok: false, erro: r?.erro ?? "Não deu para parar." };
  after(() => cuidarDosImpulsos().catch(() => {}));
  refresh();
  return { ok: true, mensagem: "Parando. As vagas saem do Google em instantes." };
}

/** Um tipo de vaga: as palavras do título que o definem e as regras dele (vazio segue a regra geral). */
export type TipoDeVaga = {
  id: string | null;
  nome: string;
  palavras: string[];
  menos: string[];
  dias: number | null;
  verba: number | null;
  raio: number | null;
  /** quantas vagas no ar o tipo pega agora (só para ler) */
  vagas?: number;
};

/** Grava a lista inteira de tipos, na ordem dela (o que não veio sai). */
export async function salvarTiposDeVaga(tipos: TipoDeVaga[]): Promise<Resultado> {
  const c = await clienteDosImpulsos();
  if (!c) return { ok: false, erro: FORA };
  if (tipos.length > 40) return { ok: false, erro: "Até 40 tipos." };
  const limpos = tipos.map((t) => ({
    id: t.id && UUID.test(t.id) ? t.id : null,
    nome: t.nome.trim().slice(0, 40),
    palavras: t.palavras.map((p) => p.trim()).filter(Boolean).slice(0, 40),
    menos: t.menos.map((p) => p.trim()).filter(Boolean).slice(0, 40),
    dias: t.dias ?? null,
    verba: t.verba ?? null,
    raio: t.raio ?? null,
  }));
  for (const t of limpos) {
    if (t.nome.length < 2) return { ok: false, erro: "Todo tipo precisa de um nome." };
    if (!t.palavras.length) return { ok: false, erro: `"${t.nome}" precisa de pelo menos uma palavra.` };
    if (t.dias !== null && !(Number.isInteger(t.dias) && t.dias >= 1 && t.dias <= 30))
      return { ok: false, erro: `"${t.nome}": os dias vão de 1 a 30.` };
    if (t.verba !== null && !(t.verba >= 1 && t.verba <= 1000))
      return { ok: false, erro: `"${t.nome}": a verba por vaga vai de R$ 1 a R$ 1.000.` };
    if (t.raio !== null && !(Number.isInteger(t.raio) && t.raio >= 1 && t.raio <= 65))
      return { ok: false, erro: `"${t.nome}": o raio vai de 1 a 65 km.` };
  }
  const { data, error } = await c.rpc("admin_salvar_tipos", { p_tipos: limpos as unknown as Json });
  if (error) {
    if (error.code === "PGRST202") return { ok: false, erro: "Rode a migração 20270430120000_impulso_por_cliente.sql primeiro." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  const r = data as { ok?: boolean; erro?: string } | null;
  if (!r?.ok) return { ok: false, erro: r?.erro ?? "Não deu para salvar." };
  refresh();
  return { ok: true, mensagem: "Tipos salvos." };
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
