import "server-only";
import { calcularAderencia, requisitosDaVaga } from "@/lib/aderencia";
import { nomeDisponibilidade, nomeEscolaridade } from "@/lib/constantes";
import {
  criteriosDoBanco,
  leituraDoBanco,
  normalizar,
  type AvaliacaoCopiloto,
  type CriterioCopiloto,
  type OrigemCopiloto,
} from "@/lib/copiloto";
import { listarCurriculosDosInteressados, talentosParaVaga } from "@/lib/dados";
import { textosDosEstudos } from "@/lib/estudos";
import { textoDoPeriodo } from "@/lib/experiencia";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { AnuncioCompleto, Curriculo } from "@/lib/tipos";
import { montarQuadro } from "./quadro";

// O copiloto (teste): o que a tela e as ações leem do banco, o texto do currículo que a IA recebe
// (sem nome, foto, contato nem endereço) e a pré-seleção sem IA.

export type ConfigCopiloto = {
  liberado: boolean;
  criterios: CriterioCopiloto[];
  versao: string;
  triagem: boolean;
  busca: boolean;
  padraoTriagem: boolean;
  padraoBusca: boolean;
};

/** A configuração do copiloto na vaga (null se a migração ainda não rodou). */
export async function configDoCopiloto(anuncioId: string): Promise<ConfigCopiloto | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("copiloto_da_vaga", { p_anuncio: anuncioId });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao ler o copiloto: ${error.message}`);
    return null;
  }
  const o = (data ?? {}) as Record<string, unknown>;
  return {
    liberado: o.liberado === true,
    criterios: criteriosDoBanco(o.criterios),
    versao: typeof o.versao === "string" ? o.versao : "",
    triagem: o.triagem !== false,
    busca: o.busca !== false,
    padraoTriagem: o.padrao_triagem !== false,
    padraoBusca: o.padrao_busca !== false,
  };
}

/** As leituras guardadas da vaga, por pessoa. */
export async function avaliacoesDoCopiloto(anuncioId: string): Promise<Map<string, AvaliacaoCopiloto>> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("copiloto_avaliacoes", { p_anuncio: anuncioId });
  if (error) console.error(`Publike: falha ao ler as leituras do copiloto: ${error.message}`);
  return new Map(
    (data ?? []).map((a) => [
      a.perfil_id,
      {
        perfil_id: a.perfil_id,
        origem: a.origem === "candidato" ? "candidato" : "talento",
        versao: a.versao,
        curriculo_em: a.curriculo_em,
        leitura: leituraDoBanco(a.resultado),
        atende: a.atende,
        obrigatorios_ok: a.obrigatorios_ok,
      },
    ]),
  );
}

export async function registroDoCopiloto(anuncioId: string) {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("copiloto_registro", { p_anuncio: anuncioId, p_limite: 30 });
  if (error) console.error(`Publike: falha ao ler o registro do copiloto: ${error.message}`);
  return data ?? [];
}

/** Troca as palavras do nome da pessoa (de 3 letras ou mais) por "a pessoa". */
export function semNome(texto: string, nome: string | null | undefined) {
  const palavras = (nome ?? "")
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}]/gu, ""))
    .filter((p) => p.length >= 3);
  return palavras.reduce((t, p) => t.replace(new RegExp(`(?<![\\p{L}])${p}(?![\\p{L}])`, "giu"), "a pessoa"), texto);
}

/** O currículo em texto, como a IA lê (e como a prova é conferida). */
export function textoDoCurriculo(
  cv: Omit<Curriculo, "arquivo">,
  extra: {
    bairro: string | null;
    cidade: string;
    respostas?: { pergunta: string; resposta: string }[];
    recado?: string | null;
  },
) {
  const linhas = [
    cv.titulo ? `O que faz: ${cv.titulo}` : "",
    cv.habilidades?.length ? `Habilidades: ${cv.habilidades.join(", ")}` : "",
    `Escolaridade: ${textosDosEstudos({ escolaridade: cv.escolaridade, curso: cv.curso, estudos: cv.estudos }).join("; ") || nomeEscolaridade(cv.escolaridade) || "não informou"}`,
    `CNH: ${cv.cnh ?? "não informou"}`,
    `Pode trabalhar: ${cv.disponibilidade.map(nomeDisponibilidade).join(", ") || "não informou"}`,
    `Cursos: ${cv.cursos.join(", ") || "nenhum informado"}`,
    `Mora em: ${[extra.bairro, extra.cidade].filter(Boolean).join(", ")}`,
    "Experiências:",
    ...(cv.experiencias.length
      ? cv.experiencias.map(
          (e) =>
            `- ${e.cargo}${e.onde ? ` em ${e.onde}` : ""}${textoDoPeriodo(e) ? `, ${textoDoPeriodo(e)}` : ", sem datas"}${e.descricao ? `: ${e.descricao}` : ""}`,
        )
      : ["- nenhuma (primeiro emprego)"]),
  ];
  if (extra.respostas?.length) {
    linhas.push(
      "Respostas às perguntas da vaga:",
      ...extra.respostas.map((r) => `- ${r.pergunta}: ${r.resposta || "não respondeu"}`),
    );
  }
  if (extra.recado) linhas.push(`Recado para a vaga: ${extra.recado}`);
  return linhas.filter(Boolean).join("\n");
}

const COMUNS = new Set(
  "como para pelo pela pelos pelas com sem que uma uns umas pode poder trabalhar trabalho experiencia experiencias curso cursos ensino anos meses mes minimo desejavel saber sabe ter tem area funcao vaga bairro perto mora".split(
    " ",
  ),
);

/**
 * Sem IA: a nota de aderência da vaga e as palavras dos critérios achadas no currículo (até 100). As siglas de
 * 3 letras (SQL, UML, API) também contam: nas vagas de tecnologia, são boa parte do que a vaga pede.
 */
export function preNota(criterios: CriterioCopiloto[], texto: string, aderencia: number | null) {
  const cv = ` ${normalizar(texto)} `;
  const palavras = [
    ...new Set(
      criterios.flatMap((c) => [
        ...normalizar(c.texto)
          .split(" ")
          .filter((p) => p.length >= 4 && !COMUNS.has(p)),
        ...[...c.texto.matchAll(/(?<![\p{L}\d])([A-Z]{3})s?(?![\p{L}\d])/gu)].map((m) => m[1].toLowerCase()),
      ]),
    ),
  ];
  const achadas = palavras.filter((p) => cv.includes(` ${p}`)).length;
  return Math.round(0.6 * (aderencia ?? 0) + (palavras.length ? (40 * achadas) / palavras.length : 0));
}

export type PessoaDoCopiloto = {
  perfil_id: string;
  origem: OrigemCopiloto;
  nome: string;
  foto: string | null;
  cidade: string;
  bairro: string | null;
  curriculo: Omit<Curriculo, "arquivo"> | null;
  texto: string;
  preNota: number;
  /** talento: já foi convidado para a vaga */
  convidado: boolean;
  /** candidato: pendente, match, recusado... */
  status: string | null;
};

/** Quem o copiloto pode ler na vaga: os talentos (até 500) ou os candidatos com currículo. */
export async function pessoasDoCopiloto(
  anuncio: AnuncioCompleto,
  origem: OrigemCopiloto,
  criterios: CriterioCopiloto[],
  agora: number,
): Promise<PessoaDoCopiloto[]> {
  if (origem === "talento") {
    const requisitos = { ...requisitosDaVaga(anuncio), perguntas: [] };
    const lista = await talentosParaVaga(anuncio.id).catch(() => []);
    return lista
      .map((t) => {
        const curriculo = {
          escolaridade: t.escolaridade,
          curso: t.curso,
          experiencias: t.experiencias,
          cursos: t.cursos,
          cnh: t.cnh,
          disponibilidade: t.disponibilidade,
          estudos: t.estudos,
          titulo: t.titulo,
          habilidades: t.habilidades,
          atualizado_em: t.atualizado_em,
        };
        const nota = calcularAderencia(
          requisitos,
          { curriculo, respostas: {}, cidade: t.cidade, bairro: t.bairro },
          agora,
        ).nota;
        const texto = semNome(textoDoCurriculo(curriculo, { bairro: t.bairro, cidade: t.cidade }), t.nome);
        return {
          perfil_id: t.perfil_id,
          origem,
          nome: t.nome,
          foto: t.foto,
          cidade: t.cidade,
          bairro: t.bairro,
          curriculo,
          texto,
          preNota: preNota(criterios, texto, nota),
          convidado: t.convidado,
          status: null,
        };
      })
      .sort((a, b) => b.preNota - a.preNota);
  }
  const [{ cartoes }, curriculos] = await Promise.all([
    montarQuadro(anuncio, agora),
    listarCurriculosDosInteressados(anuncio.id).catch(() => new Map()),
  ]);
  return cartoes.map((c) => {
    const cv = curriculos.get(c.perfil_id) ?? null;
    const texto = cv
      ? semNome(
          textoDoCurriculo(cv, { bairro: c.bairro, cidade: c.cidade, respostas: c.respostas, recado: c.mensagem }),
          c.nome,
        )
      : "";
    return {
      perfil_id: c.perfil_id,
      origem,
      nome: c.nome,
      foto: c.foto,
      cidade: c.cidade,
      bairro: c.bairro,
      curriculo: cv,
      texto,
      preNota: preNota(criterios, texto, c.aderencia.nota),
      convidado: false,
      status: c.status,
    };
  });
}

/** A leitura vale para os critérios de agora e para este currículo? */
export function leituraAtual(a: AvaliacaoCopiloto | undefined, versao: string, p: PessoaDoCopiloto) {
  return Boolean(
    a &&
    a.versao === versao &&
    p.curriculo &&
    new Date(a.curriculo_em).getTime() === new Date(p.curriculo.atualizado_em).getTime(),
  );
}
