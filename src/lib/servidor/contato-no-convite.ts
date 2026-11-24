import "server-only";
import { MODO_DEMO } from "@/lib/config";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

// O contato dos talentos no convite (migração 20270626120000): nos planos, a empresa que pede conexão a um talento já
// vê o WhatsApp e o e-mail dele, e a conversa abre na hora. O talento escolhe em "Quem vê seu currículo".

/** Para quem contrata: o plano, os 15 dias grátis e o limite de 24 horas. */
export type AcessoAoContatoNoConvite = {
  /** a migração está no ar (sem ela, nada disso aparece) */
  disponivel: boolean;
  liberado: boolean;
  plano: boolean;
  /** o fim dos 15 dias grátis, enquanto valem */
  ate: string | null;
  /** a conta já usou os 15 dias */
  testou: boolean;
  /** liberado na promoção de lançamento, até `ate`, com os 30 do plano (migração 20270918140000) */
  promocao: boolean;
  /** contatos a cada 24 horas: 30 no plano, 5 nos 15 dias grátis */
  limite: number;
  /** quantos já viu nas últimas 24 horas */
  hoje: number;
  /** a partir de quando vale para quem já estava no Publike e não escolheu */
  valeEm: string | null;
};

const SEM_ACESSO: AcessoAoContatoNoConvite = {
  disponivel: false,
  liberado: false,
  plano: false,
  ate: null,
  testou: false,
  promocao: false,
  limite: 0,
  hoje: 0,
  valeEm: null,
};

export async function acessoAoContatoNoConvite(): Promise<AcessoAoContatoNoConvite> {
  if (MODO_DEMO) return SEM_ACESSO;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("meu_contato_no_convite");
  if (error || !data || typeof data !== "object") {
    if (error && error.code !== "PGRST202") console.error("Publike: não deu para ler o contato no convite:", error.message);
    return SEM_ACESSO;
  }
  const d = data as {
    plano?: boolean;
    testou?: boolean;
    sem_prazo?: boolean;
    ate?: string | null;
    limite?: number;
    hoje?: number;
    vale_em?: string | null;
    promocao?: boolean;
  };
  const plano = d.plano === true;
  const ate = typeof d.ate === "string" ? d.ate : null;
  return {
    disponivel: true,
    plano,
    ate,
    testou: d.testou === true,
    promocao: d.promocao === true,
    liberado: plano || Boolean(ate) || d.sem_prazo === true,
    limite: Number(d.limite) || 0,
    hoje: Number(d.hoje) || 0,
    valeEm: typeof d.vale_em === "string" ? d.vale_em : null,
  };
}

/**
 * Se o contato do talento vem no convite: "sim"; "desligado" (prefere só depois de aceitar); "aviso" (já estava no
 * Publike e não escolheu: vale a partir da data do aviso); "fora" (não deixou as empresas encontrarem o currículo).
 */
export type ContatoDoTalento = "sim" | "desligado" | "aviso" | "fora";

function lerContatoDoTalento(valor: unknown): ContatoDoTalento | null {
  return valor === "sim" || valor === "desligado" || valor === "aviso" || valor === "fora" ? valor : null;
}

/** Para quem contrata, na página do talento (null: não é empresa ou a migração não está no ar). */
export async function contatoNoConviteDe(talentoId: string): Promise<ContatoDoTalento | null> {
  if (MODO_DEMO || !UUID.test(talentoId)) return null;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("contato_no_convite_de", { p_talento: talentoId });
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: não deu para ler o contato do talento:", error.message);
    return null;
  }
  return lerContatoDoTalento(data);
}

/** Para quem procura: a escolha (null: ainda não escolheu), a situação de hoje e a data do aviso. */
export type MeuContatoNoConvite = {
  disponivel: boolean;
  escolha: boolean | null;
  situacao: ContatoDoTalento;
  valeEm: string | null;
};

export async function meuContatoNoConvite(): Promise<MeuContatoNoConvite> {
  const sem: MeuContatoNoConvite = { disponivel: false, escolha: null, situacao: "fora", valeEm: null };
  if (MODO_DEMO) return sem;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("meu_contato_no_convite_talento");
  if (error || !data || typeof data !== "object") {
    if (error && error.code !== "PGRST202") console.error("Publike: não deu para ler a escolha do contato:", error.message);
    return sem;
  }
  const d = data as { escolha?: boolean | null; situacao?: string; vale_em?: string | null };
  return {
    disponivel: true,
    escolha: typeof d.escolha === "boolean" ? d.escolha : null,
    situacao: lerContatoDoTalento(d.situacao) ?? "fora",
    valeEm: typeof d.vale_em === "string" ? d.vale_em : null,
  };
}
