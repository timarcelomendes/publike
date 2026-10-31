import "server-only";
import { nomeEscolaridade, nomeExperiencia, nomeJornada } from "@/lib/constantes";
import { contarLeitura, criteriosDoBanco, motivoProibido, type CriterioCopiloto } from "@/lib/copiloto";
import { lerCurriculo, sugerirCriterios } from "@/lib/ia/copiloto";
import { iaConfigurada, modeloDaIA } from "@/lib/ia/openai";
import { descreverAnuncio } from "@/lib/ia/tarefas";
import type { Json } from "@/lib/supabase/tipos-banco";
import type { Curriculo } from "@/lib/tipos";
import { perguntasDoBanco, textoDaResposta } from "@/lib/vaga-extra";
import { semNome, textoDoCurriculo } from "./copiloto";
import { acessoFila } from "./filas";

// A Triagem com IA lê sozinha (claude/plano-triagem-automatica.md, item 1; migração 20261227120000): a vaga sem
// critérios ganha os que a IA monta pela vaga, e cada candidato com currículo é lido quando chega. Só nas contas
// com o recurso liberado (o banco confere). Roda na tarefa das filas (/api/filas) e logo depois de curtir.

/** O que a vaga diz, como a IA lê para sugerir os critérios. */
export type VagaParaCriterios = {
  tipo: string;
  titulo: string;
  descricao: string | null;
  categoria: string | null;
  regime: string | null;
  pagamento_valor: number | null;
  pagamento_unidade: string | null;
  beneficios: string | null;
  horario: string | null;
  vagas: number | null;
  cidade: string;
  bairro: string | null;
  ganhos_extras: unknown;
  escolaridade_minima: string | null;
  experiencia: string | null;
  cnh: string | null;
  jornada: string | null;
  perguntas: unknown;
};

export function textoDaVagaParaCriterios(a: VagaParaCriterios) {
  const pede = [
    a.escolaridade_minima && `Escolaridade mínima: ${nomeEscolaridade(a.escolaridade_minima) ?? a.escolaridade_minima}`,
    a.experiencia && `Experiência: ${nomeExperiencia(a.experiencia) ?? a.experiencia}`,
    a.cnh && `CNH: ${a.cnh}`,
    a.jornada && `Jornada: ${nomeJornada(a.jornada) ?? a.jornada}`,
    ...perguntasDoBanco(a.perguntas).map((q) => `Pergunta para quem se candidata: ${q.nome}`),
  ].filter(Boolean);
  return [
    descreverAnuncio({
      tipo: a.tipo,
      titulo: a.titulo,
      descricao: a.descricao,
      categoria: a.categoria,
      regime: a.regime,
      pagamento_valor: a.pagamento_valor,
      pagamento_unidade: a.pagamento_unidade,
      beneficios: a.beneficios,
      horario: a.horario,
      vagas: a.vagas,
      cidade: a.cidade,
      bairro: a.bairro,
      ganhos_extras: a.ganhos_extras,
    } as Parameters<typeof descreverAnuncio>[0]),
    ...pede,
  ].join("\n");
}

/**
 * Sem a IA (fora do ar ou sem resposta): os critérios que saem do que a vaga já diz (a função, a
 * escolaridade, a experiência, a CNH e a jornada), para a pessoa não ficar com a lista vazia.
 */
export function criteriosDaPropriaVaga(a: {
  titulo: string;
  escolaridade_minima: string | null;
  experiencia: string | null;
  cnh: string | null;
  jornada: string | null;
}): CriterioCopiloto[] {
  const experiencia = a.experiencia && a.experiencia !== "sem" ? nomeExperiencia(a.experiencia) : null;
  const titulo = a.titulo.replace(/\s+/g, " ").trim().slice(0, 80);
  const lista = [
    {
      texto: `Experiência como ${titulo.charAt(0).toLowerCase()}${titulo.slice(1)}${experiencia ? ` (${experiencia.toLowerCase()})` : ""}`,
      obrigatorio: Boolean(experiencia),
    },
    a.escolaridade_minima && nomeEscolaridade(a.escolaridade_minima)
      ? { texto: `Escolaridade: ${nomeEscolaridade(a.escolaridade_minima)} ou mais`, obrigatorio: true }
      : null,
    a.cnh ? { texto: `CNH ${a.cnh}`, obrigatorio: true } : null,
    a.jornada && nomeJornada(a.jornada)
      ? { texto: `Pode trabalhar na jornada: ${nomeJornada(a.jornada)!.toLowerCase()}`, obrigatorio: false }
      : null,
  ].filter((c): c is { texto: string; obrigatorio: boolean } => Boolean(c) && !motivoProibido(c!.texto));
  return lista.map((c, i) => ({ id: `c${i + 1}`, ...c }));
}

type Acesso = NonNullable<ReturnType<typeof acessoFila>>;

/** A IA está ligada no admin (e o modelo escolhido)? */
async function iaDaTriagem(acesso: Acesso): Promise<string | null> {
  if (!iaConfigurada()) return null;
  const { data } = await acesso.cliente.rpc("config_publica");
  const c = data?.[0];
  return c?.ia_melhorar_texto ? modeloDaIA(c.ia_modelo).id : null;
}

/** As vagas novas das contas com a Triagem, sem critérios: a IA monta pela vaga (sem a IA, os da própria vaga). */
export async function montarCriteriosAutomaticos(limite = 5): Promise<{ montados: number; motivo?: string }> {
  const acesso = acessoFila();
  if (!acesso) return { montados: 0 };
  const modelo = await iaDaTriagem(acesso);
  if (!modelo) return { montados: 0 };
  const { cliente, chave } = acesso;
  const { data, error } = await cliente.rpc("servidor_copiloto_vagas_sem_criterios", {
    p_chave: chave,
    p_limite: limite,
  });
  if (error) {
    if (error.code === "PGRST202") return { montados: 0 };
    console.error("Publike: falha ao ler as vagas sem critérios:", error.message);
    return { montados: 0, motivo: "Não foi possível ler as vagas da Triagem." };
  }
  let montados = 0;
  for (const linha of data ?? []) {
    const vaga = linha.vaga as unknown as VagaParaCriterios;
    let criterios: CriterioCopiloto[] = [];
    try {
      criterios = await sugerirCriterios(textoDaVagaParaCriterios(vaga), modelo);
    } catch (e) {
      console.error("Publike: a IA não montou os critérios da vaga:", e instanceof Error ? e.message : e);
    }
    if (!criterios.length) criterios = criteriosDaPropriaVaga(vaga);
    if (!criterios.length) continue;
    const { data: versao, error: e } = await cliente.rpc("servidor_copiloto_criterios_automaticos", {
      p_chave: chave,
      p_anuncio: linha.anuncio_id,
      p_criterios: criterios as unknown as Json,
    });
    if (e) console.error("Publike: não deu para guardar os critérios da IA:", e.message);
    else if (versao) montados++;
  }
  return { montados };
}

/** Quem se candidatou e ainda não foi lido: a IA lê (3 de cada vez) e o banco guarda. */
export async function lerCandidatosNovos(limite = 12): Promise<{ lidos: number; motivo?: string }> {
  const acesso = acessoFila();
  if (!acesso) return { lidos: 0 };
  const modelo = await iaDaTriagem(acesso);
  if (!modelo) return { lidos: 0 };
  const { cliente, chave } = acesso;
  const { data, error } = await cliente.rpc("servidor_copiloto_fila", { p_chave: chave, p_limite: limite });
  if (error) {
    if (error.code === "PGRST202") return { lidos: 0 };
    console.error("Publike: falha ao ler a fila da Triagem:", error.message);
    return { lidos: 0, motivo: "Não foi possível ler a fila da Triagem." };
  }
  const fila = data ?? [];
  let lidos = 0;
  for (let i = 0; i < fila.length; i += 3) {
    await Promise.all(
      fila.slice(i, i + 3).map(async (p) => {
        try {
          const criterios = criteriosDoBanco(p.criterios);
          if (!criterios.length) return;
          const cv = p.curriculo as unknown as Omit<Curriculo, "arquivo">;
          const r = (p.respostas ?? {}) as Record<string, unknown>;
          const respostas = perguntasDoBanco(p.perguntas).map((q) => ({
            pergunta: q.nome,
            resposta: textoDaResposta(q, r[q.id] as Parameters<typeof textoDaResposta>[1]),
          }));
          // a IA nunca recebe nome, foto nem contato
          const texto = semNome(
            textoDoCurriculo(cv, { bairro: p.bairro, cidade: p.cidade ?? "", respostas, recado: p.mensagem }),
            p.nome,
          );
          const { modelo: usado, ...leitura } = await lerCurriculo(
            { vaga: { titulo: p.vaga_titulo, descricao: p.vaga_descricao ?? "" }, criterios, curriculo: texto },
            modelo,
          );
          const n = contarLeitura(criterios, leitura);
          const { data: ok, error: e } = await cliente.rpc("servidor_copiloto_guardar", {
            p_chave: chave,
            p_anuncio: p.anuncio_id,
            p_perfil: p.perfil_id,
            p_versao: p.versao,
            p_curriculo_em: p.curriculo_em,
            p_resultado: leitura as unknown as Json,
            p_atende: n.atende,
            p_obrigatorios_ok: n.obrigatoriosOk,
            p_modelo: usado,
          });
          if (e) throw new Error(e.message);
          if (ok) lidos++;
        } catch (e) {
          console.error("Publike: a Triagem não leu uma candidatura:", e instanceof Error ? e.message : e);
        }
      }),
    );
  }
  return { lidos };
}

/** A tarefa das filas: primeiro os critérios das vagas novas, depois as candidaturas. */
export async function triagemAutomatica(): Promise<{ montados: number; lidos: number; motivo?: string }> {
  const c = await montarCriteriosAutomaticos();
  const l = await lerCandidatosNovos();
  return { montados: c.montados, lidos: l.lidos, motivo: c.motivo ?? l.motivo };
}
