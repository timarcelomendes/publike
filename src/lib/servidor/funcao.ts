import "server-only";
import { buscarOcupacoes, normalizarTexto, ocupacao, ocupacoesNoTexto, type Ocupacao } from "@/lib/cbo";
import { funcaoPeloTitulo, type FuncaoParaForm } from "@/lib/funcao-cbo";
import { criarClientePublico } from "@/lib/supabase/servidor";
import { escolherFuncaoComIA } from "@/lib/ia/funcao";
import { iaConfigurada } from "@/lib/ia/openai";
import { acessoFila } from "./filas";
import { modeloPara } from "@/lib/ia/funcionalidades";
import { chaveDaExperiencia } from "./funcoes-pelo-contexto";

// A função (CBO) de uma vaga (claude/plano-salario-e-curriculo.md, parte 2): as regras do título primeiro; sem
// elas, o que a IA já achou para o mesmo título; sem isso, a IA (quando `modelo` vem), que escolhe numa lista curta
// da CBO. O resultado da IA fica guardado por título (migração 20270131120000), com o "não achou" também.
// Pelo contexto (claude/plano-match-pelo-contexto.md, 05/11/2026): com a IA ligada e uma descrição de verdade, a IA
// lê o título e a descrição antes das regras do título, e o título é só complemento. Sem a IA, fica como era.

export type FuncaoAchada = {
  cbo: string;
  nome: string;
  origem: "regra" | "ia";
  /** a IA leu o título e a descrição (não é lida de novo) */
  contexto?: boolean;
};

/** Descrição com isso ou mais (sem os espaços) é lida pela IA: menos que isso, o título diz o mesmo. */
const DESCRICAO_QUE_CONTA = 80;

type Acesso = NonNullable<ReturnType<typeof acessoFila>>;

/**
 * As opções da IA: as ocupações da CBO que mais parecem com o título e, pelo contexto, também a das regras do
 * título e as que aparecem na descrição (ou no "o que você fazia").
 */
function opcoesParaIA(titulo: string, descricao: string | null, contexto = false) {
  const vistas = new Set<string>();
  const opcoes: Ocupacao[] = [];
  const regra = contexto ? ocupacao(funcaoPeloTitulo(titulo)?.cbo) : null;
  const doTitulo = buscarOcupacoes(titulo, contexto ? 8 : 10);
  const daDescricao = descricao
    ? contexto
      ? [...ocupacoesNoTexto(descricao, 8), ...buscarOcupacoes(descricao.slice(0, 200), 3)]
      : buscarOcupacoes(descricao.slice(0, 200), 4)
    : [];
  for (const o of [...(regra ? [regra] : []), ...doTitulo, ...daDescricao]) {
    if (vistas.has(o.cbo)) continue;
    vistas.add(o.cbo);
    opcoes.push({ cbo: o.cbo, nome: o.nome, sinonimos: o.sinonimos });
  }
  return opcoes.slice(0, contexto ? 18 : 12);
}

/** Com a descrição e a IA, a função sai do texto todo (null: a IA não achou ou falhou; aí valem as regras). */
async function funcaoPeloContexto(
  vaga: { titulo: string; descricao?: string | null },
  modelo: string,
): Promise<{ achada: FuncaoAchada | null; leu: boolean }> {
  try {
    const cbo = await escolherFuncaoComIA(vaga, opcoesParaIA(vaga.titulo, vaga.descricao ?? null, true), modelo);
    const o = ocupacao(cbo);
    return { achada: o ? { cbo: o.cbo, nome: o.nome, origem: "ia", contexto: true } : null, leu: true };
  } catch (e) {
    console.error("Publike: a IA não leu a vaga pelo contexto:", e instanceof Error ? e.message : e);
    return { achada: null, leu: false };
  }
}

export function temContexto(descricao: string | null | undefined) {
  return (descricao ?? "").replace(/\s+/g, "").length >= DESCRICAO_QUE_CONTA;
}

export async function funcaoDaVaga(
  vaga: { titulo: string; descricao?: string | null },
  modelo: string | null,
  acesso: Acesso | null = acessoFila(),
): Promise<FuncaoAchada | null> {
  return (await acharFuncao(vaga, modelo, acesso)).achada;
}

/** A função e se a IA leu o texto todo (mesmo sem achar: aí a vaga não volta à fila para ser lida de novo). */
async function acharFuncao(
  vaga: { titulo: string; descricao?: string | null },
  modelo: string | null,
  acesso: Acesso | null,
): Promise<{ achada: FuncaoAchada | null; contexto: boolean }> {
  // pelo contexto: a IA lê tudo. Sem achar, valem as regras do título
  let leu = false;
  if (modelo && temContexto(vaga.descricao)) {
    const r = await funcaoPeloContexto(vaga, modelo);
    if (r.achada) return { achada: r.achada, contexto: true };
    leu = r.leu;
  }
  const doTitulo = await funcaoSoPeloTitulo(vaga, leu ? null : modelo, acesso);
  return { achada: doTitulo && leu ? { ...doTitulo, contexto: true } : doTitulo, contexto: leu };
}

/** O caminho de antes: as regras do título, o que já se achou para o mesmo título e a IA pelo título. */
async function funcaoSoPeloTitulo(
  vaga: { titulo: string; descricao?: string | null },
  modelo: string | null,
  acesso: Acesso | null,
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
  return c?.ia_melhorar_texto ? modeloPara(c, "funcao") : null;
}

/** O robô das filas: acha a função das vagas que ainda não têm (as mais novas primeiro). */
export async function funcoesDasVagas(limite = 20): Promise<{ achadas: number; vistas: number; motivo?: string }> {
  const acesso = acessoFila();
  if (!acesso) return { achadas: 0, vistas: 0 };
  const modelo = await modeloDaFuncao(acesso);
  // com a IA ligada, também as que foram achadas só pelo título e têm descrição (lidas de novo uma vez)
  const { data: vagas, error } = await acesso.cliente.rpc("servidor_vagas_sem_funcao", {
    p_chave: acesso.chave,
    p_limite: limite,
    p_com_contexto: Boolean(modelo),
  });
  if (error) {
    if (error.code === "PGRST202") return { achadas: 0, vistas: 0 };
    console.error("Publike: falha ao ler as vagas sem função:", error.message);
    return { achadas: 0, vistas: 0, motivo: "Não foi possível ler as vagas sem função." };
  }
  let achadas = 0;
  for (const v of vagas ?? []) {
    // sem achar, fica "nenhuma": a vaga volta à fila depois de 7 dias (a IA pode ter sido ligada)
    const { achada: f, contexto } = await acharFuncao({ titulo: v.titulo, descricao: v.descricao }, modelo, acesso);
    const { error: e } = await acesso.cliente.rpc("servidor_definir_funcao", {
      p_chave: acesso.chave,
      p_anuncio: v.id,
      p_cbo: f?.cbo ?? null,
      p_origem: f?.origem ?? "nenhuma",
      p_contexto: contexto,
    });
    if (e) console.error("Publike: falha ao gravar a função da vaga:", e.message);
    else if (f) achadas++;
  }
  return { achadas, vistas: vagas?.length ?? 0 };
}

/**
 * O robô das filas: a função (CBO) de cada experiência dos currículos que mudaram (claude/plano-match-pelo-contexto.md).
 * Só com a IA ligada: ela lê o cargo e o "o que você fazia" (as regras do cargo só quando ela não acha). Fica guardada
 * pela impressão do texto (sem o texto); a mesma experiência em outro currículo não é lida de novo. Sem a IA, nada
 * é lido e o % fica na conta das palavras.
 */
export async function funcoesDosCurriculos(limite = 8): Promise<{ lidos: number; achadas: number; motivo?: string }> {
  const acesso = acessoFila();
  if (!acesso) return { lidos: 0, achadas: 0 };
  const modelo = await modeloDaFuncao(acesso);
  if (!modelo) return { lidos: 0, achadas: 0 };
  const { data: curriculos, error } = await acesso.cliente.rpc("servidor_curriculos_para_ler", {
    p_chave: acesso.chave,
    p_limite: limite,
  });
  if (error) {
    if (error.code === "PGRST202") return { lidos: 0, achadas: 0 };
    console.error("Publike: falha ao ler os currículos para a função:", error.message);
    return { lidos: 0, achadas: 0, motivo: "Não foi possível ler os currículos para a função." };
  }
  if (!curriculos?.length) return { lidos: 0, achadas: 0 };
  let lidos = 0;
  let achadas = 0;
  for (const c of curriculos) {
    const exps = (Array.isArray(c.experiencias) ? c.experiencias : [])
      .filter((e): e is { cargo: string; descricao?: string } => Boolean(e) && typeof (e as { cargo?: unknown }).cargo === "string")
      .filter((e) => e.cargo.trim())
      .slice(0, 12);
    const chaves = exps.map((e) => chaveDaExperiencia({ cargo: e.cargo, descricao: e.descricao ?? "" }));
    const { data: ja } = await criarClientePublico().rpc("funcoes_das_experiencias", { p_chaves: [...new Set(chaves)] });
    const conhecidas = new Set((ja ?? []).map((l) => l.chave));
    const linhas: { chave: string; cbo: string | null; origem: "ia" | "regra" | "nenhuma" }[] = [];
    let faltou = false;
    for (const [i, e] of exps.entries()) {
      const chave = chaves[i];
      if (conhecidas.has(chave) || linhas.some((l) => l.chave === chave)) continue;
      const descricao = (e.descricao ?? "").slice(0, 800);
      let cbo: string | null = null;
      let origem: "ia" | "regra" | "nenhuma" = "nenhuma";
      try {
        cbo = await escolherFuncaoComIA(
          { titulo: e.cargo, descricao },
          opcoesParaIA(e.cargo, descricao, true),
          modelo,
          "experiencia",
        );
        origem = cbo ? "ia" : "nenhuma";
      } catch (erro) {
        console.error("Publike: a IA não leu a experiência:", erro instanceof Error ? erro.message : erro);
        faltou = true;
        continue;
      }
      // sem a IA achar: as regras do cargo (só o que dá para dizer pelo nome)
      if (!cbo) {
        const regra = funcaoPeloTitulo(e.cargo);
        if (regra) {
          cbo = regra.cbo;
          origem = "regra";
        }
      }
      linhas.push({ chave, cbo, origem });
      if (cbo) achadas++;
    }
    if (linhas.length) {
      const { error: e } = await acesso.cliente.rpc("servidor_guardar_funcoes_das_experiencias", {
        p_chave: acesso.chave,
        p_linhas: linhas,
      });
      if (e) {
        console.error("Publike: falha ao guardar as funções das experiências:", e.message);
        continue;
      }
    }
    // a IA falhou numa experiência: o currículo volta na próxima vez
    if (faltou) continue;
    const { error: e2 } = await acesso.cliente.rpc("servidor_marcar_curriculo_lido", {
      p_chave: acesso.chave,
      p_perfil: c.perfil_id,
      p_em: c.atualizado_em,
    });
    if (e2) console.error("Publike: falha ao marcar o currículo lido:", e2.message);
    else lidos++;
  }
  return { lidos, achadas };
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
