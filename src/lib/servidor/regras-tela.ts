import "server-only";
import type { ContextoDaTela } from "@/components/automacoes/montar-regra";
import { recursosPagos } from "@/lib/dados";
import { lerRegra, type Regra } from "@/lib/regras";
import type { FormatoEntrevista } from "@/lib/recrutamento";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { juntarTriagem, perguntasDoBanco } from "@/lib/vaga-extra";
import { listarMeusClientes } from "./clientes";
import { dailyConfigurado } from "./daily";
import { equipeDaConta } from "./equipe";
import { bibliotecaDeTestes } from "./testes";
import { obterTriagens } from "./triagem";

// O que a tela das Automações personalizadas precisa (claude/plano-regras-personalizadas.md): as vagas com as
// perguntas, os clientes (agência), os testes, a equipe e se a conta tem o recurso.

export async function contextoDasRegras(contaId: string, agencia: boolean): Promise<ContextoDaTela> {
  const supabase = await criarClienteServidor();
  const [{ data: vagas }, recursos, testes, equipe, clientes] = await Promise.all([
    supabase
      .from("anuncios")
      .select("id, titulo, cliente_id, perguntas, endereco, bairro, cidade, status")
      .eq("autor_id", contaId)
      .eq("tipo", "vaga")
      .neq("status", "removido")
      .order("criado_em", { ascending: false })
      .limit(200),
    recursosPagos(),
    bibliotecaDeTestes(),
    equipeDaConta().catch(() => null),
    agencia ? listarMeusClientes().catch(() => null) : Promise.resolve(null),
  ]);
  const lista = vagas ?? [];
  const triagens = await obterTriagens(lista.map((v) => v.id));
  const primeira = lista[0];
  const video = Boolean(recursos?.video.liberado);
  return {
    vagas: lista.map((v) => ({ id: v.id, titulo: v.titulo, clienteId: v.cliente_id ?? null })),
    clientes: (clientes ?? []).filter((c) => !c.arquivado_em).map((c) => ({ id: c.id, nome: c.nome })),
    perguntas: Object.fromEntries(
      lista.map((v) => [v.id, juntarTriagem(perguntasDoBanco(v.perguntas), triagens.get(v.id) ?? {})]),
    ),
    testes: (testes ?? []).map((t) => ({ id: t.id, nome: t.titulo })),
    equipe: (equipe ?? []).filter((m) => !m.sou_eu).map((m) => ({ id: m.membro_id, nome: m.nome })),
    endereco: primeira ? [primeira.endereco, primeira.bairro, primeira.cidade].filter(Boolean).join(", ") : "",
    formatos: [
      "presencial",
      "telefone",
      "video",
      ...(video && dailyConfigurado() ? (["publike"] as const) : []),
    ] as FormatoEntrevista[],
    liberado: Boolean(recursos?.automacoes.liberado),
    podeExperimentar: Boolean(recursos?.automacoes.pode_experimentar),
  };
}

/** As regras da conta (todas) e quantas vezes cada uma agiu. */
export async function regrasDaConta(): Promise<(Regra & { agiu: number })[] | null> {
  const supabase = await criarClienteServidor();
  const [{ data, error }, { data: agiram }] = await Promise.all([
    supabase.from("regras").select("*").order("criada_em"),
    supabase.rpc("regras_agiram"),
  ]);
  if (error) return null;
  const n = (agiram ?? {}) as Record<string, number>;
  return (data ?? []).flatMap((x) => {
    const r = lerRegra(x);
    return r ? [{ ...r, agiu: Number(n[r.id] ?? 0) }] : [];
  });
}

/** As regras que valem numa vaga: as dela, as de todas as vagas e as do cliente dela. */
export function regrasDaVaga<R extends Regra>(regras: R[], vaga: { id: string; cliente_id?: string | null }) {
  return regras.filter(
    (r) =>
      r.vale_em === "todas" ||
      (r.vale_em === "vaga" && r.anuncio_id === vaga.id) ||
      (r.vale_em === "cliente" && vaga.cliente_id && r.cliente_id === vaga.cliente_id),
  );
}

export type FeitoDaRegra = {
  id: number;
  regra_id: string;
  regra: string;
  perfil_id: string;
  nome: string;
  feitas: { tipo: string; resultado: string; etapa?: string | null }[];
  feito_em: string;
  desfeito_em: string | null;
};

/** O que as regras fizeram numa vaga (ou com uma pessoa), do mais novo ao mais velho. */
export async function feitasDasRegras(anuncioId: string, perfilId?: string): Promise<FeitoDaRegra[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("regras_feitas_da_vaga", {
    p_anuncio: anuncioId,
    p_perfil: perfilId ?? null,
  });
  if (error) return [];
  return (Array.isArray(data) ? data : []) as unknown as FeitoDaRegra[];
}
