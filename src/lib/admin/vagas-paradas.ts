import "server-only";
import { saudeDaVaga, type ItemSaude } from "@/lib/saude-vaga";
import type { ClienteBanco } from "@/lib/supabase/admin";

// Admin › Vagas paradas (03/11/2026, claude/plano-crescimento-empresas.md, parte 3): as vagas no ar há mais de
// 24 horas sem nenhuma candidatura, a mais antiga primeiro, com o que falta pela Saúde da vaga. É a lista do
// atendimento à mão: pôr nas Vagas do dia, mandar a dica para a empresa pelo WhatsApp do admin. A primeira
// curtida tira a vaga da lista. Sem migração: o admin lê as tabelas com a chave de serviço.

/** A vaga entra na lista depois de tantas horas no ar sem candidato. */
export const HORAS_PARADA = 24;

export type VagaParada = {
  id: string;
  titulo: string;
  lugar: string;
  criadoEm: string;
  visitas: number;
  conta: { id: string; nome: string; tipo: string; whatsapp: string | null };
  /** o que falta, do mais importante para o menos (no máximo 3) */
  dicas: ItemSaude[];
};

const COLUNAS =
  "id, autor_id, titulo, cidade, bairro, status, expira_em, criado_em, descricao, pagamento_valor, beneficios, beneficios_lista, beneficios_extras, horario, jornada, horario_detalhe, escolaridade_minima, experiencia, cnh, perguntas";

export async function vagasParadas(c: ClienteBanco, agora: number): Promise<VagaParada[]> {
  const { data: vagas, error } = await c
    .from("anuncios")
    .select(COLUNAS)
    .eq("tipo", "vaga")
    .eq("status", "ativo")
    .is("preenchida_em", null)
    .gt("expira_em", new Date(agora).toISOString())
    .lt("criado_em", new Date(agora - HORAS_PARADA * 3600e3).toISOString())
    .order("criado_em", { ascending: true })
    .limit(500);
  if (error) throw new Error(`Publike: não deu para ler as vagas paradas (${error.message}).`);
  if (!vagas?.length) return [];
  const ids = vagas.map((v) => v.id);
  const { data: curtidas, error: ec } = await c.from("curtidas").select("anuncio_id").in("anuncio_id", ids);
  if (ec) throw new Error(`Publike: não deu para ler as curtidas das vagas paradas (${ec.message}).`);
  const comCandidato = new Set((curtidas ?? []).map((x) => x.anuncio_id));
  const paradas = vagas.filter((v) => !comCandidato.has(v.id));
  if (!paradas.length) return [];
  const autores = [...new Set(paradas.map((v) => v.autor_id))];
  const [{ data: contas }, { data: contatos }, { data: visitas }] = await Promise.all([
    c.from("perfis").select("id, nome, tipo").in("id", autores),
    c.from("contatos").select("perfil_id, whatsapp").in("perfil_id", autores),
    c
      .from("anuncio_visitas")
      .select("anuncio_id, total")
      .in(
        "anuncio_id",
        paradas.map((v) => v.id),
      ),
  ]);
  const contaDe = new Map((contas ?? []).map((p) => [p.id, p]));
  const zapDe = new Map((contatos ?? []).map((x) => [x.perfil_id, x.whatsapp]));
  const visitasDe = new Map((visitas ?? []).map((x) => [x.anuncio_id, x.total]));
  return paradas.map((v) => {
    const conta = contaDe.get(v.autor_id);
    const saude = saudeDaVaga(v, { visitas: visitasDe.get(v.id) ?? 0, candidatos: 0, esperandoMuito: 0 }, {}, agora);
    return {
      id: v.id,
      titulo: v.titulo,
      lugar: [v.bairro, v.cidade].filter(Boolean).join(", "),
      criadoEm: v.criado_em,
      visitas: visitasDe.get(v.id) ?? 0,
      conta: {
        id: v.autor_id,
        nome: conta?.nome ?? "Conta",
        tipo: conta?.tipo ?? "",
        whatsapp: zapDe.get(v.autor_id) ?? null,
      },
      dicas: saude.faltando.slice(0, 3),
    };
  });
}

/** A mensagem pronta para a empresa, com a dica e o link de editar a vaga. */
export function mensagemDaVagaParada(v: VagaParada, site: string, agora: number) {
  const dias = Math.max(1, Math.floor((agora - new Date(v.criadoEm).getTime()) / (24 * 3600e3)));
  // empresa pelo nome inteiro ("Oi, Loja Bom Preço!"); pessoa pelo primeiro nome
  const nome = v.conta.tipo === "pessoa" ? v.conta.nome.split(/\s+/)[0] : v.conta.nome;
  const dicas = v.dicas.map((d) => `• ${d.titulo}: ${d.dica.charAt(0).toLowerCase()}${d.dica.slice(1)}`);
  return [
    `Oi, ${nome}! Aqui é do Publike.`,
    `Sua vaga “${v.titulo}” está no ar há ${dias === 1 ? "1 dia" : `${dias} dias`} e ainda não recebeu candidatos.`,
    dicas.length ? `O que costuma ajudar:\n${dicas.join("\n")}` : "Vou divulgar a vaga nas nossas redes hoje.",
    `Para ajustar a vaga: ${site.replace(/\/+$/, "")}/painel/anuncio/${v.id}/editar`,
  ].join("\n\n");
}
