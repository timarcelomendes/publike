import "server-only";
import { cacheLife } from "next/cache";
import {
  calcularAderencia,
  cnhCobre,
  matchComAVaga,
  periodosPedidos,
  requisitosDaVaga,
  type Aderencia,
  type CamposDaVaga,
  type Candidato,
} from "@/lib/aderencia";
import { normalizarTexto, ocupacao } from "@/lib/cbo";
import { DISPONIBILIDADES, ESCOLARIDADES } from "@/lib/constantes";
import { forcaDoCurriculo } from "@/lib/curriculo-forca";
import { escolaridadeMaisAlta } from "@/lib/estudos";
import { funcaoPeloTitulo, type FuncaoSugerida } from "@/lib/funcao-cbo";
import { faixaDoBanco, regiaoDaCidade, type FaixaSalarial } from "@/lib/salarios";
import { criarClientePublico } from "@/lib/supabase/servidor";
import type { Curriculo } from "@/lib/tipos";
import { cidadesPerto, MINIMO as NOTA_QUE_COMBINA, outraArea } from "./combinam";
import { acessoFila } from "./filas";

// "Seu currículo no mercado" (claude/plano-salario-e-curriculo.md, parte 4), em Meu currículo e no cartão da conta:
//   * a faixa de salário da função da pessoa na região dela (Novo Caged, parte 1);
//   * quantas vagas no ar perto dela combinam (70% ou mais, sem "Outra área": a conta do site, matchComAVaga);
//   * o que abre mais vagas: o match de novo com uma mudança de cada vez (CNH, ensino médio, mais um horário, um
//     curso que as vagas citam), só as que somam vaga, com o quanto essas vagas pagam a mais;
//   * a nota do currículo, de 0 a 100: metade é o quanto ele está completo (forcaDoCurriculo) e metade é o mercado,
//     a parte das vagas da função dela perto, dos últimos 60 dias, em que ela atende tudo o que a vaga pede.
// A nota não usa onde a pessoa mora (bairro), nem foto: só o que a vaga pede. O Publike não guarda idade nem sexo.
// A função da pessoa vem do "O que você faz" e dos cargos, pelas regras e pelo que a IA já achou para o mesmo
// título nas vagas: o currículo não vai para a IA sem a pessoa pedir ("Melhorar com a IA").

/** A nota olha as vagas da função publicadas nestes dias (as no ar e as que já saíram). */
const DIAS_DA_NOTA = 60;
/** Com menos vagas da função que isto, a nota fica só no quanto o currículo está completo. */
const MINIMO_PARA_NOTA = 3;

export type VagaDoMercado = CamposDaVaga & {
  id: string;
  autor_id: string;
  pagamento_valor: number | null;
  pagamento_unidade: string | null;
  /** a função guardada da vaga (parte 2), ou null */
  cbo: string | null;
  criado_em: string;
  no_ar: boolean;
};

export type NivelDaNota = "Comece por aqui" | "Quase lá" | "Bom" | "Ótimo";

export type NotaDoCurriculo = {
  valor: number;
  nivel: NivelDaNota;
  /** o quanto o currículo está completo, de 0 a 100 */
  completo: number;
  /** das vagas da função perto, dos últimos 60 dias: quantas e em quantas a pessoa atende tudo (null: poucas) */
  mercado: { vagas: number; atende: number } | null;
};

export type CampoDaMudanca = "cnh" | "escolaridade" | "disponibilidade" | "cursos";

export type MudancaQueAbre = {
  campo: CampoDaMudanca;
  /** "Com CNH B", "Com o ensino médio completo", "Podendo trabalhar à noite", "Com o curso de NR-35" */
  texto: string;
  /** quantas vagas a mais combinariam */
  mais: number;
  /** quanto as vagas que abrem pagam a mais por mês, em média (com 2 salários ou mais de cada lado), ou null */
  pagamMais: number | null;
};

export type CurriculoNoMercado = {
  funcao: FuncaoSugerida | null;
  faixa: FaixaSalarial | null;
  /** as vagas no ar perto que combinam */
  combinam: number;
  mudancas: MudancaQueAbre[];
  nota: NotaDoCurriculo;
};

type Pessoa = { id: string; cidade: string | null; bairro: string | null };

/** As vagas no ar e as dos últimos 60 dias, iguais para todo mundo: ficam guardadas 15 minutos. */
async function vagasDoMercado(): Promise<VagaDoMercado[]> {
  "use cache";
  cacheLife("default");
  const acesso = acessoFila();
  if (!acesso) return [];
  const { data, error } = await acesso.cliente.rpc("servidor_vagas_do_mercado", {
    p_chave: acesso.chave,
    p_dias: DIAS_DA_NOTA,
  });
  // banco sem a migração 20270131120000: sem a lista (e nada fica guardado)
  if (error) throw new Error(error.message);
  return (data ?? []).map((v) => ({
    ...v,
    pagamento_valor: v.pagamento_valor == null ? null : Number(v.pagamento_valor),
  }));
}

/** As vagas perto da pessoa (as cidades da praça dela), sem as da própria conta. */
async function vagasPerto(pessoa: Pessoa) {
  const perto = new Set(cidadesPerto(pessoa.cidade));
  return (await vagasDoMercado()).filter((v) => v.autor_id !== pessoa.id && perto.has(v.cidade));
}

/** O que a IA já achou para um título de vaga (privado.funcoes_por_titulo), guardado por 1 hora. */
async function funcaoGuardada(chave: string): Promise<string | null> {
  "use cache";
  cacheLife("hours");
  const acesso = acessoFila();
  if (!acesso) return null;
  const { data, error } = await acesso.cliente.rpc("servidor_funcao_guardada", {
    p_chave: acesso.chave,
    p_titulo: chave,
  });
  // a falha não fica guardada
  if (error) throw new Error(error.message);
  return data?.[0]?.cbo ?? null;
}

/**
 * A função (CBO) da pessoa: o "O que você faz" e, depois, os cargos (o atual e os mais novos primeiro). As regras do
 * título e o que a IA já achou para o mesmo título numa vaga; nunca chama a IA.
 */
export async function funcaoDaPessoa(cv: Pick<Curriculo, "titulo" | "experiencias">): Promise<FuncaoSugerida | null> {
  const cargos = [...(cv.experiencias ?? [])]
    .sort(
      (a, b) => Number(Boolean(b.atual)) - Number(Boolean(a.atual)) || (b.inicio ?? "").localeCompare(a.inicio ?? ""),
    )
    .map((e) => e.cargo);
  const titulos = [cv.titulo ?? "", ...cargos].map((t) => String(t ?? "").trim()).filter(Boolean);
  for (const [i, titulo] of titulos.entries()) {
    const regra = funcaoPeloTitulo(titulo);
    if (regra) return regra;
    // o guardado pela IA só para o "O que você faz" e o primeiro cargo
    const chave = i > 1 ? "" : normalizarTexto(titulo).slice(0, 120);
    const o = chave ? ocupacao(await funcaoGuardada(chave).catch(() => null)) : null;
    if (o) return { cbo: o.cbo, nome: o.nome };
  }
  return null;
}

/** A faixa da função para a cidade (a da praça; sem dados nela, a de Goiás), ou null. */
async function faixaDaFuncao(cbo: string, cidade: string | null): Promise<FaixaSalarial | null> {
  const { data, error } = await criarClientePublico().rpc("salario_da_funcao", {
    p_cbo: cbo,
    p_regiao: regiaoDaCidade(cidade) ?? "go",
  });
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: falha ao ler a faixa de salário:", error.message);
    return null;
  }
  return data?.[0] ? faixaDoBanco(data[0]) : null;
}

export function nivelDaNota(valor: number): NivelDaNota {
  return valor < 40 ? "Comece por aqui" : valor < 70 ? "Quase lá" : valor < 85 ? "Bom" : "Ótimo";
}

/** Atende tudo o que a vaga pede: cada item inteiro (o que não dá para saber, como o horário não dito, não conta). */
function atendeTudo(a: Aderencia) {
  return !a.eliminado && a.criterios.every((k) => k.extra || k.funcao || (k.ok === true && (k.parte ?? 1) >= 1));
}

/** A experiência no currículo é da mesma função da vaga (o cargo bate inteiro com o título). */
function mesmaFuncao(a: Aderencia) {
  const f = a.criterios.find((k) => k.funcao);
  return f?.ok === true && (f.parte ?? 1) >= 1;
}

/**
 * A nota: metade o quanto o currículo está completo, metade a parte das vagas da função perto (dos últimos 60 dias)
 * em que a pessoa atende tudo o que a vaga pede. A vaga é da função pelo código (o guardado ou o das regras); sem
 * código de um dos lados, pelo cargo. Sem onde a pessoa mora: a conta não recebe a cidade nem o bairro.
 */
function calcularNota(cv: Curriculo, funcao: FuncaoSugerida | null, vagas: VagaDoMercado[], agora: number) {
  const completo = forcaDoCurriculo(cv).pontos;
  const desde = agora - DIAS_DA_NOTA * 864e5;
  let daFuncao = 0;
  let atende = 0;
  for (const v of vagas) {
    if (new Date(v.criado_em).getTime() <= desde) continue;
    const cbo = v.cbo ?? funcaoPeloTitulo(v.titulo)?.cbo ?? null;
    if (funcao && cbo && cbo !== funcao.cbo) continue;
    const a = calcularAderencia(
      { ...requisitosDaVaga(v), perguntas: [] },
      { curriculo: cv, cidade: null, bairro: null, respostas: {} },
      agora,
    );
    if (!(funcao && cbo) && !mesmaFuncao(a)) continue;
    daFuncao++;
    if (atendeTudo(a)) atende++;
  }
  const mercado = daFuncao >= MINIMO_PARA_NOTA ? { vagas: daFuncao, atende } : null;
  const valor = mercado ? Math.round(completo / 2 + (50 * atende) / daFuncao) : completo;
  return { valor, nivel: nivelDaNota(valor), completo, mercado } satisfies NotaDoCurriculo;
}

// ------------------------------------------------------------------ o que abre mais vagas

/** Os cursos que as vagas mais citam, com o jeito de achar no texto (sem acento, minúsculo). */
const CURSOS_DAS_VAGAS: { nome: string; texto: string; busca: RegExp }[] = [
  { nome: "NR-35", texto: "Com o curso NR-35 (trabalho em altura)", busca: /\bnr ?35\b/ },
  { nome: "NR-10", texto: "Com o curso NR-10 (eletricidade)", busca: /\bnr ?10\b/ },
  { nome: "NR-33", texto: "Com o curso NR-33 (espaço confinado)", busca: /\bnr ?33\b/ },
  { nome: "NR-12", texto: "Com o curso NR-12 (máquinas)", busca: /\bnr ?12\b/ },
  { nome: "NR-11", texto: "Com o curso NR-11 (empilhadeira)", busca: /\bnr ?11\b/ },
  { nome: "Operador de empilhadeira", texto: "Com o curso de empilhadeira", busca: /\bempilhadeira/ },
  {
    nome: "Manipulação de alimentos",
    texto: "Com o curso de manipulação de alimentos",
    busca: /\bmanipulacao de alimentos\b/,
  },
  { nome: "Primeiros socorros", texto: "Com o curso de primeiros socorros", busca: /\bprimeiros socorros\b/ },
  { nome: "Brigadista", texto: "Com o curso de brigadista", busca: /\bbrigad(a|ista)/ },
  { nome: "Informática", texto: "Com um curso de informática", busca: /\binformatica\b/ },
  { nome: "Excel", texto: "Com um curso de Excel", busca: /\bexcel\b/ },
  {
    nome: "Curso de vigilante",
    texto: "Com o curso de vigilante",
    busca: /\b(curso|formacao|reciclagem) de vigilante/,
  },
];

/** "de manhã", "à noite": o fim de "Podendo trabalhar…". */
const QUANDO: Record<string, string> = {
  manha: "de manhã",
  tarde: "à tarde",
  noite: "à noite",
  fim_de_semana: "no fim de semana",
  escala: "em escala, como a 12x36",
};

/** A CNH da pessoa mais a que a vaga pede ("A" + "B" = "AB"; a pesada maior cobre as menores). */
function juntarCnh(tem: string | null, pede: string) {
  const letras = new Set(`${tem ?? ""}${pede}`.toUpperCase().replace(/[^ABCDE]/g, ""));
  const pesada = ["E", "D", "C", "B"].find((x) => letras.has(x)) ?? "";
  return `${letras.has("A") ? "A" : ""}${pesada}`;
}

const salariosPorMes = (vagas: VagaDoMercado[]) =>
  vagas.filter((v) => v.pagamento_unidade === "mes" && (v.pagamento_valor ?? 0) > 0).map((v) => v.pagamento_valor!);
const media = (l: number[]) => l.reduce((t, x) => t + x, 0) / l.length;

/**
 * A vaga é da área da pessoa: a função dela ou uma parecida (só um curso ou uma habilidade não bastam). Sem a função
 * para conferir (o primeiro emprego), vale.
 */
function daArea(a: Aderencia) {
  const f = a.criterios.find((k) => k.funcao);
  return !f || (f.parte ?? (f.ok ? 1 : 0)) >= 0.6;
}

/**
 * O que mais abre vaga, uma mudança de cada vez, nas vagas no ar perto (até 3, só as que somam). Só contam as vagas
 * da área da pessoa: o curso conta meia função, e o "curso de empilhadeira" levava a 70% a vaga de empilhadeira de
 * quem é de TI (05/11/2026, claude/plano-vagas-que-combinam.md).
 */
function mudancasQueAbrem(
  cv: Curriculo,
  pessoa: Pessoa,
  noAr: VagaDoMercado[],
  combinamAgora: Set<string>,
  agora: number,
): MudancaQueAbre[] {
  const combina = (v: VagaDoMercado, c: Curriculo) => {
    const m = matchComAVaga(v, { curriculo: c, cidade: pessoa.cidade, bairro: pessoa.bairro }, agora);
    return Boolean(m && (m.nota ?? 0) >= NOTA_QUE_COMBINA && !outraArea(m));
  };
  // a área com o currículo de hoje (a mudança não pode ser o que põe a vaga na área)
  const naArea = new Set(
    noAr
      .filter((v) =>
        daArea(
          calcularAderencia(
            { ...requisitosDaVaga(v), perguntas: [] },
            { curriculo: cv, cidade: pessoa.cidade, bairro: pessoa.bairro, respostas: {} },
            agora,
          ),
        ),
      )
      .map((v) => v.id),
  );
  const comSalario = salariosPorMes(noAr.filter((v) => combinamAgora.has(v.id)));
  // a mudança nas vagas que ela mexe: as que passam a combinar menos as que deixam (um horário dito pela primeira
  // vez pode tirar alguma)
  const testar = (campo: MudancaQueAbre["campo"], texto: string, novo: Curriculo, vagas: VagaDoMercado[]) => {
    const novas: VagaDoMercado[] = [];
    let perdidas = 0;
    for (const v of vagas) {
      const antes = combinamAgora.has(v.id);
      const depois = combina(v, novo);
      if (depois && !antes && naArea.has(v.id)) novas.push(v);
      else if (antes && !depois) perdidas++;
    }
    const daNova = salariosPorMes(novas);
    const diferenca =
      comSalario.length >= 2 && daNova.length >= 2 ? Math.round((media(daNova) - media(comSalario)) / 10) * 10 : 0;
    return { campo, texto, mais: novas.length - perdidas, pagamMais: diferenca >= 50 ? diferenca : null };
  };
  const fora = noAr.filter((v) => !combinamAgora.has(v.id));
  const opcoes: MudancaQueAbre[] = [];

  // a CNH mais pedida nas vagas em que falta a CNH
  const pedidas = new Map<string, number>();
  for (const v of fora) {
    const pede = v.cnh?.toUpperCase();
    if (pede && !cnhCobre(cv.cnh, pede)) pedidas.set(pede, (pedidas.get(pede) ?? 0) + 1);
  }
  const cnh = [...pedidas].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  if (cnh) {
    opcoes.push(
      testar(
        "cnh",
        `Com CNH ${cnh}`,
        { ...cv, cnh: juntarCnh(cv.cnh, cnh) },
        fora.filter((v) => v.cnh && !cnhCobre(cv.cnh, v.cnh)),
      ),
    );
  }

  // o ensino médio completo, para quem ainda não tem
  const nivel = (valor: string | null) => ESCOLARIDADES.findIndex((e) => e.valor === valor);
  const tem = nivel(escolaridadeMaisAlta(cv));
  if (tem < nivel("medio")) {
    opcoes.push(
      testar(
        "escolaridade",
        "Com o ensino médio completo",
        { ...cv, escolaridade: "medio" },
        // sem escolaridade nenhuma, todas as que pedem passam a ser conferidas
        noAr.filter((v) => v.escolaridade_minima),
      ),
    );
  }

  // mais um horário: o que mais soma
  const disponibilidade = cv.disponibilidade ?? [];
  const horarios = DISPONIBILIDADES.filter((d) => !disponibilidade.includes(d.valor)).map((d) => {
    const vagas = noAr.filter((v) => {
      const pede = periodosPedidos(v);
      // sem horário nenhum no currículo, o horário das outras vagas também passa a ser conferido
      return pede.length > 0 && (disponibilidade.length === 0 || pede.includes(d.valor));
    });
    return testar(
      "disponibilidade",
      `Podendo trabalhar ${QUANDO[d.valor]}`,
      { ...cv, disponibilidade: [...disponibilidade, d.valor] },
      vagas,
    );
  });
  const horario = horarios.sort((a, b) => b.mais - a.mais)[0];
  if (horario) opcoes.push(horario);

  // um curso que as vagas citam e a pessoa não tem
  const meusCursos = normalizarTexto((cv.cursos ?? []).join(" | "));
  const textos = new Map(fora.map((v) => [v.id, normalizarTexto(`${v.titulo} ${v.descricao}`)]));
  const cursos = CURSOS_DAS_VAGAS.filter((c) => !c.busca.test(meusCursos)).flatMap((c) => {
    const vagas = fora.filter((v) => c.busca.test(textos.get(v.id) ?? ""));
    return vagas.length ? [testar("cursos", c.texto, { ...cv, cursos: [...(cv.cursos ?? []), c.nome] }, vagas)] : [];
  });
  const curso = cursos.sort((a, b) => b.mais - a.mais)[0];
  if (curso) opcoes.push(curso);

  return opcoes
    .filter((o) => o.mais > 0)
    .sort((a, b) => b.mais - a.mais)
    .slice(0, 3);
}

// ------------------------------------------------------------------ as telas

type CurriculoDaConta = NonNullable<Candidato["curriculo"]>;

/** Das vagas, as que combinam com o currículo (70% ou mais, sem "Outra área"), com o % de cada uma. */
function combinamCom(vagas: VagaDoMercado[], pessoa: Pessoa, cv: CurriculoDaConta, agora: number) {
  const combinam = new Map<string, Aderencia>();
  for (const v of vagas) {
    const m = matchComAVaga(v, { curriculo: cv, cidade: pessoa.cidade, bairro: pessoa.bairro }, agora);
    if (m && (m.nota ?? 0) >= NOTA_QUE_COMBINA && !outraArea(m)) combinam.set(v.id, m);
  }
  return combinam;
}

/**
 * As vagas no ar perto que combinam com o currículo, com o % de cada uma: as mesmas que o cartão "Seu currículo no
 * mercado" conta, para o "Combina mais" da lista mostrar as mesmas e com o mesmo número
 * (claude/plano-vagas-que-combinam.md). Com falha, null.
 */
export async function vagasQueCombinam(
  pessoa: Pessoa,
  cv: CurriculoDaConta,
  agora: number,
): Promise<Map<string, Aderencia> | null> {
  try {
    const noAr = (await vagasPerto(pessoa)).filter((v) => v.no_ar);
    return combinamCom(noAr, pessoa, cv, agora);
  } catch (e) {
    console.error(`Publike: falha nas vagas que combinam: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** O cartão de Meu currículo: a faixa, as vagas que combinam, o que abre mais vagas e a nota. Com falha, null. */
export async function curriculoNoMercado(
  pessoa: Pessoa,
  cv: Curriculo,
  agora: number,
): Promise<CurriculoNoMercado | null> {
  try {
    const [vagas, funcao] = await Promise.all([vagasPerto(pessoa), funcaoDaPessoa(cv)]);
    const faixa = funcao ? await faixaDaFuncao(funcao.cbo, pessoa.cidade) : null;
    const noAr = vagas.filter((v) => v.no_ar);
    const combinamAgora = new Set(combinamCom(noAr, pessoa, cv, agora).keys());
    return {
      funcao,
      faixa,
      combinam: combinamAgora.size,
      mudancas: mudancasQueAbrem(cv, pessoa, noAr, combinamAgora, agora),
      nota: calcularNota(cv, funcao, vagas, agora),
    };
  } catch (e) {
    console.error(`Publike: falha no currículo no mercado: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** Só a nota (o cartão da conta na home). Com falha, null. */
export async function notaDoCurriculo(pessoa: Pessoa, cv: Curriculo, agora: number): Promise<NotaDoCurriculo | null> {
  try {
    const [vagas, funcao] = await Promise.all([vagasPerto(pessoa), funcaoDaPessoa(cv)]);
    return calcularNota(cv, funcao, vagas, agora);
  } catch (e) {
    console.error(`Publike: falha na nota do currículo: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** As vagas no ar perto da função da pessoa, para a IA saber o que elas pedem ("Melhorar com a IA"). */
export async function vagasDaFuncaoPerto(
  pessoa: Pessoa,
  cv: Pick<Curriculo, "titulo" | "experiencias">,
  quantas = 5,
): Promise<VagaDoMercado[]> {
  try {
    const [vagas, funcao] = await Promise.all([vagasPerto(pessoa), funcaoDaPessoa(cv)]);
    if (!funcao) return [];
    return vagas.filter((v) => v.no_ar && (v.cbo ?? funcaoPeloTitulo(v.titulo)?.cbo) === funcao.cbo).slice(0, quantas);
  } catch {
    return [];
  }
}
