// As perguntas que o chat faz no match (claude/plano-match-no-chat.md; migração 20270202120000): até 3, uma por
// mensagem, sobre o que a vaga pede e o currículo não mostra (CNH, experiência, horário, escolaridade), e sempre
// "quando pode começar". Sem IA: o mesmo que o % de match confere. O robô das filas monta aqui; o banco confere o
// formato, manda e guarda as respostas.

import { periodosPedidos, type CamposDaVaga } from "./aderencia";
import { escolaridadeMaisAlta } from "./estudos";
import type { Estudo } from "./tipos";
import { horarioDoBanco, perguntasDoBanco, textoDoHorario } from "./vaga-extra";

export type ChaveDaPergunta = "cnh" | "experiencia" | "horario" | "escolaridade" | "comecar";

/** Um botão: o texto dele, a resposta que entra na conversa e o pedaço do resumo para a empresa. */
export type OpcaoDaPergunta = { rotulo: string; resposta: string; resumo: string };

export type PerguntaDoMatch = { chave: ChaveDaPergunta; rotulo: string; texto: string; opcoes: OpcaoDaPergunta[] };

export const MAX_PERGUNTAS_DO_MATCH = 3;

export type VagaDasPerguntas = Pick<
  CamposDaVaga,
  "escolaridade_minima" | "experiencia" | "cnh" | "jornada" | "horario_detalhe"
> & { perguntas?: unknown };

export type CurriculoDasPerguntas = {
  escolaridade: string | null;
  estudos?: Estudo[];
  cnh: string | null;
  disponibilidade: string[];
  /** quantos trabalhos o currículo tem */
  experiencias: number;
} | null;

const SIM = "Sim";
const NAO = "Não";

/** A escolaridade que a vaga pede, na pergunta e no resumo (o mínimo "fundamental incompleto" não pergunta). */
const ESCOLARIDADE: Record<string, { pede: string; sim: string; nao: string; cursando?: string }> = {
  fundamental: {
    pede: "ensino fundamental completo",
    sim: "tem o fundamental completo",
    nao: "não tem o fundamental completo",
    cursando: "está cursando o fundamental",
  },
  medio_incompleto: {
    pede: "ensino médio, mesmo incompleto",
    sim: "chegou ao ensino médio",
    nao: "não chegou ao ensino médio",
  },
  medio: {
    pede: "ensino médio completo",
    sim: "tem o ensino médio completo",
    nao: "não tem o ensino médio completo",
    cursando: "está cursando o ensino médio",
  },
  tecnico: {
    pede: "curso técnico",
    sim: "tem curso técnico",
    nao: "não tem curso técnico",
    cursando: "está cursando o técnico",
  },
  superior_incompleto: {
    pede: "faculdade, mesmo incompleta",
    sim: "faz ou fez faculdade",
    nao: "não fez faculdade",
  },
  superior: {
    pede: "faculdade completa",
    sim: "tem faculdade completa",
    nao: "não tem faculdade completa",
    cursando: "está cursando a faculdade",
  },
  pos: {
    pede: "pós-graduação",
    sim: "tem pós-graduação",
    nao: "não tem pós-graduação",
    cursando: "está cursando a pós",
  },
};

const TEMPO_PEDIDO: Record<string, string> = { "6_meses": "6 meses", "1_ano": "1 ano", "2_anos": "2 anos" };

const PERIODO_NA_FRASE: Record<string, string> = {
  manha: "de manhã",
  tarde: "à tarde",
  noite: "à noite",
  fim_de_semana: "no fim de semana",
  escala: "em escala",
};

/** O assunto que a própria vaga já perguntou na candidatura, pelo texto da pergunta (sem acento). */
const JA_PERGUNTADO: Record<ChaveDaPergunta, RegExp> = {
  cnh: /\bcnh\b|habilitac/,
  experiencia: /experiencia/,
  horario: /horario|turno|escala|noite|noturn|fim de semana|fins de semana|madrugada|folga/,
  escolaridade: /escolaridade|ensino|estud|formacao|faculdade|graduac|curso tecnico/,
  comecar: /comecar|inicio|iniciar|imediat/,
};

const simples = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

function lista(itens: string[]) {
  return itens.length > 1 ? `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}` : (itens[0] ?? "");
}

/** As perguntas do match, na ordem: até 2 do que a vaga pede e o currículo não mostra, e "quando pode começar". */
export function montarPerguntasDoMatch(vaga: VagaDasPerguntas, cv: CurriculoDasPerguntas): PerguntaDoMatch[] {
  const feitas = perguntasDoBanco(vaga.perguntas)
    .map((p) => simples(p.nome))
    .join(" | ");
  const livre = (chave: ChaveDaPergunta) => !JA_PERGUNTADO[chave].test(feitas);
  const perguntas: PerguntaDoMatch[] = [];

  // a CNH: só quando o currículo não diz (a que não cobre já aparece na ficha)
  if (vaga.cnh && !cv?.cnh && livre("cnh")) {
    perguntas.push({
      chave: "cnh",
      rotulo: `CNH ${vaga.cnh}`,
      texto: `A vaga pede CNH ${vaga.cnh}. Você tem?`,
      opcoes: [
        { rotulo: SIM, resposta: `Sim, tenho CNH ${vaga.cnh}.`, resumo: `tem CNH ${vaga.cnh}` },
        { rotulo: NAO, resposta: `Não tenho CNH ${vaga.cnh}.`, resumo: `não tem CNH ${vaga.cnh}` },
      ],
    });
  }

  // a experiência que a vaga pede, quando o currículo não tem trabalho nenhum
  const tempo = vaga.experiencia ? TEMPO_PEDIDO[vaga.experiencia] : undefined;
  if (tempo && (!cv || cv.experiencias === 0) && livre("experiencia")) {
    perguntas.push({
      chave: "experiencia",
      rotulo: "Experiência",
      texto: `A vaga pede ${tempo} de experiência na função. Você tem?`,
      opcoes: [
        { rotulo: SIM, resposta: `Sim, tenho ${tempo} ou mais.`, resumo: `tem ${tempo} de experiência` },
        { rotulo: "Menos que isso", resposta: "Tenho menos que isso.", resumo: `tem menos de ${tempo} de experiência` },
        { rotulo: "Não tenho", resposta: "Não tenho experiência na função.", resumo: "não tem experiência na função" },
      ],
    });
  }

  // o horário: os turnos e os dias da vaga que o currículo não marcou
  const pode = new Set(cv?.disponibilidade ?? []);
  const faltam = periodosPedidos(vaga).filter((p) => !pode.has(p));
  if (faltam.length && livre("horario")) {
    const h = horarioDoBanco(vaga.horario_detalhe);
    const montado = h && (h.turnos.length || h.dias.length) ? textoDoHorario({ ...h, obs: "" }) : "";
    const frase = montado
      .replace(/ · /g, ", ")
      .replace(/^./, (x) => x.toLowerCase())
      .replace(/, Escala/, ", escala");
    const quando = lista(faltam.map((p) => PERIODO_NA_FRASE[p] ?? p));
    perguntas.push({
      chave: "horario",
      rotulo: "Horário",
      texto: frase ? `O horário é ${frase}. Dá para você?` : `A vaga é ${quando}. Dá para você?`,
      opcoes: [
        { rotulo: SIM, resposta: "Sim, dá para mim.", resumo: frase ? "pode no horário" : `pode ${quando}` },
        { rotulo: NAO, resposta: "Não dá para mim.", resumo: frase ? "não pode no horário" : `não pode ${quando}` },
        { rotulo: "Só em parte", resposta: "Dá só em parte.", resumo: "pode só parte do horário" },
      ],
    });
  }

  // a escolaridade: quando o currículo não diz até onde a pessoa estudou
  const esc = vaga.escolaridade_minima ? ESCOLARIDADE[vaga.escolaridade_minima] : undefined;
  if (esc && (!cv || !escolaridadeMaisAlta(cv)) && livre("escolaridade")) {
    perguntas.push({
      chave: "escolaridade",
      rotulo: "Escolaridade",
      texto: `A vaga pede ${esc.pede}. Você tem?`,
      opcoes: [
        { rotulo: SIM, resposta: "Sim, tenho.", resumo: esc.sim },
        { rotulo: NAO, resposta: "Não tenho.", resumo: esc.nao },
        ...(esc.cursando ? [{ rotulo: "Estou cursando", resposta: "Estou cursando.", resumo: esc.cursando }] : []),
      ],
    });
  }

  const comecar: PerguntaDoMatch | null = livre("comecar")
    ? {
        chave: "comecar",
        rotulo: "Quando começa",
        texto: "Quando pode começar?",
        opcoes: [
          { rotulo: "Já", resposta: "Posso começar já.", resumo: "começa já" },
          { rotulo: "Em 1 semana", resposta: "Posso começar em 1 semana.", resumo: "começa em 1 semana" },
          { rotulo: "Em 15 dias", resposta: "Posso começar em 15 dias.", resumo: "começa em 15 dias" },
          { rotulo: "Mais tarde", resposta: "Só consigo começar mais tarde.", resumo: "só começa mais tarde" },
        ],
      }
    : null;
  return comecar
    ? [...perguntas.slice(0, MAX_PERGUNTAS_DO_MATCH - 1), comecar]
    : perguntas.slice(0, MAX_PERGUNTAS_DO_MATCH);
}

/** A pergunta como vem na mensagem: os botões e o índice escolhido (null: ainda sem resposta). */
export type PerguntaNaMensagem = { chave: string; rotulo: string; opcoes: string[]; resposta: number | null };

export function lerPerguntaDaMensagem(x: unknown): PerguntaNaMensagem | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const opcoes = Array.isArray(o.opcoes) ? o.opcoes.filter((v): v is string => typeof v === "string") : [];
  if (typeof o.chave !== "string" || opcoes.length < 2) return null;
  const r = typeof o.resposta === "number" && Number.isInteger(o.resposta) ? o.resposta : null;
  return {
    chave: o.chave,
    rotulo: typeof o.rotulo === "string" ? o.rotulo : "",
    opcoes,
    resposta: r !== null && r >= 0 && r < opcoes.length ? r : null,
  };
}
