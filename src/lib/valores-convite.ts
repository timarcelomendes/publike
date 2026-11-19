// A vaga do convite (lida do anúncio da empresa) no formulário de publicar.

import type { ValoresAnuncio } from "@/components/form-anuncio";
import type { RascunhoConvite } from "./convites";

export function valoresDoConvite(r: RascunhoConvite, base: ValoresAnuncio): ValoresAnuncio {
  return {
    ...base,
    titulo: r.titulo,
    descricao: r.descricao,
    categoria: r.categoria || base.categoria,
    regime: r.regime || base.regime,
    combinar: r.salario == null,
    pagamento_valor: r.salario,
    pagamento_ate: r.salario_ate,
    pagamento_unidade: r.salario != null ? r.unidade || "mes" : base.pagamento_unidade,
    beneficios_lista: r.beneficios,
    vagas: r.quantidade || 1,
    cidade: r.cidade || base.cidade,
    bairro: r.bairro || base.bairro,
    // outro bairro: o ponto do mapa e o endereço de antes não valem mais
    ...(r.bairro && r.bairro !== base.bairro ? { lat: null, lng: null, cep: null, endereco: null } : {}),
    // o resto que a leitura achou (19/11/2026): só o que veio; o que não veio fica como estava
    ...(r.beneficios_extras?.length ? { beneficios_extras: r.beneficios_extras } : {}),
    ...(r.ganhos_extras?.length ? { ganhos_extras: r.ganhos_extras } : {}),
    ...(r.escolaridade_minima ? { escolaridade_minima: r.escolaridade_minima } : {}),
    ...(r.experiencia ? { experiencia: r.experiencia } : {}),
    ...(r.cnh ? { cnh: r.cnh } : {}),
    ...(r.jornada ? { jornada: r.jornada } : {}),
    ...(r.modelo ? { modelo: r.modelo } : {}),
    ...(r.pcd ? { pcd: r.pcd } : {}),
    ...(r.horario_detalhe ? { horario_detalhe: r.horario_detalhe, horario: null } : {}),
    ...(r.comeca_ja ? { comeca_ja: true } : {}),
  };
}
