import type { ValoresAnuncio } from "@/components/form-anuncio";
import type { AnuncioCompleto, TipoAnuncio } from "@/lib/tipos";

/**
 * O que o formulário de anúncio precisa a partir de um anúncio já publicado.
 * Editar leva o `id`; "Publicar parecida" (copiar) vem sem ele e vira um anúncio novo.
 */
export function valoresDoAnuncio(anuncio: AnuncioCompleto, { copiar = false } = {}): ValoresAnuncio {
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
    vagas: anuncio.vagas,
    pede_curriculo: anuncio.pede_curriculo,
    contratante: anuncio.contratante,
    contratante_confidencial: anuncio.contratante_confidencial,
    pagamento_ate: anuncio.pagamento_ate,
    comissao: anuncio.comissao,
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
