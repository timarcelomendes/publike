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
  };
}
