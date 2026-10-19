import type { ValoresAnuncio } from "@/components/form-anuncio";
import type { AnuncioCompleto, TipoAnuncio } from "@/lib/tipos";
import {
  beneficiosAntigos,
  ganhosDoBanco,
  horarioDoBanco,
  juntarTriagem,
  perguntasDoBanco,
  type Triagem,
} from "@/lib/vaga-extra";

/**
 * O que o formulário de anúncio precisa a partir de um anúncio já publicado.
 * Editar leva o `id`; "Publicar parecida" (copiar) vem sem ele e vira um anúncio novo.
 */
export function valoresDoAnuncio(
  anuncio: AnuncioCompleto,
  { copiar = false, triagem = {} }: { copiar?: boolean; triagem?: Triagem } = {},
): ValoresAnuncio {
  return {
    ...(copiar ? {} : { id: anuncio.id }),
    tipo: anuncio.tipo as TipoAnuncio,
    titulo: anuncio.titulo,
    descricao: anuncio.descricao,
    categoria: anuncio.categoria,
    regime: anuncio.regime,
    pagamento_valor: anuncio.pagamento_valor,
    pagamento_unidade: anuncio.pagamento_unidade,
    beneficios: anuncio.beneficios,
    horario: anuncio.horario,
    perguntas: juntarTriagem(perguntasDoBanco(anuncio.perguntas), triagem),
    // vagas de antes tinham "Outros benefícios" escrito à mão: vira a lista
    beneficios_extras: anuncio.beneficios_extras.length
      ? anuncio.beneficios_extras
      : beneficiosAntigos(anuncio.beneficios),
    // vagas de antes tinham o horário escrito à mão: vira a observação
    horario_detalhe:
      horarioDoBanco(anuncio.horario_detalhe) ??
      (anuncio.horario ? { escala: null, dias: [], turnos: [], obs: anuncio.horario.slice(0, 120) } : null),
    vagas: anuncio.vagas,
    pede_curriculo: anuncio.pede_curriculo,
    contato_direto: anuncio.contato_direto,
    prazo_dias: anuncio.prazo_dias,
    contratante: anuncio.contratante,
    contratante_confidencial: anuncio.contratante_confidencial,
    pagamento_ate: anuncio.pagamento_ate,
    comissao: anuncio.comissao,
    // vagas de antes só tinham "Mais comissão": vira o ganho "Comissão"
    ganhos_extras: ganhosDoBanco(anuncio.ganhos_extras, anuncio.comissao),
    beneficios_lista: anuncio.beneficios_lista,
    escolaridade_minima: anuncio.escolaridade_minima,
    experiencia: anuncio.experiencia,
    cnh: anuncio.cnh,
    jornada: anuncio.jornada,
    modelo: anuncio.modelo,
    pcd: anuncio.pcd,
    cidade: anuncio.cidade,
    bairro: anuncio.bairro,
    cep: anuncio.cep,
    endereco: anuncio.endereco,
    lat: anuncio.lat,
    lng: anuncio.lng,
  };
}
