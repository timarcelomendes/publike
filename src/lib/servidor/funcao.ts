import "server-only";
import { buscarOcupacoes, normalizarTexto, ocupacao, type Ocupacao } from "@/lib/cbo";
import { funcaoPeloTitulo, type FuncaoParaForm } from "@/lib/funcao-cbo";
import { criarClientePublico } from "@/lib/supabase/servidor";
import { escolherFuncaoComIA } from "@/lib/ia/funcao";
import { iaConfigurada, modeloDaIA } from "@/lib/ia/openai";
import { acessoFila } from "./filas";

// A função (CBO) de uma vaga (claude/plano-salario-e-curriculo.md, parte 2): as regras do título primeiro; sem
// elas, o que a IA já achou para o mesmo título; sem isso, a IA (quando `modelo` vem), que escolhe numa lista curta
// da CBO. O resultado da IA fica guardado por título (migração 20270131120000), com o "não achou" também.

export type FuncaoAchada = { cbo: string; nome: string; origem: "regra" | "ia" };

type Acesso = NonNullable<ReturnType<typeof acessoFila>>;

/** As ocupações da CBO que mais parecem com o título (e, se faltar, com a descrição): as opções da IA. */
function opcoesParaIA(titulo: string, descricao: string | null) {
  const vistas = new Set<string>();
  const opcoes: Ocupacao[] = [];
  for (const o of [...buscarOcupacoes(titulo, 10), ...(descricao ? buscarOcupacoes(descricao.slice(0, 200), 4) : [])]) {
    if (vistas.has(o.cbo)) continue;
    vistas.add(o.cbo);
    opcoes.push({ cbo: o.cbo, nome: o.nome, sinonimos: o.sinonimos });
  }
  return opcoes.slice(0, 12);
}

export async function funcaoDaVaga(
  vaga: { titulo: string; descricao?: string | null },
  modelo: string | null,
  acesso: Acesso | null = acessoFila(),
): Promise<FuncaoAchada | null> {
  const regra = funcaoPeloTitulo(vaga.titulo);
  if (regra) return { ...regra, origem: "regra" };
  const chave = normalizarTexto(vaga.titulo).slice(0, 120);
  if (!chave || !acesso) return null;
  const { data: guardada, error } = await acesso.cliente.rpc("servidor_funcao_guardada", {
    p_chave: acesso.chave,
    p_titulo: chave,
  });
  // sem a migração, sem guardar e sem a IA
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: falha ao ler a função guardada:", error.message);
    return null;
  }
  if (guardada?.length) {
    const o = ocupacao(guardada[0].cbo);
    return o ? { cbo: o.cbo, nome: o.nome, origem: "ia" } : null;
  }
  if (!modelo) return null;
  let cbo: string | null = null;
  try {
    cbo = await escolherFuncaoComIA(vaga, opcoesParaIA(vaga.titulo, vaga.descricao ?? null), modelo);
  } catch (e) {
    console.error("Publike: a IA não achou a função da vaga:", e instanceof Error ? e.message : e);
    return null;
  }
  const { error: erroGuardar } = await acesso.cliente.rpc("servidor_guardar_funcao", {
    p_chave: acesso.chave,
    p_titulo: chave,
    p_cbo: cbo,
    p_origem: cbo ? "ia" : "nenhuma",
  });
  if (erroGuardar) console.error("Publike: falha ao guardar a função:", erroGuardar.message);
  const o = ocupacao(cbo);
  return o ? { cbo: o.cbo, nome: o.nome, origem: "ia" } : null;
}

/** O modelo da IA, se ela está configurada e ligada no admin (o mesmo interruptor da ajuda da IA nos textos). */
export async function modeloDaFuncao(acesso: Acesso | null = acessoFila()): Promise<string | null> {
  if (!acesso || !iaConfigurada()) return null;
  const { data } = await acesso.cliente.rpc("config_publica");
  const c = data?.[0];
  return c?.ia_melhorar_texto ? modeloDaIA(c.ia_modelo).id : null;
}

/** O robô das filas: acha a função das vagas que ainda não têm (as mais novas primeiro). */
export async function funcoesDasVagas(limite = 20): Promise<{ achadas: number; vistas: number; motivo?: string }> {
  const acesso = acessoFila();
  if (!acesso) return { achadas: 0, vistas: 0 };
  const { data: vagas, error } = await acesso.cliente.rpc("servidor_vagas_sem_funcao", {
    p_chave: acesso.chave,
    p_limite: limite,
  });
  if (error) {
    if (error.code === "PGRST202") return { achadas: 0, vistas: 0 };
    console.error("Publike: falha ao ler as vagas sem função:", error.message);
    return { achadas: 0, vistas: 0, motivo: "Não foi possível ler as vagas sem função." };
  }
  const modelo = await modeloDaFuncao(acesso);
  let achadas = 0;
  for (const v of vagas ?? []) {
    // sem achar, fica "nenhuma": a vaga volta à fila depois de 7 dias (a IA pode ter sido ligada)
    const f = await funcaoDaVaga({ titulo: v.titulo, descricao: v.descricao }, modelo, acesso);
    const { error: e } = await acesso.cliente.rpc("servidor_definir_funcao", {
      p_chave: acesso.chave,
      p_anuncio: v.id,
      p_cbo: f?.cbo ?? null,
      p_origem: f?.origem ?? "nenhuma",
    });
    if (e) console.error("Publike: falha ao gravar a função da vaga:", e.message);
    else if (f) achadas++;
  }
  return { achadas, vistas: vagas?.length ?? 0 };
}

/** A função guardada de uma vaga (para o formulário de editar e o "Publicar parecida"), ou null. */
export async function funcaoSalvaDaVaga(id: string): Promise<FuncaoParaForm | null> {
  const { data, error } = await criarClientePublico().rpc("funcoes_das_vagas", { p_ids: [id] });
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: falha ao ler a função da vaga:", error.message);
    return null;
  }
  const f = data?.[0];
  const o = ocupacao(f?.cbo);
  if (!f || !o) return null;
  return { cbo: o.cbo, nome: o.nome, origem: f.origem === "empresa" ? "empresa" : f.origem === "ia" ? "ia" : "regra" };
}
