import {
  calcularAderencia,
  dizAFuncao,
  ordemDaNota,
  perfilDaVaga,
  requisitosDaVaga,
  type AtividadesDaVaga,
  type CamposDaVaga,
  type Candidato,
} from "./aderencia";
import type { EscolhaDoJeito, ItemDoJeito } from "./jeito-de-trabalhar";
import { atendeAVaga, entraEmParaAVaga } from "./talentos";

// A conta do "Para a sua vaga" num lugar só (22/11/2026): a aba Talentos e o aviso "quem atende a sua vaga e ainda não
// curtiu" (src/lib/servidor/atendem-a-vaga.ts) fazem a mesma conta e chegam às mesmas pessoas.

type CurriculoDoTalento = NonNullable<Candidato["curriculo"]>;

/** O que a conta usa de cada talento: onde mora e o currículo. */
export type TalentoParaAderencia = CurriculoDoTalento & {
  perfil_id: string;
  cidade: string | null;
  bairro: string | null;
};

/**
 * Quem entra no "Para a sua vaga", da nota maior para a menor, e quem atende a vaga ("Atende a vaga") e quem só chega
 * perto ("Ver mais gente"). `experiencias`: as do talento com a função de cada uma (na mesma ordem da lista; null fica
 * com as do talento); `diaADia`, `jeitos` e `atividades`: o que a vaga e cada um disseram (sem, a nota segue sem).
 */
export function aderenciasDaVaga<T extends TalentoParaAderencia>(
  vaga: CamposDaVaga,
  lista: T[],
  extras: {
    experiencias?: (CurriculoDoTalento["experiencias"] | null | undefined)[];
    diaADia?: ItemDoJeito[] | null;
    jeitos?: Map<string, EscolhaDoJeito[]>;
    atividades?: Map<string, AtividadesDaVaga>;
  },
  agora: number,
) {
  const requisitos = { ...requisitosDaVaga(vaga), perguntas: [], dia_a_dia: extras.diaADia ?? null };
  // a vaga de entrada (aceita quem está começando) que diz a função: no "Atende a vaga", a função não precisa ser a mesma
  const entrada = perfilDaVaga(requisitos) === "entrada" && dizAFuncao(requisitos);
  const comAderencia = lista
    .map((t, i) => ({
      t,
      a: calcularAderencia(
        requisitos,
        {
          curriculo: {
            escolaridade: t.escolaridade,
            curso: t.curso,
            experiencias: extras.experiencias?.[i] ?? t.experiencias,
            cursos: t.cursos,
            cnh: t.cnh,
            disponibilidade: t.disponibilidade,
            estudos: t.estudos,
            titulo: t.titulo,
            habilidades: t.habilidades,
            jeito: extras.jeitos?.get(t.perfil_id) ?? t.jeito,
          },
          respostas: {},
          cidade: t.cidade,
          bairro: t.bairro,
          atividades: extras.atividades?.get(t.perfil_id) ?? null,
        },
        agora,
      ),
    }))
    .filter(({ a }) => entraEmParaAVaga(a))
    .sort((x, y) => ordemDaNota(y.a) - ordemDaNota(x.a));
  return {
    entrada,
    comAderencia,
    rigidos: comAderencia.filter(({ a }) => atendeAVaga(a)),
    // "Ver mais gente" é só quem fica de fora do "Atende a vaga" (22/11/2026)
    mais: comAderencia.filter(({ a }) => !atendeAVaga(a)),
  };
}
