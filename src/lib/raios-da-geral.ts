// Os raios das vagas impulsionadas na campanha geral (claude/plano-raios-das-vagas-impulsionadas.md; migração
// 20270523120000; 14/11/2026, Marcelo: "todo novo impulso, pega o ponto do estabelecimento e coloca mais verba naquela
// regiao" e "regioes que já possuem um CPC baixo pode ter um lance até menor que 50%"). As regras puras: o plano da
// volta e o lance de cada raio. O robô (src/lib/servidor/raios-da-geral.ts) leva ao Google.

/** Um pacote no ar, com o ponto da vaga. */
export type PacoteComPonto = {
  impulso_id: string;
  anuncio_id: string;
  titulo?: string;
  cliente?: string | null;
  lat: number | string;
  lng: number | string;
};

/** Um raio guardado no banco. */
export type RaioGuardado = {
  impulso_id: string;
  anuncio_id: string;
  lat: number;
  lng: number;
  raio_km: number | string;
  lance: number;
  criterio_id: string | null;
  situacao: "fora" | "ligado" | "tirado";
  vistas?: number | null;
  cliques?: number | null;
  custo?: number | string | null;
  erro?: string | null;
  erro_em?: string | null;
  titulo?: string;
  cliente?: string | null;
};

/** Quantos cliques no raio, em 7 dias, para o lance mudar pela medida (com menos, fica o lance a mais inteiro). */
export const CLIQUES_PARA_MEDIR = 5;
/** O lance só muda no Google quando a diferença passa disso (em pontos), para não mexer à toa todo dia. */
const DIFERENCA_PARA_MUDAR = 5;

/** O mesmo ponto (até uns 100 m): duas vagas do mesmo endereço ficam num raio só. */
export function pontoDoRaio(lat: number | string, lng: number | string) {
  return `${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`;
}

/**
 * O lance a mais de um raio pela medida dos últimos 7 dias. O clique dentro do raio já sai com o lance a mais, então
 * a conta tira o lance de agora antes de comparar com o clique da campanha toda: onde o clique sairia mais barato que
 * na campanha, o lance a mais desce na mesma proporção, até o mínimo; nunca passa do lance a mais escolhido.
 * Sem cliques bastantes no raio (ou na campanha), fica o lance a mais escolhido.
 */
export function lanceDoRaio(p: {
  lance: number;
  minimo: number;
  atual: number;
  cliques: number;
  custo: number;
  cliquesDaCampanha: number;
  custoDaCampanha: number;
}) {
  if (p.cliques < CLIQUES_PARA_MEDIR || p.cliquesDaCampanha < CLIQUES_PARA_MEDIR || p.custoDaCampanha <= 0) return p.lance;
  const cliqueDoRaio = p.custo / p.cliques / (1 + p.atual / 100);
  const cliqueDaCampanha = p.custoDaCampanha / p.cliquesDaCampanha;
  const proporcao = Math.min(1, cliqueDoRaio / cliqueDaCampanha);
  return Math.max(p.minimo, Math.min(p.lance, Math.round(p.lance * proporcao)));
}

/** Se o lance novo muda o do Google (a diferença passa de 5 pontos, ou chegou ao mínimo ou ao máximo). */
export function lanceMudou(atual: number, novo: number, p: { lance: number; minimo: number }) {
  return novo !== atual && (Math.abs(novo - atual) >= DIFERENCA_PARA_MUDAR || novo === p.minimo || novo === p.lance);
}

/**
 * O plano da volta: os pacotes que ainda não têm raio (num ponto que já tem raio ligado, usam o mesmo critério) e os
 * raios cujo pacote acabou (o critério só sai do Google quando nenhum outro pacote no ar usa o mesmo).
 */
export function planoDosRaios(ligados: boolean, pacotes: PacoteComPonto[], raios: RaioGuardado[]) {
  const querem = ligados ? pacotes : [];
  const noAr = new Set(querem.map((p) => p.impulso_id));
  const ativos = raios.filter((r) => r.situacao === "ligado");
  const comRaio = new Set(ativos.map((r) => r.impulso_id));
  const sair = ativos.filter((r) => !noAr.has(r.impulso_id));
  const ficam = ativos.filter((r) => noAr.has(r.impulso_id));
  // o critério de cada ponto que fica no ar
  const porPonto = new Map(ficam.filter((r) => r.criterio_id).map((r) => [pontoDoRaio(r.lat, r.lng), r.criterio_id!]));
  const usados = new Set(ficam.map((r) => r.criterio_id).filter(Boolean));
  return {
    criar: querem
      .filter((p) => !comRaio.has(p.impulso_id))
      .map((p) => ({ ...p, criterio_id: porPonto.get(pontoDoRaio(p.lat, p.lng)) ?? null })),
    tirar: sair.map((r) => ({ ...r, tirarDoGoogle: Boolean(r.criterio_id) && !usados.has(r.criterio_id) })),
  };
}
