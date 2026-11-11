// A bateria da nota de aderência (claude/plano-pesos-da-aderencia.md), sem banco: os casos de sempre com a nota
// esperada e 4.000 combinações sorteadas que conferem as regras. Roda com `npx tsx scripts/testar-aderencia.ts`
// (sai com erro se algo mudou). Mudou um peso de propósito? Ajuste os números esperados aqui, no mesmo commit.
import {
  calcularAderencia,
  matchComAVaga,
  perfilDaVaga,
  TETO_SEM_OBRIGATORIO,
  type Aderencia,
} from "../src/lib/aderencia";
import { entraEmParaAVaga } from "../src/lib/talentos";

const agora = Date.UTC(2026, 10, 11);
const semana = ["seg", "ter", "qua", "qui", "sex"];
const h = (inicio: string, fim: string, dias = semana) => ({ escala: null, dias, turnos: [{ inicio, fim }], obs: "" });
type V = Record<string, unknown> & { nome: string; titulo: string };
const vaga = (nome: string, o: Record<string, unknown>): V => ({
  nome,
  titulo: nome,
  descricao: "",
  cbo: null,
  escolaridade_minima: null,
  experiencia: null,
  cnh: null,
  cidade: "Goiânia",
  bairro: null,
  jornada: null,
  horario: null,
  perguntas: [],
  ...o,
});
const exp = (cargo: string, inicio: string, fim: string | null) => ({ cargo, onde: "Empresa", inicio, fim, descricao: "" });
const P = (o: Record<string, unknown> = {}, onde: { cidade?: string } = {}) => ({
  curriculo: {
    escolaridade: "medio",
    curso: null,
    experiencias: [],
    cnh: null,
    disponibilidade: ["manha", "tarde"],
    cursos: [],
    estudos: [],
    titulo: null,
    habilidades: [],
    ...o,
  },
  respostas: {},
  cidade: onde.cidade ?? "Goiânia",
  bairro: null,
});

const V1 = vaga("Engenheiro de dados", { descricao: "Pipelines de dados em Python e SQL na nuvem." });
const V2 = vaga("Atendente (aceita sem)", {
  titulo: "Atendente de loja",
  experiencia: "sem",
  escolaridade_minima: "medio",
  horario: h("08:00", "17:00"),
});
const V3 = vaga("Atendente (não informou)", {
  titulo: "Atendente de loja",
  escolaridade_minima: "medio",
  horario: h("08:00", "17:00"),
  descricao: "Atendimento ao cliente e caixa.",
});
const V4 = vaga("Atendente (texto)", {
  titulo: "Atendente de loja",
  horario: h("08:00", "17:00"),
  descricao: "Não é necessário ter experiência. Treinamos você.",
});
const V5 = vaga("Motorista de caminhão", { cnh: "D", experiencia: "1_ano", horario: h("06:00", "15:00") });
const V6 = vaga("Técnico de enfermagem", {
  escolaridade_minima: "tecnico",
  horario: { escala: "12x36", dias: [], turnos: [{ inicio: "07:00", fim: "19:00" }], obs: "" },
});
const V7 = vaga("Jovem aprendiz administrativo", { cbo: "411005", horario: h("08:00", "12:00") });
const V8 = vaga("Auxiliar de enfermagem", { horario: h("07:00", "13:00") });
const V9 = vaga("Vendedor externo", { cnh: "B", descricao: "Visitar clientes." });
const V10 = vaga("Estágio em Direito", { experiencia: "sem", descricao: "Não é necessário ter experiência." });
// os falsos positivos do relatório do Admin (11/11/2026)
const V11 = vaga("Estágio em ciências contábeis", { titulo: "Estagio na área de ciências contábeis" });
const V12 = vaga("Departamento Contábil", {});
const V13 = vaga("Auxiliar Fiscal", {});
const V14 = vaga("Auxiliar administrativo", {});

const primeiro = P();
const cursoDeDados = P({ cursos: ["Análise de dados com Python"] });
const faculdadeDeDados = P({ escolaridade: "superior_incompleto", curso: "Ciência de dados" });
const engenhariaCivil = P({ escolaridade: "superior", curso: "Engenharia Civil" });
const analista = P({ experiencias: [exp("Analista de dados", "2024-01", "2025-12")] });
const atendente = P({ experiencias: [exp("Atendente", "2023-06", "2025-06")] });
const vendedora = P({ experiencias: [exp("Vendedora", "2024-06", "2025-06")] });
const pedreiro = P({ escolaridade: "fundamental", experiencias: [exp("Pedreiro", "2022-01", "2025-01")] });
const motoristaB = P({ cnh: "B", experiencias: [exp("Motorista", "2022-01", "2025-01")] });
const motoristaD = P({ cnh: "D", experiencias: [exp("Motorista de caminhão", "2022-01", "2025-01")] });
const tecnicaEnfermagem = P({ escolaridade: "tecnico", curso: "Técnico em enfermagem", disponibilidade: ["escala"] });
const deLonge = P({ disponibilidade: ["noite"] }, { cidade: "Trindade" });
const estudanteDeDireito = P({ escolaridade: "superior_incompleto", curso: "Direito" });
const biologia = P({ escolaridade: "superior_incompleto", curso: "Ciências biológicas" });
const contabeis = P({ escolaridade: "superior_incompleto", curso: "Ciências contábeis" });
const cursoDeDP = P({ cursos: ["Departamento pessoal"] });
const auxiliarDeDP = P({ experiencias: [exp("Auxiliar de departamento pessoal", "2023-01", "2025-01")] });
const atendenteSemMedio = P({ escolaridade: "medio_incompleto", experiencias: [exp("Atendente", "2023-06", "2025-06")] });

// [vaga, pessoa, nome, a nota da empresa, o % de quem procura (null: sem %), entra em Talentos › Para a sua vaga]
const casos: [V, ReturnType<typeof P>, string, number | null, number | null, boolean][] = [
  [V1, analista, "analista de dados", 85, 85, true],
  [V1, primeiro, "primeiro emprego sem nada", 40, null, false],
  [V1, cursoDeDados, "primeiro emprego + curso", 70, 70, true],
  [V1, faculdadeDeDados, "primeiro emprego + faculdade da área", 76, 76, true],
  [V1, engenhariaCivil, "Engenharia Civil", 40, null, false],
  [V1, atendente, "atendente", 40, 40, false],
  [V2, atendente, "atendente", 100, 100, true],
  [V2, vendedora, "vendedora (área parecida)", 94, 94, true],
  [V2, primeiro, "primeiro emprego", 79, 79, false],
  [V2, pedreiro, "pedreiro sem o médio", 45, 45, false],
  [V2, deLonge, "longe e só à noite", 33, 33, false],
  [V2, atendenteSemMedio, "atendente sem o médio", 45, 45, false],
  [V3, primeiro, "primeiro emprego", 79, 79, false],
  [V3, vendedora, "vendedora", 94, 94, true],
  [V4, primeiro, "primeiro emprego", 79, 79, false],
  [V5, motoristaD, "motorista com CNH D", 100, 100, true],
  [V5, motoristaB, "motorista com CNH B", 45, 45, false],
  [V5, primeiro, "primeiro emprego", 23, 23, false],
  [V6, tecnicaEnfermagem, "técnico em enfermagem", 64, 64, true],
  [V6, primeiro, "primeiro emprego", 24, null, false],
  [V7, atendente, "atendente (outra área)", 79, 79, false],
  [V7, primeiro, "primeiro emprego", 79, 79, false],
  [V8, tecnicaEnfermagem, "técnico em enfermagem, só escala", 45, 45, false],
  [V8, primeiro, "primeiro emprego", 40, null, false],
  [V9, vendedora, "vendedora sem CNH", 45, 45, false],
  [V9, primeiro, "primeiro emprego", 27, null, false],
  [V10, estudanteDeDireito, "estudante de Direito", 76, 76, true],
  [V10, primeiro, "primeiro emprego sem Direito", 40, null, false],
  [V10, atendente, "atendente", 40, 40, false],
  [V11, biologia, "Ciências biológicas", 40, null, false],
  [V11, contabeis, "Ciências contábeis", 76, 76, true],
  [V12, cursoDeDP, "curso de departamento pessoal", 40, null, false],
  [V12, auxiliarDeDP, "auxiliar de departamento pessoal (área parecida)", 76, 76, true],
  [V13, pedreiro, "pedreiro", 40, 40, false],
  [V13, primeiro, "primeiro emprego", 40, null, false],
  [V14, primeiro, "primeiro emprego", 79, 79, false],
];

let falhas = 0;
const falhou = (texto: string) => {
  falhas++;
  console.error(`✗ ${texto}`);
};

for (const [v, p, nome, empresa, pessoa, talentos] of casos) {
  const a = calcularAderencia({ ...v, perguntas: [] } as never, p as never, agora);
  const m = matchComAVaga({ ...v, horario_detalhe: v.horario } as never, p as never, agora);
  const aqui = `${v.nome} × ${nome}`;
  if (a.nota !== empresa) falhou(`${aqui}: a empresa via ${empresa}, agora ${a.nota}`);
  if ((m?.nota ?? null) !== pessoa) falhou(`${aqui}: a pessoa via ${pessoa ?? "sem %"}, agora ${m?.nota ?? "sem %"}`);
  if (entraEmParaAVaga(a) !== talentos) falhou(`${aqui}: Talentos ${talentos ? "devia" : "não devia"} mostrar`);
}

const perfis: [V, string][] = [
  [V1, "experiencia"],
  [V2, "entrada"],
  [V3, "entrada"],
  [V4, "entrada"],
  [V5, "experiencia"],
  [V6, "experiencia"],
  [V7, "entrada"],
  [V8, "experiencia"],
  [V9, "experiencia"],
  [V10, "experiencia"],
  [V13, "experiencia"],
  [V14, "entrada"],
];
for (const [v, esperado] of perfis) {
  const perfil = perfilDaVaga(v as never);
  if (perfil !== esperado) falhou(`${v.nome}: o perfil devia ser ${esperado}, agora ${perfil}`);
}

// as regras, em combinações sorteadas (sempre as mesmas: o sorteio tem semente)
let semente = 42;
const sortear = (n: number) => {
  semente = (semente * 1103515245 + 12345) % 2 ** 31;
  return semente % n;
};
const exp1 = (cargo: string) => ({ cargo, onde: "X", inicio: "2023-01", fim: "2025-01", descricao: "" });
const evidencias: [string, Record<string, unknown>][] = [
  ["mesma", { experiencias: [exp1("Atendente")] }],
  ["parecida", { experiencias: [exp1("Vendedora")] }],
  ["estudo", { curso: "Gestão de atendimento" }],
  ["curso", { cursos: ["Atendimento ao cliente"] }],
  ["habilidade", { habilidades: ["Atendimento"] }],
  ["primeiro emprego", {}],
  ["outra área", { experiencias: [exp1("Pedreiro")] }],
];
for (let i = 0; i < 4000; i++) {
  const v = {
    titulo: "Atendente de loja",
    descricao: "",
    cbo: null,
    escolaridade_minima: [null, "medio"][sortear(2)],
    experiencia: [null, "sem", "6_meses", "1_ano"][sortear(4)],
    cnh: [null, "B"][sortear(2)],
    cidade: "Goiânia",
    bairro: null,
    jornada: null,
    horario: sortear(2) ? h("08:00", "17:00", ["seg", "ter"]) : null,
    perguntas: [],
  };
  const base = {
    escolaridade: ["medio", "fundamental"][sortear(2)],
    cnh: [null, "B"][sortear(2)],
    disponibilidade: [[], ["manha"], ["manha", "tarde"], ["noite"]][sortear(4)],
    cursos: [],
    estudos: [],
    titulo: null,
    habilidades: [],
    curso: null,
    experiencias: [],
  };
  const cidade = ["Goiânia", "Trindade", "Anápolis"][sortear(3)];
  const notas: Aderencia[] = evidencias.map(([, e]) =>
    calcularAderencia(v as never, { curriculo: { ...base, ...e }, respostas: {}, cidade, bairro: null } as never, agora),
  );
  const brutas = notas.map((a) => a.bruta ?? -1);
  for (let k = 0; k < 5; k++)
    if (brutas[k] < brutas[k + 1] - 0.5) {
      falhou(`mais da função deu nota menor: ${evidencias[k][0]} ${brutas[k]} < ${evidencias[k + 1][0]} ${brutas[k + 1]}`);
      break;
    }
  if (notas[0].perfil === "experiencia" && (notas[5].nota ?? 0) > 40)
    falhou(`primeiro emprego sem nada passou de 40% numa vaga de experiência (${notas[5].nota})`);
  for (const a of notas)
    if (a.faltam.length && (a.nota ?? 0) > TETO_SEM_OBRIGATORIO)
      falhou(`faltando ${a.faltam.join(", ")}, a nota passou de ${TETO_SEM_OBRIGATORIO}% (${a.nota})`);
  if (notas[0].perfil === "entrada" && Math.max(notas[4].nota ?? 0, notas[5].nota ?? 0, notas[6].nota ?? 0) > 79)
    falhou(`na vaga de entrada, quem só tem habilidade ou nada da função passou de 79%`);
  if (notas[0].perfil === "entrada" && notas[5].bruta !== notas[6].bruta)
    falhou(`na vaga de entrada, primeiro emprego (${notas[5].bruta}) e outra área (${notas[6].bruta}) ficaram diferentes`);
}

if (falhas) {
  console.error(`\n${falhas} ${falhas === 1 ? "falha" : "falhas"}.`);
  process.exit(1);
}
console.log(`✓ ${casos.length} casos, ${perfis.length} perfis e 4.000 combinações conferidos.`);
