import "server-only";
import type { CurriculoMontado } from "@/lib/curriculo-pelo-whatsapp";
import { PERGUNTAS_DE_SEMPRE } from "@/lib/curriculo-pelo-whatsapp";
import { ocupacao } from "@/lib/cbo";
import { ONDE_FUNCIONA } from "@/lib/pracas";
import { temContatoNoTexto } from "@/lib/validacao";
import { ESQUEMA_DO_CURRICULO, limparCurriculoLido, type RespostaDoCurriculo } from "./curriculo-do-arquivo";
import { resumoLimpo } from "./leitura-curriculo";
import { chamarIA, ErroIA, lerJson } from "./openai";

// O currículo pelo WhatsApp (migração 20270902120000; claude/plano-curriculo-otimizado.md, fase 1). Dois pedidos à IA:
//   1. as perguntas do recrutador: do que a pessoa contou, as 3 perguntas que tiram a experiência escondida (o que
//      fazia no dia a dia, quanto tempo, que máquina ou sistema usava, se respondia por caixa, chave, equipe...). Nunca
//      estudo, carteira, horário (o passo 3 pergunta), nem idade, família, saúde, documento ou contato;
//   2. o currículo: da conversa toda, os campos do formulário (os mesmos da leitura do PDF) e o resumo de recrutador,
//      só com o que a pessoa disse. O tempo solto ("uns 2 anos", "desde março") vira data aproximada; o trabalho sem
//      carteira entra com o nome honesto ("Por conta própria", "Diárias", "Casa de família").

// a pergunta com o exemplo; o exemplo que não cabe sai inteiro (27/11/2026: o corte no meio deixou "…e cuidav" e o
// itálico aberto)
const MAX_PERGUNTA = 280;

const ESQUEMA_DAS_PERGUNTAS = {
  type: "object",
  additionalProperties: false,
  required: ["perguntas"],
  properties: {
    perguntas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["pergunta", "exemplo"],
        properties: { pergunta: { type: "string" }, exemplo: { type: "string" } },
      },
    },
  },
} as const;

const SISTEMA_DAS_PERGUNTAS = `Você ajuda uma pessoa que procura trabalho em ${ONDE_FUNCIONA} a montar o currículo pelo WhatsApp, no Publike (site gratuito de vagas). Ela acabou de contar que trabalho procura e onde já trabalhou. Muita gente aqui tem pouco estudo, trabalhou sem carteira, em bico ou ajudando a família, e esquece de contar o que sabe fazer.

Escreva exatamente 3 perguntas que um bom recrutador faria para tirar dela a experiência que ainda não apareceu e que conta para o trabalho que ela procura:
- o que ela fazia no dia a dia em cada trabalho (tarefas concretas);
- quanto tempo ficou em cada um, se ela não disse;
- máquina, ferramenta, sistema ou programa que usava;
- responsabilidade: mexia com dinheiro ou caixa, abria ou fechava o lugar, cuidava de estoque, treinava ou comandava alguém, atendia cliente;
- o tamanho do lugar ou o movimento (quantos atendimentos, refeições, entregas por dia), quando isso ajuda;
- bico, freelance, trabalho em casa ou para a família que pode servir para a vaga.

Regras:
- Pergunte só o que ela ainda não disse. Cite o trabalho que ela contou ("Na lanchonete, ...").
- Nunca pergunte estudo, curso, carteira de motorista nem horário (isso vem depois), nem idade, estado civil, filhos, saúde, religião, documento, endereço, telefone ou e-mail.
- Linguagem simples, de "você", curta (até 160 letras cada), sem palavra difícil.
- "exemplo": um exemplo curto de resposta, do jeito que a pessoa falaria (até 60 letras), para ela entender o que contar.
- Se ela não contou trabalho nenhum (primeiro emprego), pergunte do que ela já fez em casa, na escola, na igreja, como voluntária ou ajudando alguém, e do que ela gosta e sabe fazer.`;

/** Uma pergunta guardada por função (migração 20270903120000). */
export type PerguntaGuardada = { pergunta: string; exemplo: string };

/** O que não se pergunta no passo 2 (o passo 3 pergunta estudo, CNH e horário; o resto não se pergunta numa entrevista). */
const PROIBIDA =
  /\b(estud|escola|faculdade|curso|carteira de motorista|cnh|hor[aá]rio|idade|anos voc[eê] tem|filh|casad|sa[uú]de|religi|cpf|rg\b|endere[cç]o|telefone|e-?mail)/i;

/** "Pergunta? _Ex.: exemplo._", ou "" se não serve. */
function comoPergunta(p: { pergunta?: unknown; exemplo?: unknown }) {
  const pergunta = typeof p.pergunta === "string" ? p.pergunta.replace(/\s+/g, " ").trim() : "";
  const exemplo = typeof p.exemplo === "string" ? p.exemplo.replace(/[_*]/g, "").replace(/\s+/g, " ").trim() : "";
  if (pergunta.length < 10 || temContatoNoTexto(pergunta) || PROIBIDA.test(pergunta)) return "";
  if (pergunta.length > MAX_PERGUNTA) return "";
  const comExemplo = exemplo && exemplo.length <= 80 ? `${pergunta} _Ex.: ${exemplo.replace(/\.$/, "")}._` : pergunta;
  return comExemplo.length <= MAX_PERGUNTA ? comExemplo : pergunta;
}

/** As guardadas da função, prontas para a conversa (3), ou null. */
function dasGuardadas(guardadas: PerguntaGuardada[] | null) {
  const prontas = (guardadas ?? []).map(comoPergunta).filter(Boolean).slice(0, 3);
  return prontas.length === 3 ? prontas : null;
}

// --- Uma pergunta por vez, com as opções (22/11/2026; Marcelo: "sim" aos botões de múltipla escolha) -----------------

/** Uma pergunta da conversa: o texto (com o exemplo) e até 3 opções para tocar (vazio: resposta livre). */
export type PerguntaComOpcoes = { texto: string; opcoes: string[] };

const ESQUEMA_DA_PROXIMA = {
  type: "object",
  additionalProperties: false,
  required: ["pergunta", "exemplo", "opcoes"],
  properties: {
    pergunta: { type: "string" },
    exemplo: { type: "string" },
    opcoes: { type: "array", items: { type: "string" } },
  },
} as const;

const SISTEMA_DA_PROXIMA = `${SISTEMA_DAS_PERGUNTAS.replace(
  /Escreva exatamente 3 perguntas[^:]*:/,
  "Você vai fazer 3 perguntas, uma de cada vez, como um bom recrutador, para tirar dela a experiência que ainda não apareceu e que conta para o trabalho que ela procura. Agora escreva só a próxima pergunta, olhando o que ela já respondeu:",
)}
- "opcoes": quando a resposta cabe em poucas escolhas (quantidade, tempo, sim ou não, com que frequência), até 3 respostas curtas para ela tocar, até 20 letras cada, do jeito que ela falaria ("Até 50 por dia", "De 50 a 150", "Mais de 150"; "Sim, sempre", "Às vezes", "Nunca"). Quando a resposta é livre (o que ela fazia, que máquina usava), deixe vazio: ela responde escrevendo ou em áudio.
- Não repita pergunta já feita nem pergunte o que ela já disse. Se ela não respondeu a anterior (mandou outra coisa), pergunte outra coisa, não a mesma com outras palavras.
- Não cumprimente ("Oi", "Olá") nem comece com "Antes de tudo": a conversa já está andando. Vá direto à pergunta.`;

/** As opções que servem como botão (até 3, até 20 letras, sem repetir). */
function opcoesLimpas(opcoes: unknown): string[] {
  if (!Array.isArray(opcoes)) return [];
  const vistas = new Set<string>();
  const boas = opcoes
    .filter((o): o is string => typeof o === "string")
    .map((o) => o.replace(/[_*]/g, "").replace(/\s+/g, " ").trim())
    .filter((o) => o.length >= 2 && o.length <= 20 && !temContatoNoTexto(o))
    .filter((o) => !vistas.has(o.toLowerCase()) && vistas.add(o.toLowerCase()));
  return boas.length >= 2 ? boas.slice(0, 3) : [];
}

/**
 * A pergunta `n` (1 a 3) do passo 2, pela conversa até agora. Com as perguntas guardadas da função, a IA parte delas.
 * Sem a IA ou com a resposta ruim: a guardada `n`, ou a de sempre `n` (sem opções).
 */
export async function proximaPergunta(
  n: number,
  conversa: string,
  modelo: string | null,
  guardadas: PerguntaGuardada[] | null = null,
): Promise<PerguntaComOpcoes> {
  const reserva = { texto: (dasGuardadas(guardadas) ?? PERGUNTAS_DE_SEMPRE)[n - 1] ?? PERGUNTAS_DE_SEMPRE[0], opcoes: [] };
  if (!modelo || conversa.trim().length < 3) return reserva;
  const base = guardadas?.length
    ? `\n\nPerguntas que recrutadores daqui fazem para a função que ela procura (tiradas das vagas do Publike). Use como base, escolha uma que ela ainda não respondeu e adapte ao que ela contou:\n${guardadas
        .slice(0, 6)
        .map((g) => `- ${g.pergunta}`)
        .join("\n")}`
    : "";
  try {
    const { texto, parada } = await chamarIA({
      uso: "curriculo_whatsapp_pergunta",
      modelo,
      sistema: SISTEMA_DA_PROXIMA,
      mensagem: `A conversa até agora:\n\n${conversa.slice(-5000)}\n\nEscreva a pergunta ${n} de 3.${base}`,
      maxTokens: 400,
      esquema: { nome: "proxima_pergunta", schema: ESQUEMA_DA_PROXIMA },
      tempoLimite: 25_000,
    });
    if (parada) return reserva;
    const r = lerJson<{ pergunta?: unknown; exemplo?: unknown; opcoes?: unknown }>(texto);
    const opcoes = opcoesLimpas(r.opcoes);
    // com opções, o exemplo sobra (os botões já mostram o jeito de responder)
    const pergunta = comoPergunta({ pergunta: r.pergunta, exemplo: opcoes.length ? "" : r.exemplo });
    return pergunta ? { texto: pergunta, opcoes } : reserva;
  } catch (e) {
    console.error("Publike: a IA não fez a pergunta do currículo:", e instanceof Error ? e.message : e);
    return reserva;
  }
}

const SISTEMA_DA_FUNCAO = `Você é um recrutador experiente em ${ONDE_FUNCIONA}. Vai receber uma função (ocupação da CBO) e vagas reais dessa função publicadas no Publike (site gratuito de vagas). Escreva as 5 perguntas que você faria a quem procura essa função para descobrir a experiência que conta para essas vagas: as tarefas que as vagas mais pedem, o tamanho do lugar ou o movimento, as máquinas, ferramentas ou sistemas, as responsabilidades (caixa, estoque, equipe, abrir e fechar) e o trabalho informal que também vale.

Regras:
- Tire das vagas o que elas pedem de verdade; nada genérico ("fale de você").
- Linguagem simples, de "você", curta (até 140 letras cada).
- Nunca pergunte estudo, curso, carteira de motorista, horário, idade, estado civil, filhos, saúde, religião, documento, endereço, telefone ou e-mail.
- "exemplo": uma resposta curta do jeito que a pessoa falaria (até 60 letras).`;

/** O robô: as 5 perguntas de recrutador de uma função, das vagas dela. Null: a resposta não serviu. */
export async function perguntasDaFuncaoComIA(
  cbo: string,
  exemplos: { titulo: string; descricao: string }[],
  modelo: string,
): Promise<PerguntaGuardada[] | null> {
  const nome = ocupacao(cbo)?.nome ?? cbo;
  const vagas = exemplos
    .slice(0, 8)
    .map((v, i) => `Vaga ${i + 1}: ${v.titulo}\n${v.descricao.replace(/\s+/g, " ").slice(0, 700)}`)
    .join("\n\n");
  const { texto, parada } = await chamarIA({
    uso: "curriculo_whatsapp_funcao",
    modelo,
    sistema: SISTEMA_DA_FUNCAO,
    mensagem: `Função: ${nome} (CBO ${cbo})\n\n${vagas}`,
    maxTokens: 1200,
    esquema: { nome: "perguntas_da_funcao", schema: ESQUEMA_DAS_PERGUNTAS },
    tempoLimite: 40_000,
  });
  if (parada) return null;
  const r = lerJson<{ perguntas?: { pergunta?: unknown; exemplo?: unknown }[] }>(texto);
  const boas = (r.perguntas ?? [])
    .filter((p) => comoPergunta(p))
    .map((p) => ({
      pergunta: String(p.pergunta).replace(/\s+/g, " ").trim().slice(0, 180),
      exemplo: typeof p.exemplo === "string" ? p.exemplo.replace(/[_*]/g, "").replace(/\s+/g, " ").trim().slice(0, 80) : "",
    }))
    .slice(0, 6);
  return boas.length >= 3 ? boas : null;
}

const ESQUEMA_DO_MONTADO = {
  ...ESQUEMA_DO_CURRICULO,
  required: [...ESQUEMA_DO_CURRICULO.required, "resumo"],
  properties: { ...ESQUEMA_DO_CURRICULO.properties, resumo: { type: "string" } },
};

function sistemaDoMontado(hoje: string) {
  return `Você monta o currículo de uma pessoa que procura trabalho em ${ONDE_FUNCIONA}, a partir da conversa dela com o Publike (site gratuito de vagas) no WhatsApp. Ela respondeu escrevendo ou em áudio (a transcrição começa com 🎤 e pode ter erro de escuta). A pessoa confere tudo no site antes de salvar.

Seu trabalho é o de um bom recrutador: escrever o que ela fez do jeito que a empresa entende e valoriza, SEM INVENTAR NADA.

Regras:
- Use só o que a pessoa disse. Não invente cargo, empresa, tarefa, máquina, curso, data nem qualidade ("proativa", "comunicativa") que ela não contou. O que ela não disse fica vazio ("" ou lista vazia).
- Arrume a escrita (maiúsculas, acentos, nome de empresa e de cargo) sem mudar o sentido.
- Se a pessoa corrigiu alguma coisa depois da prévia, vale a correção.
- "e_curriculo": false só se ela não contou nada de trabalho, estudo, curso nem do que sabe fazer.
- Nunca ponha telefone, e-mail, endereço, link, CPF, RG, data de nascimento, idade, estado civil, filhos, saúde, religião nem nome de outras pessoas.
- "titulo": o trabalho que ela procura, curto (até 60 letras): "Auxiliar de cozinha", "Motorista". Sem isso, o trabalho mais recente.
- "experiencias": da mais recente para a mais antiga.
  * "cargo": o nome que o mercado usa para o que ela fazia ("Ajudante de pedreiro", "Diarista", "Vendedora", "Cozinheira"), sem exagerar o nível: quem ajudava é auxiliar ou ajudante, não chefe.
  * "onde": o nome do lugar; sem nome, o tipo de lugar ("Lanchonete", "Casa de família", "Obra"). Trabalho sem patrão: "Por conta própria". Bicos e diárias em vários lugares: "Diárias e bicos". Ajudando a família: "Negócio da família".
  * "inicio" e "fim" (AAAA-MM): conte a partir de hoje o que ela disse solto ("faz 2 anos", "saí no ano passado", "desde março", "uns 6 meses"). Só o ano: AAAA-01 no início e AAAA-12 no fim. Só a duração ("fiquei 2 anos", sem quando): use o fim mais provável que ela deu a entender; sem nada, deixe as datas vazias. "atual": true se ainda trabalha lá, com "fim" "".
  * "descricao": o que ela fazia, em 1 ou 2 frases curtas e concretas, sem "eu", com os verbos e os números que ela disse ("Preparo de lanches e porções na chapa e na fritadeira, cerca de 80 pedidos por dia. Fechamento do caixa.", até 300 letras).
- "habilidades": até 10, curtas (até 40 letras), o que ela disse que sabe fazer ou usar: "Chapa e fritadeira", "Maquininha de cartão", "Empilhadeira". Não repita os cursos.
- "escolaridade": a mais alta, desta lista: "fundamental_incompleto", "fundamental", "medio_incompleto", "medio", "tecnico", "superior_incompleto", "superior", "pos". "Parei na 8ª série" é "fundamental"; "estou no 2º ano" ou "parei no 1º ano do médio" é "medio_incompleto"; "terminei o médio" é "medio".
- "curso": o nome do curso técnico, da faculdade ou da pós (até 80 letras), só para técnico, superior ou pós. "outros_estudos": outros técnicos, faculdades ou pós, além do mais alto.
- "cursos": cursos livres, NR, informática, idiomas, manipulação de alimentos (até 80 letras cada).
- "cnh": a categoria, só se ela disser ("carteira B"; "A e B" é "AB"; "não tenho" fica "").
- "disponibilidade": só o que ela disser, desta lista: "manha", "tarde", "noite", "fim_de_semana", "escala". "Qualquer horário" ou "integral" é manhã e tarde.
- "resumo": uma linha para a empresa entender a pessoa em 5 segundos, com partes separadas por " · ", até 160 letras, só fatos que ela disse: o trabalho que procura · o tempo de experiência · o que faz de mais importante · um curso que conta. Ex.: "Auxiliar de cozinha · cerca de 2 anos em lanchonete · chapa, fritura e pré-preparo · curso de manipulação de alimentos". Sem experiência nenhuma: "Primeiro emprego · ..." com o que ela contou.
- Hoje é ${hoje} (AAAA-MM).`;
}

/**
 * O currículo da conversa (CurriculoLido + resumo). Null: a conversa não diz nada de trabalho nem de estudo. Erros da
 * IA saem como ErroIA.
 */
export async function montarCurriculoDaConversa(conversa: string, modelo: string, hoje: string): Promise<CurriculoMontado | null> {
  const { texto, parada } = await chamarIA({
    uso: "curriculo_whatsapp_montar",
    modelo,
    sistema: sistemaDoMontado(hoje),
    mensagem: `A conversa do currículo:\n\n${conversa.slice(-9000)}`,
    maxTokens: 3000,
    esquema: { nome: "curriculo_da_conversa", schema: ESQUEMA_DO_MONTADO },
    tempoLimite: 60_000,
  });
  if (parada === "recusa") throw new ErroIA("A IA não quis montar este currículo.");
  if (parada === "limite") throw new ErroIA("A resposta da IA ficou incompleta.");
  const r = lerJson<Partial<RespostaDoCurriculo> & { resumo?: unknown }>(texto);
  if (!r.e_curriculo) return null;
  const c = limparCurriculoLido(r, hoje);
  if (!c.titulo && !c.experiencias.length && !c.habilidades.length && !c.escolaridade && !c.cursos.length) return null;
  return { ...c, resumo: resumoLimpo(r.resumo) };
}
