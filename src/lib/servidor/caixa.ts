import "server-only";
import { calcularAderencia, requisitosDaVaga, type Aderencia } from "@/lib/aderencia";
import { abaDaEtapa, esperaCurriculo, esperaResposta } from "@/lib/constantes";
import {
  listarCurriculosDosInteressados,
  listarMeusCandidatos,
  listarRespostasDosCandidatos,
  obterAnuncio,
} from "@/lib/dados";
import type { ResumoCandidato } from "@/lib/ia/tarefas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { CurriculoDoInteressado } from "@/lib/tipos";
import { juntarTriagem, perguntasDoBanco, textoDaResposta } from "@/lib/vaga-extra";
import { conversasPorPessoa } from "./conversas";
import { entrevistasDasVagas, type Entrevista } from "./quadro";
import { obterTriagens } from "./triagem";

// A caixa de entrada de quem contrata: todos os candidatos de todas as vagas, cada um
// com o que a ficha precisa (aderência, currículo, respostas, entrevista em aberto e
// mensagens novas). As abas são as etapas.

export type Candidato = NonNullable<Awaited<ReturnType<typeof listarMeusCandidatos>>>[number];

export type ItemCaixa = Candidato & {
  chave: string;
  aceita: boolean;
  pedeCurriculo: boolean;
  /** a vaga pede currículo e a pessoa ainda não mandou: o primeiro nome dela */
  semCurriculo: string | null;
  curriculo: CurriculoDoInteressado | null;
  curriculoFalhou: boolean;
  respostas: { pergunta: string; resposta: string }[];
  aderencia: Aderencia | null;
  /** entrevista marcada, confirmada ou para remarcar */
  entrevista: Entrevista | null;
  naoLidas: number;
  /** endereço da vaga, para o presencial vir preenchido na entrevista */
  endereco: string;
  /** o resumo da IA já feito para este currículo (some quando o currículo muda) */
  resumo: ResumoCandidato | null;
};

/** Os resumos da IA guardados das minhas vagas, por "anúncio:perfil". */
async function resumosGuardados(vagas: string[]) {
  if (!vagas.length) return new Map<string, { curriculo_em: string; conteudo: ResumoCandidato }>();
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("resumos_candidato")
    .select("anuncio_id, perfil_id, curriculo_em, conteudo")
    .in("anuncio_id", vagas);
  if (error) console.error(`Publike: falha ao ler os resumos da IA: ${error.message}`);
  return new Map(
    (data ?? []).map((r) => [
      `${r.anuncio_id}:${r.perfil_id}`,
      { curriculo_em: r.curriculo_em, conteudo: r.conteudo as ResumoCandidato },
    ]),
  );
}

// As abas são as etapas do candidato, com os mesmos nomes em todo lugar (claude/plano-painel-simples.md):
// Novos → Em análise → Entrevista → Contratados, e Não seguiu no fim. Quem espera a sua resposta fica
// marcado ("espera você") na etapa em que está. As mensagens novas ficam nas Mensagens.
export type Aba = "novos" | "analise" | "entrevista" | "contratados" | "nao_seguiu";

export const ABAS: { valor: Aba; nome: string; vazio: string }[] = [
  { valor: "novos", nome: "Novos", vazio: "Ninguém novo. Quem curtir suas vagas aparece aqui." },
  { valor: "analise", nome: "Em análise", vazio: "Ninguém em análise. Mude a etapa na ficha de quem interessa." },
  { valor: "entrevista", nome: "Entrevista", vazio: "Ninguém na etapa Entrevista." },
  { valor: "contratados", nome: "Contratados", vazio: "Ninguém contratado ainda." },
  { valor: "nao_seguiu", nome: "Não seguiu", vazio: "Ninguém dispensado ou que não seguiu." },
];

/** Os nomes antigos das abas (links de avisos e e-mails já mandados) → a aba de agora. */
export const ABA_ANTIGA: Record<string, Aba> = {
  responder: "novos",
  andamento: "analise",
  entrevistas: "entrevista",
  encerrados: "nao_seguiu",
};

/** As ordens da lista ("" é a de cada aba). */
export const ORDENS = [
  { valor: "", nome: "Ordem: a da etapa" },
  { valor: "combina", nome: "Ordem: mais combina" },
  { valor: "recentes", nome: "Ordem: mais recentes" },
  { valor: "antigos", nome: "Ordem: mais antigos" },
] as const;
export type Ordem = (typeof ORDENS)[number]["valor"];

const ABERTA = ["marcada", "confirmada", "remarcar"];

/** A aba de cada candidato (uma só). Com entrevista marcada, conta na Entrevista. */
export function abaDe(c: ItemCaixa): Aba {
  const aba = abaDaEtapa(c);
  return c.entrevista && (aba === "novos" || aba === "analise") ? "entrevista" : aba;
}

export const naAba: Record<Aba, (c: ItemCaixa) => boolean> = {
  novos: (c) => abaDe(c) === "novos",
  analise: (c) => abaDe(c) === "analise",
  entrevista: (c) => abaDe(c) === "entrevista",
  contratados: (c) => abaDe(c) === "contratados",
  nao_seguiu: (c) => abaDe(c) === "nao_seguiu",
};

/** Mais aderente primeiro; eliminado no fim; empate: quem curtiu antes espera mais. */
function peso(c: ItemCaixa) {
  const a = c.aderencia;
  return !a ? -1 : a.eliminado ? -2 : (a.nota ?? -1);
}
const recente = (a: ItemCaixa, b: ItemCaixa) => new Date(b.curtido_em).getTime() - new Date(a.curtido_em).getTime();
const quandoEntrevista = (a: ItemCaixa, b: ItemCaixa) => {
  if (a.entrevista && b.entrevista)
    return new Date(a.entrevista.quando).getTime() - new Date(b.entrevista.quando).getTime();
  if (a.entrevista || b.entrevista) return a.entrevista ? -1 : 1;
  return 0;
};

export function ordenar(aba: Aba, lista: ItemCaixa[], ordem: Ordem = "") {
  const l = [...lista];
  // quem espera a sua resposta vem antes, em qualquer ordem
  const espera = (a: ItemCaixa, b: ItemCaixa) => Number(esperaResposta(b)) - Number(esperaResposta(a));
  if (ordem === "combina") l.sort((a, b) => espera(a, b) || peso(b) - peso(a) || recente(b, a));
  else if (ordem === "recentes") l.sort((a, b) => espera(a, b) || recente(a, b));
  else if (ordem === "antigos") l.sort((a, b) => espera(a, b) || recente(b, a));
  else if (aba === "novos" || aba === "analise") l.sort((a, b) => espera(a, b) || peso(b) - peso(a) || recente(b, a));
  // com data primeiro (da mais perto para a mais longe); sem data depois, quem entrou antes primeiro
  else if (aba === "entrevista") l.sort((a, b) => quandoEntrevista(a, b) || recente(b, a));
  else l.sort(recente);
  return l;
}

/** Todos os candidatos com o que a ficha precisa. null: não deu para ler. */
export async function montarCaixa(agora: number): Promise<ItemCaixa[] | null> {
  const [todos, conversas] = await Promise.all([listarMeusCandidatos(), conversasPorPessoa()]);
  if (!todos) return null;
  const vagas = [...new Set(todos.map((c) => c.anuncio_id))];
  const comCurriculo = vagas.filter((id) => todos.some((c) => c.anuncio_id === id && c.tem_curriculo));
  const [anuncios, curriculos, respostas, triagens, entrevistas, resumos] = await Promise.all([
    Promise.all(vagas.map(async (id) => [id, await obterAnuncio(id)] as const)).then((l) => new Map(l)),
    Promise.all(
      comCurriculo.map(async (id) => [id, await listarCurriculosDosInteressados(id).catch(() => null)] as const),
    ).then((l) => new Map(l)),
    listarRespostasDosCandidatos(vagas),
    obterTriagens(vagas),
    entrevistasDasVagas(vagas),
    resumosGuardados(vagas),
  ]);
  // a conversa é uma por pessoa: as não lidas são as da pessoa (de qualquer vaga ou da conexão)
  const naoLidas = new Map((conversas ?? []).map((c) => [c.outro_id, c.nao_lidas]));

  return todos.map((c) => {
    const chave = `${c.anuncio_id}:${c.perfil_id}`;
    const a = anuncios.get(c.anuncio_id) ?? null;
    const perguntas = juntarTriagem(perguntasDoBanco(a?.perguntas), triagens.get(c.anuncio_id) ?? {});
    const doAnuncio = curriculos.get(c.anuncio_id);
    const cv = doAnuncio?.get(c.perfil_id) ?? null;
    const r = respostas.get(chave) ?? {};
    const e = entrevistas.get(chave);
    const pedeCurriculo = Boolean(a?.pede_curriculo);
    const resumo = resumos.get(chave);
    return {
      ...c,
      chave,
      aceita: esperaCurriculo(c),
      pedeCurriculo,
      semCurriculo: pedeCurriculo && !c.tem_curriculo ? c.nome.split(" ")[0] : null,
      curriculo: cv,
      curriculoFalhou: c.tem_curriculo && doAnuncio === null,
      respostas: perguntas.map((q) => ({ pergunta: q.nome, resposta: textoDaResposta(q, r[q.id]) })),
      aderencia: a
        ? calcularAderencia(
            { ...requisitosDaVaga(a), perguntas },
            { curriculo: cv, respostas: r, cidade: c.cidade, bairro: c.bairro },
            agora,
          )
        : null,
      entrevista: e && c.status === "match" && ABERTA.includes(e.situacao) ? e : null,
      naoLidas: naoLidas.get(c.perfil_id) ?? 0,
      endereco: a ? [a.endereco, a.bairro, a.cidade].filter(Boolean).join(", ") : "",
      resumo:
        resumo && cv && new Date(resumo.curriculo_em).getTime() === new Date(cv.atualizado_em).getTime()
          ? resumo.conteudo
          : null,
    };
  });
}
