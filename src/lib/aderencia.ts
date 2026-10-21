// Nota de aderência: o quanto o candidato bate com a vaga, item por item.
//
// Compara tudo o que a vaga define e que dá para conferir no currículo, no perfil e
// nas respostas:
//   escolaridade · tempo de experiência · experiência na função (o cargo nas
//   experiências ou o título do currículo × o título da vaga; a descrição da experiência
//   não conta) · CNH · horário (turnos, dias e escala da vaga ×
//   quando a pessoa pode trabalhar) · onde mora (cidade; bairro e região de Goiânia no
//   detalhe) · as perguntas com a resposta que a empresa procura · os cursos que a
//   própria vaga cita.
// Nota = itens atendidos ÷ itens conferidos, com a experiência na função valendo 60% (a
// escolaridade, a cidade e o horário não fazem alguém de TI servir para mecânico). O que não
// dá para saber (sem currículo, sem resposta) fica de fora da conta e aparece com "?". A
// experiência na função conta quando a vaga pede experiência ou quando a pessoa tem algum
// trabalho (ou um título) no currículo; sem nenhum, numa vaga que aceita sem, fica de fora.
// Os cursos só somam: aparecem quando a pessoa tem.
// Pergunta eliminatória respondida diferente: nota 0. Nada para comparar: sem nota.
// A descrição livre da vaga não é lida, só os cursos que ela cita.

import { DISPONIBILIDADES, ESCOLARIDADES, EXPERIENCIAS, nomeEscolaridade } from "./constantes";
import { escolaridadeMaisAlta } from "./estudos";
import type { Turno } from "./filtros";
import { chaveBairro, regiaoDoBairro } from "./regioes";
import type { Curriculo } from "./tipos";
import { horarioDoBanco, textoDaResposta, type HorarioDetalhe, type Pergunta, type Respostas } from "./vaga-extra";

export type Criterio = {
  nome: string;
  /** null: não dá para saber (sem currículo, sem resposta) */
  ok: boolean | null;
  detalhe: string;
  eliminatorio?: boolean;
  /** só soma: aparece quando a pessoa tem, e não conta contra quem não tem */
  extra?: boolean;
  /** a experiência na função: vale mais que os outros itens (ver PESO_DA_FUNCAO) */
  funcao?: boolean;
};

export type Aderencia = {
  nota: number | null;
  eliminado: boolean;
  criterios: Criterio[];
  /** itens que deu para conferir (sem os "?") e quantos a pessoa atende */
  conferidos: number;
  atendidos: number;
};

type Vaga = {
  titulo?: string;
  descricao?: string;
  escolaridade_minima: string | null;
  experiencia: string | null;
  cnh: string | null;
  cidade: string;
  bairro?: string | null;
  /** jornada simples (integral, noturno, escala 12x36…) */
  jornada?: string | null;
  /** horário montado: turnos, dias e escala */
  horario?: HorarioDetalhe | null;
  /** com a triagem junto (juntarTriagem) */
  perguntas: Pergunta[];
};

export type Candidato = {
  curriculo:
    | (Pick<Curriculo, "escolaridade" | "experiencias" | "cnh"> &
        Partial<Pick<Curriculo, "disponibilidade" | "cursos" | "estudos" | "titulo">>)
    | null;
  respostas: Respostas;
  cidade: string | null;
  bairro?: string | null;
};

const MESES_PEDIDOS: Record<string, number> = { "6_meses": 6, "1_ano": 12, "2_anos": 24 };

/** Quantos meses de experiência, somando as do currículo (até hoje nas atuais). */
export function mesesDeExperiencia(experiencias: { inicio: string; fim: string | null }[], agora: number) {
  const hoje = new Date(agora);
  const mesHoje = hoje.getUTCFullYear() * 12 + hoje.getUTCMonth();
  const mes = (t: string) => {
    const m = /^(\d{4})-(\d{2})/.exec(t);
    return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : null;
  };
  let total = 0;
  for (const e of experiencias) {
    const ini = mes(e.inicio);
    const fim = e.fim ? mes(e.fim) : mesHoje;
    if (ini !== null && fim !== null && fim >= ini) total += fim - ini + 1;
  }
  return total;
}

/** "5 meses", "1 ano e 2 meses", "3 anos". */
function tempo(meses: number) {
  if (meses < 12) return `${meses} ${meses === 1 ? "mês" : "meses"}`;
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const a = `${anos} ${anos === 1 ? "ano" : "anos"}`;
  return resto ? `${a} e ${resto} ${resto === 1 ? "mês" : "meses"}` : a;
}

/** As categorias que a CNH cobre: D cobre C e B; AB é A e B. */
function categorias(cnh: string) {
  const c = cnh.toUpperCase();
  const set = new Set<string>();
  if (c.includes("A")) set.add("A");
  const pesadas = ["B", "C", "D", "E"];
  const maior = pesadas.filter((x) => c.includes(x)).map((x) => pesadas.indexOf(x));
  if (maior.length) for (let i = 0; i <= Math.max(...maior); i++) set.add(pesadas[i]);
  return set;
}

// ---------------------------------------------------------------- palavras

const simples = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // "NR-35", "NR 35" → "nr35"
    .replace(/\bnr\s*-?\s*(\d+)/g, "nr$1");

/** Palavras que não dizem a função: o nível, o tipo de contrato, ligações. */
const GENERICAS = new Set(
  (
    "auxiliar aux ajudante assistente operador operadora tecnico tecnica analista encarregado encarregada " +
    "lider chefe supervisor supervisora coordenador coordenadora gerente subgerente jovem aprendiz estagio " +
    "estagiario estagiaria trainee vaga vagas temporario temporaria fixo fixa efetivo efetiva junior pleno senior " +
    "noturno noturna diurno diurna periodo integral meio turno manha tarde noite horas para com sem dos das " +
    "nos nas pela pelo uma umas uns area setor geral gerais servicos servico pessoa profissional funcionario " +
    "funcionaria colaborador colaboradora trabalho emprego teste etapas ii iii " +
    // onde e como se trabalha, não a função ("Vendedor interno e online")
    "interno interna externo externa online presencial remoto remota hibrido hibrida home office loja"
  ).split(" "),
);

/** Raízes curtas que confundem funções diferentes: pedem mais letras em comum. */
const RAIZES_AMBIGUAS = new Set("serv elet inst mont prod cont tran info manu mant cons".split(" "));

/**
 * Começos de 5 letras que juntam funções diferentes ("produção" × "product manager", "compressor"
 * × "compras", "operação" × "operador"): pedem 7 letras em comum.
 */
const RAIZES_AMBIGUAS_5 = new Set("produ compr opera admin comer contr inter merca impor trans prest".split(" "));

/** As palavras que dizem a função: sem acento, sem as genéricas, com 4 letras ou mais. */
function palavrasDaFuncao(texto: string) {
  return simples(texto)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 4 && !GENERICAS.has(p));
}

/** Mesma raiz: 5 letras iguais no começo (4, se a raiz não for ambígua). "recepcionista" ~ "recepção". */
function mesmaRaiz(a: string, b: string) {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  if (n >= 7 || a === b) return true;
  if (RAIZES_AMBIGUAS_5.has(a.slice(0, 5))) return false;
  if (n >= 5) return true;
  return n === 4 && !RAIZES_AMBIGUAS.has(a.slice(0, 4));
}

/** A experiência do currículo que mais parece com a função da vaga (o cargo × o título da vaga). */
function experienciaNaFuncao(titulo: string, experiencias: Curriculo["experiencias"]) {
  const daVaga = palavrasDaFuncao(titulo);
  if (!daVaga.length) return null;
  return (
    experiencias.find((e) => {
      // só o cargo: a descrição é texto solto ("produção de relatórios" não faz auxiliar de produção)
      const doCargo = palavrasDaFuncao(e.cargo);
      return daVaga.some((v) => doCargo.some((c) => mesmaRaiz(v, c)));
    }) ?? null
  );
}

/** O título do currículo ("Mecânico de automóveis") parece com a função da vaga? */
function tituloNaFuncao(tituloDaVaga: string, tituloDoCurriculo: string | null | undefined) {
  if (!tituloDoCurriculo) return false;
  const daVaga = palavrasDaFuncao(tituloDaVaga);
  const doTitulo = palavrasDaFuncao(tituloDoCurriculo);
  return daVaga.some((v) => doTitulo.some((c) => mesmaRaiz(v, c)));
}

/**
 * Quanto a experiência na função pesa na nota (o resto divide o que sobra). Sem ela, a nota não
 * passa de 40%: bater a escolaridade, a cidade e o horário não faz alguém de TI servir para
 * mecânico.
 */
export const PESO_DA_FUNCAO = 0.6;

/** Palavras dos cursos que não dizem qual é o curso. */
const GENERICAS_CURSO = new Set(
  (
    "curso cursos basico basica avancado avancada intermediario completo completa online presencial livre " +
    "certificado certificacao treinamento nivel modulo pacote para com dos das sobre"
  ).split(" "),
);

/** Os cursos do currículo que a própria vaga cita (no título ou na descrição). */
function cursosCitados(cursos: string[], textoDaVaga: string) {
  const palavrasDaVaga = new Set(
    simples(textoDaVaga)
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
  return cursos.filter((curso) =>
    simples(curso)
      .split(/[^a-z0-9]+/)
      .filter((p) => (p.length >= 4 || /^nr\d+$/.test(p)) && !GENERICAS_CURSO.has(p))
      .some(
        (p) =>
          palavrasDaVaga.has(p) ||
          [...palavrasDaVaga].some((v) => v.length >= 6 && p.length >= 6 && v.slice(0, 6) === p.slice(0, 6)),
      ),
  );
}

// ---------------------------------------------------------------- horário

type Periodo = "manha" | "tarde" | "noite" | "fim_de_semana" | "escala";
const NOME_PERIODO = Object.fromEntries(DISPONIBILIDADES.map((d) => [d.valor, d.nome.split(" (")[0].toLowerCase()]));

/** Minutos de um turno dentro de cada período (manhã 6–12h, tarde 12–18h, noite 18–6h). */
function periodosDoTurno(inicio: string, fim: string): Periodo[] {
  const min = (h: string) => {
    const [hh, mm] = h.split(":").map(Number);
    return hh * 60 + mm;
  };
  const a = min(inicio);
  let b = min(fim);
  if (b <= a) b += 24 * 60; // passa da meia-noite
  const faixas: [Periodo, number, number][] = [
    ["noite", 0, 360],
    ["manha", 360, 720],
    ["tarde", 720, 1080],
    ["noite", 1080, 1800],
    ["manha", 1800, 2160],
  ];
  const minutos = new Map<Periodo, number>();
  for (const [p, i, f] of faixas) {
    const dentro = Math.min(b, f) - Math.max(a, i);
    if (dentro > 0) minutos.set(p, (minutos.get(p) ?? 0) + dentro);
  }
  // conta o período em que o turno fica pelo menos 1 hora
  return [...minutos].filter(([, m]) => m >= 60).map(([p]) => p);
}

/** Quando a vaga precisa que a pessoa possa trabalhar, pelo horário montado e pela jornada. */
function periodosDaVaga(jornada: string | null | undefined, horario: HorarioDetalhe | null | undefined) {
  const precisa = new Set<Periodo>();
  for (const t of horario?.turnos ?? []) for (const p of periodosDoTurno(t.inicio, t.fim)) precisa.add(p);
  if (horario?.dias.some((d) => d === "sab" || d === "dom")) precisa.add("fim_de_semana");
  // 6x1 é a escala do comércio (seis dias, com sábado): pede fim de semana; 12x36 e as
  // outras de revezamento pedem quem marcou "Escala" no currículo
  if (horario?.escala === "6x1" || jornada === "escala_6x1") precisa.add("fim_de_semana");
  if ((horario?.escala && !["5x2", "6x1"].includes(horario.escala)) || jornada === "escala_12x36")
    precisa.add("escala");
  if (jornada === "noturno") precisa.add("noite");
  if (jornada === "fim_de_semana") precisa.add("fim_de_semana");
  if (jornada === "integral" && !horario?.turnos.length) {
    precisa.add("manha");
    precisa.add("tarde");
  }
  const ordem: Periodo[] = ["manha", "tarde", "noite", "fim_de_semana", "escala"];
  return ordem.filter((p) => precisa.has(p));
}

/** "manhã", "manhã e tarde", "manhã, tarde e escala". */
function lista(itens: string[]) {
  return itens.length > 1 ? `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}` : (itens[0] ?? "");
}

// ---------------------------------------------------------------- a nota

export function calcularAderencia(vaga: Vaga, c: Candidato, agora: number): Aderencia {
  const criterios: Criterio[] = [];
  const cv = c.curriculo;

  if (vaga.escolaridade_minima) {
    const pede = ESCOLARIDADES.findIndex((e) => e.valor === vaga.escolaridade_minima);
    // o mais alto de todos: o principal ou um dos outros estudos
    const maisAlta = cv ? escolaridadeMaisAlta(cv) : null;
    const tem = maisAlta ? ESCOLARIDADES.findIndex((e) => e.valor === maisAlta) : -1;
    criterios.push({
      nome: `Escolaridade: ${nomeEscolaridade(vaga.escolaridade_minima)}`,
      ok: tem < 0 ? null : tem >= pede,
      detalhe: !cv
        ? "Sem currículo"
        : tem < 0
          ? "Sem escolaridade no currículo"
          : (nomeEscolaridade(maisAlta) ?? ""),
    });
  }

  const meses = vaga.experiencia ? MESES_PEDIDOS[vaga.experiencia] : undefined;
  if (meses) {
    const nome = EXPERIENCIAS.find((e) => e.valor === vaga.experiencia)?.nome ?? "Experiência";
    if (!cv) criterios.push({ nome: `Experiência: ${nome.toLowerCase()}`, ok: null, detalhe: "Sem currículo" });
    else {
      const tem = mesesDeExperiencia(cv.experiencias, agora);
      criterios.push({
        nome: `Experiência: ${nome.toLowerCase()}`,
        ok: tem >= meses,
        detalhe: tem === 0 ? "Sem experiência no currículo" : `${tempo(tem)} somando os trabalhos`,
      });
    }
  }

  // Experiência na função: conta (e pesa mais) quando a vaga pede experiência ou quando a pessoa
  // tem alguma experiência ou um título no currículo. Sem experiência nenhuma, numa vaga que aceita
  // sem: fica de fora (o primeiro emprego não é contado contra).
  if (vaga.titulo && palavrasDaFuncao(vaga.titulo).length) {
    const achou = cv ? experienciaNaFuncao(vaga.titulo, cv.experiencias) : null;
    const peloTitulo = !achou && cv ? tituloNaFuncao(vaga.titulo, cv.titulo) : false;
    // "Operadora de caixa · Supermercado X · até 12/2024"
    const mesAno = (t: string) => t.replace(/^(\d{4})-(\d{2}).*$/, "$2/$1");
    const trabalho = achou
      ? `Trabalhou como ${achou.cargo}${achou.onde ? ` · ${achou.onde}` : ""} · ${
          achou.fim ? `até ${mesAno(achou.fim)}` : `desde ${mesAno(achou.inicio)}`
        }`
      : peloTitulo
        ? `No currículo: ${cv?.titulo}`
        : "";
    const temHistorico = Boolean(cv && (cv.experiencias.length || cv.titulo));
    if (meses || temHistorico) {
      criterios.push({
        nome: "Experiência na função",
        ok: !cv ? null : Boolean(achou || peloTitulo),
        detalhe: !cv
          ? "Sem currículo"
          : achou || peloTitulo
            ? trabalho
            : `Nenhum trabalho parecido com “${vaga.titulo}” no currículo`,
        funcao: true,
      });
    }
  }

  if (vaga.cnh) {
    const tem = cv?.cnh ? categorias(cv.cnh) : null;
    criterios.push({
      nome: `CNH ${vaga.cnh}`,
      ok: tem === null ? (cv ? false : null) : [...categorias(vaga.cnh)].every((x) => tem.has(x)),
      detalhe: cv?.cnh ? `Tem CNH ${cv.cnh}` : cv ? "Sem CNH no currículo" : "Sem currículo",
    });
  }

  // Horário: os turnos, os dias e a escala da vaga × quando a pessoa disse que pode
  const precisa = periodosDaVaga(vaga.jornada, vaga.horario);
  if (precisa.length) {
    const pode = new Set(cv?.disponibilidade ?? []);
    const faltam = precisa.filter((p) => !pode.has(p));
    criterios.push({
      nome: `Horário: ${lista(precisa.map((p) => NOME_PERIODO[p]))}`,
      ok: !cv || pode.size === 0 ? null : faltam.length === 0,
      detalhe: !cv
        ? "Sem currículo"
        : pode.size === 0
          ? "Não disse no currículo quando pode trabalhar"
          : faltam.length === 0
            ? `Pode: ${lista(DISPONIBILIDADES.filter((d) => pode.has(d.valor)).map((d) => NOME_PERIODO[d.valor]))}`
            : `Não marcou ${lista(faltam.map((p) => NOME_PERIODO[p]))}`,
    });
  }

  // Onde mora: a cidade conta; o bairro e a região de Goiânia aparecem no detalhe
  if (c.cidade) {
    const mesmaCidade = c.cidade === vaga.cidade;
    const mesmoBairro =
      mesmaCidade && vaga.bairro && c.bairro ? chaveBairro(vaga.bairro) === chaveBairro(c.bairro) : false;
    const regiao = mesmaCidade && vaga.bairro && c.bairro ? regiaoDoBairro(vaga.cidade, vaga.bairro) : null;
    const mesmaRegiao = regiao !== null && regiao === regiaoDoBairro(c.cidade, c.bairro ?? "");
    criterios.push({
      nome: `Mora em ${vaga.cidade}`,
      ok: mesmaCidade,
      detalhe: !mesmaCidade
        ? `Mora em ${c.cidade}`
        : mesmoBairro
          ? "No mesmo bairro da vaga"
          : mesmaRegiao
            ? `Na mesma região da vaga (${regiao})`
            : "Mesma cidade da vaga",
    });
  }

  let eliminado = false;
  for (const p of vaga.perguntas) {
    if (!p.esperada) continue;
    const resposta = c.respostas[p.id];
    const ok = resposta ? resposta === p.esperada : null;
    if (p.eliminatoria && ok === false) eliminado = true;
    criterios.push({
      nome: p.nome,
      ok,
      detalhe: resposta
        ? `Respondeu: ${textoDaResposta(p, resposta)}`
        : `Não respondeu (procura: ${textoDaResposta(p, p.esperada)})`,
      eliminatorio: p.eliminatoria,
    });
  }

  // Cursos que a vaga cita (só soma)
  if (cv?.cursos?.length) {
    const citados = cursosCitados(cv.cursos, `${vaga.titulo ?? ""} ${vaga.descricao ?? ""}`);
    if (citados.length) {
      criterios.push({ nome: "Cursos que a vaga cita", ok: true, detalhe: lista(citados), extra: true });
    }
  }

  const conhecidos = criterios.filter((x) => x.ok !== null);
  const atendidos = conhecidos.filter((x) => x.ok).length;
  // a função pesa PESO_DA_FUNCAO; os outros itens dividem o resto (sem outros, só ela conta)
  const funcao = conhecidos.find((x) => x.funcao);
  const outros = conhecidos.filter((x) => !x.funcao);
  const parteDosOutros = outros.length ? outros.filter((x) => x.ok).length / outros.length : null;
  const nota = eliminado
    ? 0
    : !conhecidos.length
      ? null
      : funcao
        ? Math.round(
            100 *
              (parteDosOutros === null
                ? Number(funcao.ok)
                : PESO_DA_FUNCAO * Number(funcao.ok) + (1 - PESO_DA_FUNCAO) * parteDosOutros),
          )
        : Math.round((100 * atendidos) / conhecidos.length);
  return { nota, eliminado, criterios, conferidos: conhecidos.length, atendidos };
}

// ---------------------------------------------------------------- dos dois lados

/** Os campos da vaga que a nota usa (vêm do obter_anuncio ou direto da tabela). */
export type CamposDaVaga = {
  titulo: string;
  descricao: string;
  escolaridade_minima: string | null;
  experiencia: string | null;
  cnh: string | null;
  cidade: string;
  bairro: string | null;
  jornada: string | null;
  horario_detalhe: unknown;
  /** o horário em texto ("Seg a sex, 8h às 17h"): só para o filtro de turno */
  horario?: string | null;
};

/** O que a vaga pede, para a nota (as perguntas vêm à parte: a resposta procurada é só da empresa). */
export function requisitosDaVaga(a: CamposDaVaga) {
  return {
    titulo: a.titulo,
    descricao: a.descricao,
    escolaridade_minima: a.escolaridade_minima,
    experiencia: a.experiencia,
    cnh: a.cnh,
    cidade: a.cidade,
    bairro: a.bairro,
    jornada: a.jornada,
    horario: horarioDoBanco(a.horario_detalhe),
  };
}

/**
 * O % de match de quem procura com a vaga: a mesma conta que a empresa vê, sem as
 * perguntas (a resposta que a empresa procura é só dela, e antes de curtir não há
 * resposta). Só quando dá para conferir a cidade e mais alguma coisa que a vaga pede:
 * com a cidade só (e os "+"), o número diria pouco.
 */
export function matchComAVaga(vaga: CamposDaVaga, pessoa: Omit<Candidato, "respostas">, agora: number) {
  const a = calcularAderencia({ ...requisitosDaVaga(vaga), perguntas: [] }, { ...pessoa, respostas: {} }, agora);
  const daVaga = a.criterios.filter((k) => !k.extra && k.ok !== null).length;
  return a.nota !== null && daVaga >= 2 ? a : null;
}

/** O turno no texto da vaga, para as vagas sem horário montado (as mais antigas). */
const TURNO_NO_TEXTO: Record<Turno, RegExp> = {
  manha: /manha|matutin|\b(5|6|7|8)h/,
  tarde: /tarde|vespertin|\b(13|14)h/,
  noite: /noite|noturn|madrugada|\b(18|19|20|22)h/,
  fim_de_semana: /fim de semana|fins de semana|sabado|domingo/,
};

/**
 * A vaga é no turno? Vale o horário montado (turnos, dias, escala) e a jornada; sem
 * nada disso, o texto da vaga. A mesma regra está no banco (privado.vaga_no_turno),
 * para o aviso das buscas salvas.
 */
export function vagaNoTurno(v: CamposDaVaga, turno: Turno) {
  const periodos = periodosDaVaga(v.jornada, horarioDoBanco(v.horario_detalhe));
  if (periodos.length) return (periodos as string[]).includes(turno);
  return TURNO_NO_TEXTO[turno].test(simples(`${v.titulo} ${v.horario ?? ""} ${v.descricao}`));
}
