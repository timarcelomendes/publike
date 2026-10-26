// Nota de aderência: o quanto o candidato bate com a vaga, item por item.
//
// Compara tudo o que a vaga define e que dá para conferir no currículo, no perfil e
// nas respostas:
//   escolaridade · tempo de experiência na função · experiência na função (o cargo nas
//   experiências ou o título do currículo × o título da vaga; a descrição da experiência
//   não conta) · CNH · horário (turnos, dias e escala da vaga × quando a pessoa pode
//   trabalhar) · perto da vaga (o bairro, a região e a cidade) · as perguntas com a
//   resposta que a empresa procura · as habilidades e os cursos que a própria vaga cita.
// Cada item vale de 0 a 1 (`parte`). Quatro valem em parte quando batem em parte:
//   a função ...... a mesma (1), de área parecida (0,6: vendedora numa vaga de atendente),
//                   só num curso (0,5) ou nas habilidades (0,4), outra área (0)
//   o tempo ....... os meses na função (os de área parecida contam a metade) ÷ os pedidos
//   o horário ..... a parte dos períodos da vaga em que a pessoa pode
//   perto ......... o mesmo bairro, a mesma região ou a cidade sem regiões (1), outra região
//                   (0,75 ou 0,6, pela distância), outra cidade (0,5 a 0,15, pela distância), longe (0)
// Nota = 60% a função (PESO_DA_FUNCAO: a escolaridade, a cidade e o horário não fazem alguém
// de TI servir para mecânico) + 40% a média dos outros itens. O que não dá para saber (sem
// currículo, sem resposta) fica de fora da conta e aparece com "?". A experiência na função
// conta quando a vaga pede experiência ou quando a pessoa tem algum trabalho (ou um título)
// no currículo; sem nenhum, numa vaga que aceita sem, fica de fora. As habilidades e os
// cursos que a vaga cita só somam ("+"): aparecem quando a pessoa tem.
// Com poucos itens para conferir, a nota vai até 85% (1 ou 2 itens) ou 92% (3): bater a
// cidade e a função diz menos que bater tudo o que uma vaga completa pede.
// Pergunta eliminatória respondida diferente: nota 0. Nada para comparar: sem nota.
// A descrição livre da vaga só é lida para achar as habilidades e os cursos que ela cita.

import { DISPONIBILIDADES, ESCOLARIDADES, EXPERIENCIAS, nomeEscolaridade } from "./constantes";
import { escolaridadeMaisAlta } from "./estudos";
import type { Turno } from "./filtros";
import { chaveBairro, distanciaEntreAreas, regiaoDoBairro } from "./regioes";
import type { Curriculo } from "./tipos";
import { horarioDoBanco, textoDaResposta, type HorarioDetalhe, type Pergunta, type Respostas } from "./vaga-extra";

export type Criterio = {
  nome: string;
  /** null: não dá para saber (sem currículo, sem resposta); true: atende, inteiro ou em parte (`parte`) */
  ok: boolean | null;
  /** quanto atende, de 0 a 1, quando é só em parte (sem ela: 1 se ok, 0 se não) */
  parte?: number;
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
  /** itens que deu para conferir (sem os "?"), quantos a pessoa atende inteiros e quantos em parte */
  conferidos: number;
  atendidos: number;
  emParte: number;
  /** a nota parou neste teto (85 ou 92) porque deu para conferir poucos itens; null: não parou */
  teto: number | null;
};

/** O item bate só em parte: a função de área parecida, parte do tempo ou do horário, um pouco longe. */
export function atendeEmParte(k: Criterio) {
  return k.ok === true && k.parte !== undefined && k.parte < 1;
}

/** ", e 2 em parte": o fim do "atende 3 de 5 itens", quando há itens que batem em parte. */
export function maisEmParte(n: number | undefined) {
  return n ? `, e ${n} em parte` : "";
}

/** Quanto o item vale na conta, de 0 a 1. */
function parteDe(k: Criterio) {
  return k.ok === null ? 0 : (k.parte ?? (k.ok ? 1 : 0));
}

/** O ok e a parte de um item que vale de 0 a 1: 1 atende, 0 não atende, no meio é "em parte". */
function comParte(parte: number): Pick<Criterio, "ok" | "parte"> {
  const p = Math.round(Math.max(0, Math.min(1, parte)) * 100) / 100;
  return p >= 1 ? { ok: true } : p <= 0 ? { ok: false } : { ok: true, parte: p };
}

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
        Partial<Pick<Curriculo, "disponibilidade" | "cursos" | "estudos" | "titulo" | "habilidades">>)
    | null;
  respostas: Respostas;
  cidade: string | null;
  bairro?: string | null;
};

type CurriculoDoCandidato = NonNullable<Candidato["curriculo"]>;

const MESES_PEDIDOS: Record<string, number> = { "6_meses": 6, "1_ano": 12, "2_anos": 24 };

/** "2024-03" → um número para contar os meses. */
function numeroDoMes(t: string) {
  const m = /^(\d{4})-(\d{2})/.exec(t);
  return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : null;
}

/** Quantos meses durou um trabalho do currículo (o atual, até hoje). */
function mesesDoTrabalho(e: { inicio: string; fim: string | null }, agora: number) {
  const hoje = new Date(agora);
  const ini = numeroDoMes(e.inicio);
  const fim = e.fim ? numeroDoMes(e.fim) : hoje.getUTCFullYear() * 12 + hoje.getUTCMonth();
  return ini !== null && fim !== null && fim >= ini ? fim - ini + 1 : 0;
}

/** Quantos meses de experiência, somando as do currículo (até hoje nas atuais). */
export function mesesDeExperiencia(experiencias: { inicio: string; fim: string | null }[], agora: number) {
  return experiencias.reduce((total, e) => total + mesesDoTrabalho(e, agora), 0);
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
 * × "compras", "operação" × "operador", "seguros" × "segurança"): pedem 7 letras em comum.
 */
const RAIZES_AMBIGUAS_5 = new Set("produ compr opera admin comer contr inter merca impor trans prest segur".split(" "));

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

/** Alguma palavra de um lado tem a mesma raiz de uma do outro. */
const batem = (daVaga: string[], dele: string[]) => daVaga.some((v) => dele.some((c) => mesmaRaiz(v, c)));

/**
 * Áreas de trabalho: quem trabalhou numa função da mesma área serve em parte (vendedora numa vaga de
 * atendente, chapeiro numa de cozinheiro, motoboy numa de motorista). As palavras valem pela raiz
 * (mesmaRaiz). Ficam de fora as que mudam de área com o resto do nome ("servente", "monitor",
 * "montador", "consultor", "designer", "salão", "instalador").
 */
const AREAS_DE_TRABALHO: Record<string, string> = {
  "comércio e atendimento":
    "atendente atendimento vendedor vendas balconista caixa repositor recepcionista recepcao promotor " +
    "demonstrador representante frentista telemarketing televendas empacotador",
  alimentação:
    "cozinheiro cozinha chapeiro pizzaiolo padeiro padaria confeiteiro confeitaria salgadeiro acougueiro acougue " +
    "garcom garconete copeiro churrasqueiro sushiman barista barman bartender lanchonete restaurante merendeira",
  "limpeza e casa":
    "limpeza faxineiro faxina diarista domestica zelador camareira lavanderia passadeira higienizacao conservacao " +
    "jardineiro jardinagem piscineiro",
  "cuidado de pessoas": "cuidador baba creche recreador",
  saúde:
    "enfermeiro enfermagem farmacia farmaceutico dentista odontologia consultorio fisioterapeuta laboratorio socorrista",
  construção:
    "pedreiro obra obras construcao carpinteiro armador pintor gesseiro azulejista encanador eletricista " +
    "serralheiro marceneiro vidraceiro alvenaria",
  manutenção:
    "eletricista manutencao manutencista encanador hidraulica refrigeracao soldador torneiro serralheiro predial",
  veículos: "mecanico funileiro funilaria lanternagem borracheiro lavador automotivo",
  "transporte e logística":
    "motorista entregador motoboy motoqueiro caminhao carreteiro estoquista estoque almoxarife almoxarifado " +
    "conferente separador carregador logistica expedicao armazem empilhadeira repositor empacotador embalador",
  escritório:
    "administrativo administracao secretaria escritorio faturamento financeiro contabil contabilidade digitador " +
    "arquivista cobranca faturista recepcionista telefonista",
  beleza:
    "cabeleireiro barbeiro barbearia manicure pedicure esteticista estetica maquiadora maquiagem depiladora " +
    "depilacao sobrancelha massagista massoterapeuta",
  "segurança e portaria": "porteiro portaria vigia vigilante seguranca ronda",
  educação: "professor educador pedagogo pedagogia ensino instrutor",
  tecnologia: "programador desenvolvedor informatica sistemas software",
  costura: "costureira costura modelista overloque alfaiate confeccao",
  indústria: "industria fabrica metalurgico producao soldador torneiro maquinas embalador",
};
const AREAS = Object.entries(AREAS_DE_TRABALHO).map(([nome, palavras]) => ({ nome, palavras: palavras.split(" ") }));

/** A área de trabalho que junta uma palavra da vaga e uma do cargo (ou do título), se houver. */
function areaEmComum(daVaga: string[], dele: string[]) {
  const naArea = (palavras: string[], area: (typeof AREAS)[number]) =>
    palavras.some((p) => area.palavras.some((a) => mesmaRaiz(p, a)));
  return AREAS.find((area) => naArea(daVaga, area) && naArea(dele, area))?.nome ?? null;
}

/** "Operadora de caixa · Supermercado X · até 12/2024" */
function textoDoTrabalho(e: Curriculo["experiencias"][number]) {
  const mesAno = (t: string) => t.replace(/^(\d{4})-(\d{2}).*$/, "$2/$1");
  return `${e.cargo}${e.onde ? ` · ${e.onde}` : ""} · ${e.fim ? `até ${mesAno(e.fim)}` : `desde ${mesAno(e.inicio)}`}`;
}

/**
 * A experiência na função, de 0 a 1: um cargo do currículo ou o título com a mesma raiz do título da
 * vaga (1); da mesma área de trabalho (0,6); só um curso (0,5) ou uma habilidade (0,4) com a mesma
 * raiz; nada disso (0, "Outra área"). `usado`: o curso ou a habilidade que contou (não soma de novo
 * no "+").
 */
function funcaoNoCurriculo(
  tituloDaVaga: string,
  cv: CurriculoDoCandidato,
): { parte: number; detalhe: string; usado?: string } {
  const daVaga = palavrasDaFuncao(tituloDaVaga);
  const bate = (texto: string) => batem(daVaga, palavrasDaFuncao(texto));
  const mesma = cv.experiencias.find((e) => bate(e.cargo));
  if (mesma) return { parte: 1, detalhe: `Trabalhou como ${textoDoTrabalho(mesma)}` };
  if (cv.titulo && bate(cv.titulo)) return { parte: 1, detalhe: `No currículo: ${cv.titulo}` };
  for (const e of cv.experiencias) {
    const area = areaEmComum(daVaga, palavrasDaFuncao(e.cargo));
    if (area) return { parte: 0.6, detalhe: `Trabalhou como ${textoDoTrabalho(e)} (área parecida: ${area})` };
  }
  const area = cv.titulo ? areaEmComum(daVaga, palavrasDaFuncao(cv.titulo)) : null;
  if (area) return { parte: 0.6, detalhe: `No currículo: ${cv.titulo} (área parecida: ${area})` };
  const curso = (cv.cursos ?? []).find(bate);
  if (curso) return { parte: 0.5, detalhe: `Fez o curso: ${curso} (sem trabalho na função)`, usado: curso };
  const habilidade = (cv.habilidades ?? []).find(bate);
  if (habilidade) {
    return { parte: 0.4, detalhe: `Nas habilidades: ${habilidade} (sem trabalho na função)`, usado: habilidade };
  }
  return { parte: 0, detalhe: `Nenhum trabalho parecido com “${tituloDaVaga}” no currículo` };
}

/**
 * Quanto a experiência na função pesa na nota (os outros itens dividem o que sobra). Sem ela, a nota
 * não passa de 40%: bater a escolaridade, a cidade e o horário não faz alguém de TI servir para
 * mecânico.
 */
export const PESO_DA_FUNCAO = 0.6;

/** Os meses dos trabalhos do currículo: na função da vaga, em área parecida e nas outras. */
function mesesNaFuncao(tituloDaVaga: string, experiencias: Curriculo["experiencias"], agora: number) {
  const daVaga = palavrasDaFuncao(tituloDaVaga);
  const meses = { mesma: 0, parecida: 0, outras: 0 };
  for (const e of experiencias) {
    const doCargo = palavrasDaFuncao(e.cargo);
    const tipo = batem(daVaga, doCargo) ? "mesma" : areaEmComum(daVaga, doCargo) ? "parecida" : "outras";
    meses[tipo] += mesesDoTrabalho(e, agora);
  }
  return meses;
}

/** "1 ano na função e 8 meses em área parecida (conta a metade)". */
function textoDoTempo(m: { mesma: number; parecida: number; outras: number }) {
  if (!m.mesma && !m.parecida) {
    return m.outras ? `Nenhum tempo na função (${tempo(m.outras)} em outras áreas)` : "Sem experiência no currículo";
  }
  return [
    m.mesma ? `${tempo(m.mesma)} na função` : "",
    m.parecida ? `${tempo(m.parecida)} em área parecida (conta a metade)` : "",
  ]
    .filter(Boolean)
    .join(" e ");
}

/** Palavras dos cursos que não dizem qual é o curso. */
const GENERICAS_CURSO = new Set(
  (
    "curso cursos basico basica avancado avancada intermediario completo completa online presencial livre " +
    "certificado certificacao treinamento nivel modulo pacote para com dos das sobre"
  ).split(" "),
);

/** Nas habilidades, também as qualidades que quase toda vaga pede: não contam como "a vaga cita". */
const GENERICAS_HABILIDADE = new Set([
  ...GENERICAS_CURSO,
  ...(
    "trabalho trabalhar equipe pontual pontualidade proativo proativa proatividade responsavel responsabilidade " +
    "comprometido comprometida comprometimento dedicado dedicada dedicacao organizado organizada organizacao " +
    "comunicacao facilidade aprender vontade simpatia simpatico simpatica"
  ).split(" "),
]);

/** Palavras do texto da vaga que parecem com as de um curso sem ser ("informações" × "informática"). */
const VAZIAS_DA_VAGA = new Set("informacao informacoes interessado interessados interessada interessadas".split(" "));

/** As habilidades ou os cursos do currículo que a própria vaga cita (no título ou na descrição). */
function citadosNaVaga(itens: string[], textoDaVaga: string, genericas: Set<string>) {
  const palavrasDaVaga = new Set(
    simples(textoDaVaga)
      .split(/[^a-z0-9]+/)
      .filter((p) => p && !VAZIAS_DA_VAGA.has(p)),
  );
  const longas = [...palavrasDaVaga].filter((v) => v.length >= 6);
  return [...new Set(itens)].filter((item) =>
    simples(item)
      .split(/[^a-z0-9]+/)
      .filter((p) => (p.length >= 4 || /^nr\d+$/.test(p)) && !genericas.has(p))
      .some((p) => palavrasDaVaga.has(p) || (p.length >= 6 && longas.some((v) => v.slice(0, 6) === p.slice(0, 6)))),
  );
}

// ---------------------------------------------------------------- perto da vaga

/**
 * Perto da vaga, de 0 a 1: o mesmo bairro, a mesma região ou a mesma cidade (sem regiões) vale 1;
 * na cidade com regiões, outra região vale 0,75 até uns 10 km entre os centros e 0,6 depois disso, e
 * sem saber a região da pessoa, 0,9; outra cidade vale pela distância (0,5 até 15 km, 0,3 até 25,
 * 0,15 até 40, depois 0).
 */
function pertoDaVaga(
  vaga: { cidade: string; bairro?: string | null },
  pessoa: { cidade: string; bairro: string | null },
): { parte: number; detalhe: string } {
  if (pessoa.cidade === vaga.cidade) {
    if (vaga.bairro && pessoa.bairro && chaveBairro(pessoa.bairro) === chaveBairro(vaga.bairro)) {
      return { parte: 1, detalhe: "No mesmo bairro da vaga" };
    }
    const daVaga = vaga.bairro ? regiaoDoBairro(vaga.cidade, vaga.bairro) : null;
    // a vaga sem bairro, ou numa cidade sem regiões: a cidade toda é perto
    if (!daVaga) return { parte: 1, detalhe: "Mesma cidade da vaga" };
    const dela = pessoa.bairro ? regiaoDoBairro(pessoa.cidade, pessoa.bairro) : null;
    if (dela === daVaga) return { parte: 1, detalhe: `Na mesma região da vaga (${daVaga})` };
    if (dela) {
      const km = distanciaEntreAreas(pessoa, vaga) ?? Infinity;
      return { parte: km <= 10 ? 0.75 : 0.6, detalhe: `Na Região ${dela}; a vaga é na Região ${daVaga}` };
    }
    return {
      parte: 0.9,
      detalhe: pessoa.bairro
        ? `Em ${pessoa.bairro}, na mesma cidade da vaga`
        : "Mesma cidade da vaga (o perfil não diz o bairro)",
    };
  }
  const km = distanciaEntreAreas(pessoa, vaga);
  const parte = km === null ? 0 : km <= 15 ? 0.5 : km <= 25 ? 0.3 : km <= 40 ? 0.15 : 0;
  return {
    parte,
    detalhe: km !== null && parte ? `Mora em ${pessoa.cidade}, a uns ${Math.round(km)} km` : `Mora em ${pessoa.cidade}`,
  };
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

  // a função da vaga, pelo título ("Auxiliar de serviços gerais" não diz qual é)
  const funcaoDaVaga = vaga.titulo && palavrasDaFuncao(vaga.titulo).length ? vaga.titulo : null;

  // Tempo de experiência: o tempo na função (o de área parecida conta a metade); com parte do tempo,
  // vale parte. Vaga que não diz a função: todo o tempo de trabalho.
  const meses = vaga.experiencia ? MESES_PEDIDOS[vaga.experiencia] : undefined;
  if (meses) {
    const nome = `Experiência: ${(EXPERIENCIAS.find((e) => e.valor === vaga.experiencia)?.nome ?? "experiência").toLowerCase()}`;
    if (!cv) criterios.push({ nome, ok: null, detalhe: "Sem currículo" });
    else if (!funcaoDaVaga) {
      const tem = mesesDeExperiencia(cv.experiencias, agora);
      criterios.push({
        nome,
        ...comParte(tem / meses),
        detalhe: tem === 0 ? "Sem experiência no currículo" : `${tempo(tem)} somando os trabalhos`,
      });
    } else {
      const m = mesesNaFuncao(funcaoDaVaga, cv.experiencias, agora);
      criterios.push({ nome, ...comParte((m.mesma + m.parecida / 2) / meses), detalhe: textoDoTempo(m) });
    }
  }

  // Experiência na função: conta (e pesa mais) quando a vaga pede experiência ou quando a pessoa
  // tem alguma experiência ou um título no currículo. Sem experiência nenhuma, numa vaga que aceita
  // sem: fica de fora (o primeiro emprego não é contado contra).
  let usadoNaFuncao: string | undefined;
  if (funcaoDaVaga) {
    const temHistorico = Boolean(cv && (cv.experiencias.length || cv.titulo));
    if (meses || temHistorico) {
      const f = cv ? funcaoNoCurriculo(funcaoDaVaga, cv) : null;
      usadoNaFuncao = f?.usado;
      criterios.push({
        nome: "Experiência na função",
        ...(f ? comParte(f.parte) : { ok: null }),
        detalhe: f?.detalhe ?? "Sem currículo",
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

  // Horário: os turnos, os dias e a escala da vaga × quando a pessoa disse que pode (a parte que pode)
  const precisa = periodosDaVaga(vaga.jornada, vaga.horario);
  if (precisa.length) {
    const pode = new Set(cv?.disponibilidade ?? []);
    const podeNa = precisa.filter((p) => pode.has(p));
    const faltam = precisa.filter((p) => !pode.has(p));
    const nomes = (ps: string[]) => lista(ps.map((p) => NOME_PERIODO[p]));
    criterios.push({
      nome: `Horário: ${nomes(precisa)}`,
      ...(!cv || pode.size === 0 ? { ok: null } : comParte(podeNa.length / precisa.length)),
      detalhe: !cv
        ? "Sem currículo"
        : pode.size === 0
          ? "Não disse no currículo quando pode trabalhar"
          : faltam.length === 0
            ? `Pode: ${nomes(DISPONIBILIDADES.filter((d) => pode.has(d.valor)).map((d) => d.valor))}`
            : podeNa.length
              ? `Pode ${nomes(podeNa)}; não marcou ${nomes(faltam)}`
              : `Não marcou ${nomes(faltam)}`,
    });
  }

  // Perto da vaga: o bairro, a região e a cidade de onde a pessoa mora
  if (c.cidade) {
    const perto = pertoDaVaga(vaga, { cidade: c.cidade, bairro: c.bairro ?? null });
    criterios.push({ nome: "Perto da vaga", ...comParte(perto.parte), detalhe: perto.detalhe });
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

  // As habilidades e os cursos que a vaga cita (só somam; o que já contou na função fica de fora)
  if (cv) {
    const texto = `${vaga.titulo ?? ""} ${vaga.descricao ?? ""}`;
    const fora = (itens: string[] | undefined) => (itens ?? []).filter((x) => x !== usadoNaFuncao);
    const habilidades = citadosNaVaga(fora(cv.habilidades), texto, GENERICAS_HABILIDADE);
    const cursos = citadosNaVaga(fora(cv.cursos), texto, GENERICAS_CURSO);
    if (habilidades.length || cursos.length) {
      criterios.push({
        nome: `${habilidades.length && cursos.length ? "Habilidades e cursos" : habilidades.length ? "Habilidades" : "Cursos"} que a vaga cita`,
        ok: true,
        detalhe: lista([...habilidades, ...cursos]),
        extra: true,
      });
    }
  }

  const conhecidos = criterios.filter((x) => x.ok !== null);
  const atendidos = conhecidos.filter((x) => parteDe(x) >= 1).length;
  const emParte = conhecidos.filter(atendeEmParte).length;
  // o que a vaga pede e deu para conferir (os "+" vêm do candidato)
  const pedidos = conhecidos.filter((x) => !x.extra).length;
  // a função pesa PESO_DA_FUNCAO; os outros itens dividem o resto pela média (sem outros, só ela conta)
  const funcao = conhecidos.find((x) => x.funcao);
  const outros = conhecidos.filter((x) => !x.funcao);
  const media = outros.length ? outros.reduce((t, x) => t + parteDe(x), 0) / outros.length : null;
  const conta = funcao
    ? media === null
      ? parteDe(funcao)
      : PESO_DA_FUNCAO * parteDe(funcao) + (1 - PESO_DA_FUNCAO) * media
    : media;
  // com poucos itens para conferir, a nota não chega a 100%
  const maximo = pedidos <= 2 ? 85 : pedidos === 3 ? 92 : 100;
  const semTeto = pedidos && conta !== null ? Math.round(100 * conta) : null;
  const nota = eliminado ? 0 : semTeto === null ? null : Math.min(maximo, semTeto);
  const teto = !eliminado && semTeto !== null && semTeto > maximo ? maximo : null;
  return { nota, eliminado, criterios, conferidos: conhecidos.length, atendidos, emParte, teto };
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
 * resposta). Só quando dá para conferir onde a pessoa mora e mais alguma coisa que a vaga
 * pede: com a distância só (e os "+"), o número diria pouco.
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
