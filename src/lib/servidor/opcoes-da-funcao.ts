import "server-only";
import { buscarOcupacoes, ocupacao, ocupacoesNoTexto, type Ocupacao } from "@/lib/cbo";
import { funcaoPeloTitulo } from "@/lib/funcao-cbo";

// As ocupações da CBO que a IA pode escolher, à parte de ./funcao (21/11/2026): a leitura do currículo
// (./leitura-curriculo) usa sem carregar o robô das vagas e as filas.

/**
 * As opções da IA: as ocupações da CBO que mais parecem com o título e, pelo contexto, também a das regras do
 * título e as que aparecem na descrição (ou no "o que você fazia").
 */
export function opcoesParaIA(titulo: string, descricao: string | null, contexto = false) {
  const vistas = new Set<string>();
  const opcoes: Ocupacao[] = [];
  const regra = contexto ? ocupacao(funcaoPeloTitulo(titulo)?.cbo) : null;
  const doTitulo = buscarOcupacoes(titulo, contexto ? 8 : 10);
  const daDescricao = descricao
    ? contexto
      ? [...ocupacoesNoTexto(descricao, 8), ...buscarOcupacoes(descricao.slice(0, 200), 3)]
      : buscarOcupacoes(descricao.slice(0, 200), 4)
    : [];
  for (const o of [...(regra ? [regra] : []), ...doTitulo, ...daDescricao]) {
    if (vistas.has(o.cbo)) continue;
    vistas.add(o.cbo);
    opcoes.push({ cbo: o.cbo, nome: o.nome, sinonimos: o.sinonimos });
  }
  return opcoes.slice(0, contexto ? 18 : 12);
}
