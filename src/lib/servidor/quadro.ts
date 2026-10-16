import "server-only";
import { calcularAderencia, type Aderencia } from "@/lib/aderencia";
import { etapaQueVale, type EtapaCandidato } from "@/lib/constantes";
import {
  listarCurriculosDosInteressados,
  listarEtapasDosCandidatos,
  listarInteressados,
  listarRespostasDosCandidatos,
} from "@/lib/dados";
import { colunaDoCandidato, MODELOS_PRONTOS, type ModeloMensagem } from "@/lib/recrutamento";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { AnuncioCompleto } from "@/lib/tipos";
import { juntarTriagem, perguntasDoBanco, textoDaResposta, type Pergunta } from "@/lib/vaga-extra";
import { obterTriagem } from "./triagem";

// Tudo o que o quadro de candidatos de uma vaga precisa, montado no servidor:
// cada candidato com a coluna, a nota de aderência, as respostas e a entrevista.

export type Entrevista = {
  id: string;
  perfil_id: string;
  anuncio_id: string;
  quando: string;
  duracao_min: number;
  formato: string;
  local: string | null;
  obs: string | null;
  situacao: string;
};

export type CartaoDoQuadro = {
  perfil_id: string;
  nome: string;
  foto: string | null;
  cidade: string;
  bairro: string | null;
  status: string;
  curtido_em: string;
  mensagem: string | null;
  whatsapp: string | null;
  email: string | null;
  etapa: EtapaCandidato;
  coluna: EtapaCandidato;
  anotacao: string | null;
  aderencia: Aderencia;
  respostas: { pergunta: string; resposta: string }[];
  entrevista: Entrevista | null;
  temCurriculo: boolean;
};

/** As entrevistas em aberto (ou a última) de cada candidato de uma vaga. */
export async function entrevistasDaVaga(anuncioId: string): Promise<Map<string, Entrevista>> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("entrevistas")
    .select("id, perfil_id, anuncio_id, quando, duracao_min, formato, local, obs, situacao")
    .eq("anuncio_id", anuncioId)
    .order("atualizado_em", { ascending: true });
  if (error) {
    console.error(`Publike: falha ao ler as entrevistas: ${error.message}`);
    return new Map();
  }
  // a mais recente de cada um fica por último e vale
  return new Map((data ?? []).map((e) => [e.perfil_id, e]));
}

export async function modelosDaConta(): Promise<ModeloMensagem[]> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("modelos_mensagem").select("id, nome, texto").order("criado_em");
  return [...(data ?? []), ...MODELOS_PRONTOS];
}

export async function montarQuadro(anuncio: AnuncioCompleto, agora: number) {
  const id = anuncio.id;
  const [interessados, etapas, curriculos, respostas, triagem, entrevistas, modelos] = await Promise.all([
    listarInteressados(id),
    listarEtapasDosCandidatos(id),
    listarCurriculosDosInteressados(id).catch(() => new Map()),
    listarRespostasDosCandidatos([id]),
    obterTriagem(id),
    entrevistasDaVaga(id),
    modelosDaConta(),
  ]);
  const perguntas: Pergunta[] = juntarTriagem(perguntasDoBanco(anuncio.perguntas), triagem);
  const vaga = {
    escolaridade_minima: anuncio.escolaridade_minima,
    experiencia: anuncio.experiencia,
    cnh: anuncio.cnh,
    cidade: anuncio.cidade,
    perguntas,
  };

  const cartoes: CartaoDoQuadro[] = interessados.map((p) => {
    const e = etapas.get(p.perfil_id);
    const etapa = etapaQueVale("vaga", p.status, e?.etapa ?? "novo");
    const cv = curriculos.get(p.perfil_id) ?? null;
    const r = respostas.get(`${id}:${p.perfil_id}`) ?? {};
    return {
      perfil_id: p.perfil_id,
      nome: p.nome,
      foto: p.foto,
      cidade: p.cidade,
      bairro: p.bairro,
      status: p.status,
      curtido_em: p.curtido_em,
      mensagem: p.mensagem,
      whatsapp: p.whatsapp,
      email: p.email,
      etapa,
      coluna: colunaDoCandidato(p.status, etapa),
      anotacao: e?.nota ?? null,
      aderencia: calcularAderencia(vaga, { curriculo: cv, respostas: r, cidade: p.cidade }, agora),
      respostas: perguntas.map((q) => ({ pergunta: q.nome, resposta: textoDaResposta(q, r[q.id]) })),
      entrevista: entrevistas.get(p.perfil_id) ?? null,
      temCurriculo: Boolean(cv),
    };
  });
  // os mais aderentes primeiro; empate: quem curtiu antes
  cartoes.sort(
    (a, b) =>
      (b.aderencia.nota ?? -1) - (a.aderencia.nota ?? -1) ||
      new Date(a.curtido_em).getTime() - new Date(b.curtido_em).getTime(),
  );
  return { cartoes, modelos, temTriagem: perguntas.some((q) => q.esperada) };
}
