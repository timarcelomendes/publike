"use server";

import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { mensagemDeErro } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { avisosParaEscolher, TIPOS_WHATSAPP } from "@/lib/whatsapp-tipos";

// O aceite do WhatsApp (migração 20261231120000; claude/plano-retorno-e-whatsapp.md, parte 3a): os avisos pelo
// WhatsApp oficial (migração 20270619120000) saem só para quem aceitou; antes de ligar para todos, a tela diz que
// começam em breve.

/**
 * `ligado`: os avisos já estão saindo para todos (Admin › WhatsApp); sem ele, a tela diz "começam em breve".
 * `avisos`: os que a conta pode escolher, e `desligados`, os que ela não quer (migração 20270711120000; antes dela,
 * a lista vem vazia e a tela não mostra a escolha).
 */
export type MeuWhatsapp = {
  aceito: boolean;
  numero: string | null;
  pode: boolean;
  ligado: boolean;
  avisos: { tipo: string; rotulo: string }[];
  desligados: string[];
  /** quem contrata: os avisos que saíram neste mês e o limite do mês (migração 20270714120000; antes dela, null) */
  uso: UsoDoWhatsapp | null;
};

/** O mês de quem contrata: `limite` é o do grátis ou o do plano; `limitePlano`, o dos planos (para a oferta). */
export type UsoDoWhatsapp = { usadas: number; limite: number; plano: boolean; limitePlano: number };

function lerUso(v: unknown): UsoDoWhatsapp | null {
  if (!v || typeof v !== "object") return null;
  const u = v as Record<string, unknown>;
  if (typeof u.usadas !== "number" || typeof u.limite !== "number") return null;
  return {
    usadas: u.usadas,
    limite: u.limite,
    plano: u.plano === true,
    limitePlano: typeof u.limite_plano === "number" ? u.limite_plano : u.limite,
  };
}

const textos = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** O aceite da conta (null: sem a migração ou sem conta). */
export async function meuWhatsapp(): Promise<MeuWhatsapp | null> {
  if (MODO_DEMO) return null;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("whatsapp_da_conta");
  if (error) return null;
  const o = (data ?? {}) as Record<string, unknown>;
  // sem a migração 20270711120000, a função não diz o tipo da conta: sem a escolha
  const comEscolha = typeof o.tipo_conta === "string";
  return {
    aceito: o.aceito === true,
    numero: typeof o.numero === "string" ? o.numero : null,
    pode: o.pode !== false,
    ligado: o.ligado === true,
    avisos: comEscolha
      ? avisosParaEscolher({
          tipoConta: o.tipo_conta as string,
          temServicos: o.tem_servicos === true,
          doPublikeDesligados: textos(o.do_publike_desligados),
        })
      : [],
    desligados: textos(o.desligados),
    uso: lerUso(o.uso),
  };
}

/** Os avisos que a conta não quer pelo WhatsApp (Preferências). O resto continua no sino e no e-mail. */
export async function mudarAvisosDoWhatsapp(desligados: string[]): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const validos = new Set(TIPOS_WHATSAPP.map((t) => t.tipo));
  const lista = [...new Set((Array.isArray(desligados) ? desligados : []).filter((t) => validos.has(t)))];
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("mudar_whatsapp_avisos", { p_desligados: lista });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para salvar agora.") };
  return { ok: true };
}

/** De onde veio o aceite: Preferências, o Curtir, o quadro, o cadastro e a vaga recém-publicada (migração 20270711120000). */
export type OrigemDoWhatsapp = "avisos" | "curtir" | "quadro" | "cadastro" | "publicar";

export async function mudarWhatsapp(aceito: boolean, origem: OrigemDoWhatsapp): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!["avisos", "curtir", "quadro", "cadastro", "publicar"].includes(origem)) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("mudar_whatsapp", { p_aceito: Boolean(aceito), p_origem: origem });
  if (error) {
    if (error.hint === "sem_numero")
      return { ok: false, erro: "Ponha o seu WhatsApp no perfil primeiro.", ir: "/perfil" };
    return { ok: false, erro: mensagemDeErro(error, "Não deu para salvar agora.") };
  }
  return { ok: true };
}
