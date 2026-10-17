import "server-only";
import { calcularAderencia, requisitosDaVaga, type Aderencia } from "@/lib/aderencia";
import { esperaCurriculo, esperaResposta } from "@/lib/constantes";
import {
  listarCurriculosDosInteressados,
  listarMeusCandidatos,
  listarMinhasConversas,
  listarRespostasDosCandidatos,
  obterAnuncio,
} from "@/lib/dados";
import type { ResumoCandidato } from "@/lib/ia/tarefas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { CurriculoDoInteressado } from "@/lib/tipos";
import { juntarTriagem, perguntasDoBanco, textoDaResposta } from "@/lib/vaga-extra";
import { entrevistasDasVagas, type Entrevista } from "./quadro";
import { obterTriagens } from "./triagem";

// A caixa de entrada de quem contrata: todos os candidatos de todas as vagas, cada um
// com o que a ficha precisa (aderência, currículo, respostas, entrevista em aberto e
// mensagens novas). As abas separam o que pede você agora do que já anda.

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

export type Aba = "responder" | "andamento" | "entrevistas" | "mensagens" | "encerrados";

export const ABAS: { valor: Aba; nome: string; vazio: string }[] = [
  { valor: "responder", nome: "Para responder", vazio: "Ninguém esperando resposta: você está em dia." },
  { valor: "andamento", nome: "Em andamento", vazio: "Ninguém em andamento. Quem você aceitar aparece aqui." },
  { valor: "entrevistas", nome: "Entrevistas", vazio: "Nenhuma entrevista marcada." },
  { valor: "mensagens", nome: "Mensagens novas", vazio: "Nenhuma mensagem nova." },
  { valor: "encerrados", nome: "Encerrados", vazio: "Ninguém dispensado ou com match desfeito." },
];

const ABERTA = ["marcada", "confirmada", "remarcar"];

export const naAba: Record<Aba, (c: ItemCaixa) => boolean> = {
  responder: (c) => esperaResposta(c),
  andamento: (c) => c.status === "match" || c.aceita,
  entrevistas: (c) => Boolean(c.entrevista),
  mensagens: (c) => c.naoLidas > 0,
  encerrados: (c) => c.status === "dispensada" || c.status === "desfeito",
};

/** Mais aderente primeiro; eliminado no fim; empate: quem curtiu antes espera mais. */
function peso(c: ItemCaixa) {
  const a = c.aderencia;
  return !a ? -1 : a.eliminado ? -2 : (a.nota ?? -1);
}
const recente = (a: ItemCaixa, b: ItemCaixa) => new Date(b.curtido_em).getTime() - new Date(a.curtido_em).getTime();

export function ordenar(aba: Aba, lista: ItemCaixa[]) {
  const l = [...lista];
  if (aba === "responder") l.sort((a, b) => peso(b) - peso(a) || recente(b, a));
  else if (aba === "entrevistas")
    l.sort((a, b) => new Date(a.entrevista!.quando).getTime() - new Date(b.entrevista!.quando).getTime());
  else if (aba === "mensagens") l.sort((a, b) => b.naoLidas - a.naoLidas || recente(a, b));
  else if (aba === "andamento")
    l.sort((a, b) => {
      if (a.entrevista && b.entrevista)
        return new Date(a.entrevista.quando).getTime() - new Date(b.entrevista.quando).getTime();
      if (a.entrevista || b.entrevista) return a.entrevista ? -1 : 1;
      return recente(a, b);
    });
  else l.sort(recente);
  return l;
}

/** Todos os candidatos com o que a ficha precisa. null: não deu para ler. */
export async function montarCaixa(agora: number): Promise<ItemCaixa[] | null> {
  const [todos, conversas] = await Promise.all([listarMeusCandidatos(), listarMinhasConversas()]);
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
  const naoLidas = new Map(
    (conversas ?? [])
      .filter((c) => c.papel === "publiquei" && c.anuncio_tipo === "vaga")
      .map((c) => [`${c.anuncio_id}:${c.outro_id}`, c.nao_lidas]),
  );

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
      naoLidas: naoLidas.get(chave) ?? 0,
      endereco: a ? [a.endereco, a.bairro, a.cidade].filter(Boolean).join(", ") : "",
      resumo:
        resumo && cv && new Date(resumo.curriculo_em).getTime() === new Date(cv.atualizado_em).getTime()
          ? resumo.conteudo
          : null,
    };
  });
}
