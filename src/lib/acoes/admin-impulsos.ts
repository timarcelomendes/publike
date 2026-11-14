"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { mensagemDeErro } from "@/lib/erros";
import { formatarMoeda } from "@/lib/formato";
import { VERBA_MINIMA_POR_DIA } from "@/lib/impulso";
import {
  consultar,
  contasAcessiveis,
  contaDeAnuncios,
  ErroGoogleAds,
  situacaoGoogleAds,
} from "@/lib/servidor/google-ads-api";
import { emLista } from "@/lib/constantes";
import { conferirCidadesNoGoogle, cuidarDosImpulsos } from "@/lib/servidor/impulsos";
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
  // o ajuste diário, em beta (migração 20270509120000; antes dela, não vem)
  motor_ligado?: boolean;
  motor_teto_clique?: number;
  motor_raio_max?: number;
  // o teto do clique do impulso, ao nascer e nos que estão no ar (migração 20270512120000; antes dela, não vem)
  teto_clique?: number;
} & Partial<ConfigPacote> & {
  // a campanha geral (migração 20270519120000): a última vez que o robô acertou o orçamento, o valor e o último erro
  geral_feita_em?: string | null;
  geral_valor?: number | null;
  geral_erro?: string | null;
  geral_erro_em?: string | null;
};

/** As chaves das regras do impulso no Google: o formulário delas não mexe no pacote de candidatos (nem o contrário). */
const CHAVES_DO_GOOGLE = [
  "cortesia_ligada",
  "cortesia_dias",
  "cortesia_verba",
  "raio_capital",
  "raio_outras",
  "auto_ligado",
  "auto_verba_mes",
  "auto_dias",
  "auto_verba",
  "auto_simultaneos",
  "auto_avisar",
  "motor_ligado",
  "motor_teto_clique",
  "motor_raio_max",
  "teto_clique",
] as const;

/** Um pacote de candidatos à venda (migração 20270519120000). */
export type PacoteAVenda = { candidatos: number; valor: number; ligado: boolean };

/**
 * O pacote de candidatos (claude/plano-nova-venda-do-impulso.md; migração 20270519120000): a venda, os dias no destaque,
 * a verba por dia que cada pacote soma à campanha geral e a campanha geral que o robô acerta.
 */
export type ConfigPacote = {
  pacote_ligado: boolean;
  pacote_dias: number;
  pacote_verba_dia: number;
  geral_ligada: boolean;
  geral_conta: string | null;
  geral_campanha_id: string | null;
  geral_base: number;
  geral_maximo: number;
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
  /** a garantia da verba (migração 20270518120000): quando o prazo foi estendido e o fim de antes */
  estendido_em?: string | null;
  ate_original?: string | null;
  /** o pacote de candidatos (migração 20270519120000): quantos ele traz, quantos chegaram e a verba por dia na geral */
  produto?: "google" | "candidatos";
  alvo?: number | null;
  entregues?: number | null;
  verba_dia?: number | null;
  totais: {
    impressoes: number;
    cliques: number;
    visitas: number;
    curtidas: number;
    visitas_quadro?: number;
    curtidas_quadro?: number;
  };
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
  /** a garantia da verba (migração 20270518120000): quando o prazo foi estendido e o fim de antes */
  estendido_em?: string | null;
  ate_original?: string | null;
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
  // menos de R$ 10 por dia no Google não vale a pena (13/11/2026, migração 20270516120000)
  const pouco = (verba: number, dias: number) => verba < VERBA_MINIMA_POR_DIA * dias - 0.005;
  const abaixo = precos.find((p) => p.ligado && pouco(p.verba, p.dias));
  if (abaixo)
    return {
      ok: false,
      erro: `O impulso de ${abaixo.dias} dias precisa de ao menos ${formatarMoeda(VERBA_MINIMA_POR_DIA * abaixo.dias)} no Google (R$ 10 por dia).`,
    };
  if (pouco(config.cortesia_verba, config.cortesia_dias))
    return { ok: false, erro: `O impulso grátis precisa de ao menos ${formatarMoeda(VERBA_MINIMA_POR_DIA * config.cortesia_dias)} no Google (R$ 10 por dia).` };
  if (pouco(config.auto_verba, config.auto_dias))
    return { ok: false, erro: `Cada impulso automático precisa de ao menos ${formatarMoeda(VERBA_MINIMA_POR_DIA * config.auto_dias)} no Google (R$ 10 por dia).` };
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
  if (config.motor_teto_clique !== undefined && !(config.motor_teto_clique >= 1 && config.motor_teto_clique <= 10))
    return { ok: false, erro: "O teto do clique do ajuste diário vai de R$ 1 a R$ 10." };
  if (
    config.motor_raio_max !== undefined &&
    !(Number.isInteger(config.motor_raio_max) && config.motor_raio_max >= 0 && config.motor_raio_max <= 30)
  )
    return { ok: false, erro: "O raio a mais do ajuste diário vai de 0 a 30 km." };
  if (config.teto_clique !== undefined) {
    if (!(config.teto_clique >= 0.5 && config.teto_clique <= 10))
      return { ok: false, erro: "O teto do clique vai de R$ 0,50 a R$ 10." };
    if (config.motor_teto_clique !== undefined && config.teto_clique > config.motor_teto_clique)
      return { ok: false, erro: "O teto do clique não pode passar do teto do ajuste diário." };
  }
  // só as regras do impulso no Google: o pacote de candidatos tem o próprio formulário (salvarPacoteAdmin)
  const soDoGoogle = Object.fromEntries(CHAVES_DO_GOOGLE.filter((k) => k in config).map((k) => [k, config[k]]));
  const { error } = await c.rpc("admin_salvar_impulso", {
    p_precos: precos as unknown as Json,
    p_config: soDoGoogle as unknown as Json,
  });
  if (error) {
    if (error.code === "PGRST202") return { ok: false, erro: "Rode a migração 20270423120000_impulsionar.sql primeiro." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  // o raio mudou: o banco manda medir os impulsos no ar (migração 20270504120000), e o robô troca o raio no Google já;
  // o teto mudou: o robô leva o novo às campanhas no ar na mesma volta (migração 20270512120000)
  after(() => cuidarDosImpulsos().catch(() => {}));
  refresh();
  return { ok: true, mensagem: "Salvo." };
}

/**
 * O pacote de candidatos (migração 20270519120000): os preços, a venda, os dias no destaque, a verba por dia na campanha
 * geral e o robô que acerta o orçamento dela. Mudou a campanha geral, o robô acerta na volta seguinte.
 */
export async function salvarPacoteAdmin(pacotes: PacoteAVenda[], config: ConfigPacote): Promise<Resultado> {
  const c = await clienteDosImpulsos();
  if (!c) return { ok: false, erro: FORA };
  for (const p of pacotes) {
    if (!(Number.isInteger(p.candidatos) && p.candidatos >= 1 && p.candidatos <= 100))
      return { ok: false, erro: "O pacote vai de 1 a 100 candidatos." };
    if (!(p.valor >= 5 && p.valor <= 10000))
      return { ok: false, erro: `Confira o preço do pacote de ${p.candidatos} candidatos (de R$ 5 a R$ 10.000).` };
  }
  if (!(Number.isInteger(config.pacote_dias) && config.pacote_dias >= 1 && config.pacote_dias <= 60))
    return { ok: false, erro: "O pacote fica no destaque de 1 a 60 dias." };
  if (!(config.pacote_verba_dia >= 0 && config.pacote_verba_dia <= 100))
    return { ok: false, erro: "A verba por dia de cada pacote na campanha geral vai de R$ 0 a R$ 100." };
  if (!(config.geral_base >= 1 && config.geral_base <= 5000) || !(config.geral_maximo >= 1 && config.geral_maximo <= 5000))
    return { ok: false, erro: "A base e o máximo da campanha geral vão de R$ 1 a R$ 5.000 por dia." };
  if (config.geral_maximo < config.geral_base)
    return { ok: false, erro: "O máximo da campanha geral não pode ser menor que a base." };
  const conta = (config.geral_conta ?? "").replace(/\D/g, "");
  const campanha = (config.geral_campanha_id ?? "").replace(/\D/g, "");
  if (conta && conta.length !== 10) return { ok: false, erro: "A conta do Google Ads tem 10 números (948-395-5066)." };
  if (campanha && campanha.length > 20) return { ok: false, erro: "Confira o número da campanha geral." };
  if (config.geral_ligada && (!conta || !campanha))
    return { ok: false, erro: "Para o robô acertar a campanha geral, diga a conta e o número da campanha." };
  const { error } = await c.rpc("admin_salvar_impulso", {
    p_precos: [] as unknown as Json,
    p_config: {
      pacotes,
      pacote_ligado: config.pacote_ligado,
      pacote_dias: config.pacote_dias,
      pacote_verba_dia: Math.round(config.pacote_verba_dia * 100) / 100,
      geral_ligada: config.geral_ligada,
      geral_conta: conta,
      geral_campanha_id: campanha,
      geral_base: Math.round(config.geral_base * 100) / 100,
      geral_maximo: Math.round(config.geral_maximo * 100) / 100,
    } as unknown as Json,
  });
  if (error) {
    if (error.code === "PGRST202") return { ok: false, erro: "Rode a migração 20270519120000 primeiro." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  // com o robô ligado, o orçamento da campanha geral acerta já
  if (config.geral_ligada) after(() => cuidarDosImpulsos().catch(() => {}));
  refresh();
  return { ok: true, mensagem: "Salvo." };
}

/**
 * O presente do Publike no piloto (migração 20270519120000): um pacote de candidatos em cada vaga escolhida, sem custo
 * para o cliente. A vaga entra no quadro das vagas impulsionadas na hora; não precisa do Google Ads ligado.
 */
export async function darPacotes(dados: {
  anuncios: string[];
  candidatos: number;
  dias: number;
  avisar: boolean;
}): Promise<Resultado> {
  const c = await clienteDosImpulsos();
  if (!c) return { ok: false, erro: FORA };
  const anuncios = [...new Set(dados.anuncios)].filter((id) => UUID.test(id));
  if (!anuncios.length || anuncios.length > 50) return { ok: false, erro: "Escolha de 1 a 50 vagas." };
  if (!(Number.isInteger(dados.candidatos) && dados.candidatos >= 1 && dados.candidatos <= 100))
    return { ok: false, erro: "O pacote vai de 1 a 100 candidatos." };
  if (!(Number.isInteger(dados.dias) && dados.dias >= 1 && dados.dias <= 60))
    return { ok: false, erro: "O pacote fica no destaque de 1 a 60 dias." };
  const { data, error } = await c.rpc("admin_dar_pacotes", {
    p_anuncios: anuncios,
    p_candidatos: dados.candidatos,
    p_dias: dados.dias,
    p_avisar: dados.avisar,
  });
  if (error) {
    if (error.code === "PGRST202") return { ok: false, erro: "Rode a migração 20270519120000 primeiro." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  const r = data as { ok?: boolean; erro?: string; feitas?: number; fora?: { titulo: string; motivo: string }[] } | null;
  if (!r?.ok) {
    const motivo = r?.fora?.[0] ? ` ${r.fora[0].titulo}: ${r.fora[0].motivo}` : "";
    return { ok: false, erro: `${r?.erro ?? "Não deu para dar o pacote."}${motivo}` };
  }
  // a verba da campanha geral sobe com os pacotes novos
  after(() => cuidarDosImpulsos().catch(() => {}));
  refresh();
  const feitas = Number(r.feitas ?? 0);
  const fora = r.fora?.length ?? 0;
  return {
    ok: true,
    mensagem:
      (feitas === 1 ? "A vaga entrou no destaque." : `As ${feitas} vagas entraram no destaque.`) +
      (fora ? ` ${fora === 1 ? "Uma não pôde" : `${fora} não puderam`}: ${r.fora!.map((x) => x.titulo).join(", ")}.` : ""),
  };
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
    // as cidades em que os impulsos aparecem (13/11/2026): sem elas, o robô fica no raio em volta da vaga
    const cidades = await conferirCidadesNoGoogle().catch((e: unknown) => (e instanceof Error ? e.message : "erro"));
    const nasCidades =
      typeof cidades === "string"
        ? ` As cidades do Publike não vieram do Google (${cidades}): os impulsos ficam no raio em volta da vaga.`
        : cidades.faltam.length
          ? ` ${cidades.achadas} das ${cidades.total} cidades do Publike estão no Google (faltam ${emLista(cidades.faltam)}).`
          : ` As ${cidades.total} cidades do Publike estão no Google.`;
    return {
      ok: true,
      mensagem: `Ligado na ${nome}${via}${comPagamento ? ", com pagamento aprovado" : ""}.${nasCidades}`,
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

/**
 * O "Atualizar" da aba Agora (13/11/2026, pedido do Marcelo): os números de cada impulso no ar vêm do Google já, sem
 * esperar a medida de 2 em 2 horas. O banco põe os impulsos no ar na fila da medida (`admin_medir_impulsos_agora`) e o
 * robô roda uma volta aqui mesmo. Quando a volta das filas está no meio (uma por vez), a medida fica para a volta
 * seguinte, em 1 minuto, e a tela se atualiza sozinha (`AtualizarImpulsos`).
 */
export async function atualizarImpulsos(): Promise<Resultado & { esperar?: boolean }> {
  const c = await clienteDosImpulsos();
  if (!c) return { ok: false, erro: FORA };
  if (!situacaoGoogleAds().ligado) return { ok: false, erro: "Ligue o Google Ads antes (veja o alto da página)." };
  const { data, error } = await c.rpc("admin_medir_impulsos_agora");
  if (error) {
    if (error.code === "PGRST202")
      return { ok: false, erro: "Rode a migração 20270514120000_impulso_atualizar_agora.sql primeiro." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  if (!Number(data)) {
    refresh();
    return { ok: true, mensagem: "Nenhum impulso no ar para buscar no Google. A tela foi atualizada." };
  }
  const volta = await cuidarDosImpulsos().catch(() => null);
  refresh();
  return volta?.feitos
    ? { ok: true, mensagem: "Pronto: os números são os do Google agora." }
    : {
        ok: true,
        mensagem: "O robô estava no meio de uma volta. Os números do Google chegam em 1 minuto, e a tela se atualiza sozinha.",
        esperar: true,
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
  // o raio de um tipo vale também para os impulsos no ar dele: o robô troca no Google já (migração 20270504120000)
  after(() => cuidarDosImpulsos().catch(() => {}));
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
