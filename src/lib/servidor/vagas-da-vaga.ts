import "server-only";
import { funcaoParecida, matchComAVaga, type Aderencia, type Candidato } from "@/lib/aderencia";
import { obterPerfilPublico, requisitosDasVagas, type DetalhesDaVaga } from "@/lib/dados";
import { comFuncaoDasVagas } from "./funcoes-pelo-contexto";
import { distanciaKm } from "@/lib/descobrir";
import { cidadesPerto, outraArea } from "./combinam";
import { anunciosNoAr } from "./paginas-busca";

// As faixas do fim da tela da vaga (claude/plano-carrossel-na-vaga.md, 05/11/2026): as vagas parecidas da região e
// as outras vagas de quem publicou. As da região vêm da lista guardada da home (a mesma para todo mundo, 15 minutos);
// as da empresa, da mesma leitura da página dela. O % só para quem tem currículo, e só nas que aparecem.

/** Quantas vagas cada faixa mostra. */
const ATE = 10;

export type VagaDaFaixa = {
  id: string;
  titulo: string;
  autor: { nome: string; foto: string | null; tipo: string };
  /** quem contrata, na vaga de agência (a confidencial fica de fora) */
  contratante: string | null;
  bairro: string | null;
  cidade: string;
  /** da casa de quem vê (ou desta vaga), quando dá para saber */
  km: number | null;
  tipo: string;
  pagamento_valor: number | null;
  pagamento_unidade: string | null;
  pagamento_ate?: number | null;
  comissao?: boolean;
  beneficios: string | null;
  /** o % de match, sem "Outra área" (aí, sem selo) */
  match: Aderencia | null;
};

/** A vaga desta tela: o que as faixas precisam dela. */
export type VagaDaTela = {
  id: string;
  titulo: string;
  autor_id: string;
  cidade: string;
  lat: number | null;
  lng: number | null;
};

/** Quem vê: o currículo (para o %), a conta (para não mostrar as vagas dela) e de onde contar a distância. */
export type QuemVe = {
  quem: Omit<Candidato, "respostas"> | null;
  usuarioId: string | null;
  ponto: { lat: number; lng: number } | null;
};

/** O % de cada vaga (só com currículo), sem as de outra área. */
async function porcentos(ids: string[], ve: QuemVe, agora: number): Promise<Map<string, Aderencia>> {
  const m = new Map<string, Aderencia>();
  if (!ve.quem || !ids.length) return m;
  const detalhes: DetalhesDaVaga[] = await requisitosDasVagas(ids).catch(() => []);
  for (const v of detalhes) {
    const a = matchComAVaga(v, ve.quem, agora);
    if (a && !outraArea(a)) m.set(v.id, a);
  }
  return m;
}

/**
 * As vagas parecidas: no ar, na mesma praça, da mesma função (a mesma conta do %: a família da CBO que a IA leu das
 * duas e, sem ela, a palavra da função ou a área de trabalho), sem esta e sem as de quem publicou (essas vão na outra faixa) e sem as de quem vê. Primeiro a mesma
 * função, depois a área parecida; em cada uma, o maior % (com currículo) e depois a mais perto.
 */
export async function vagasParecidas(vaga: VagaDaTela, ve: QuemVe, agora: number): Promise<VagaDaFaixa[]> {
  const praca = new Set(cidadesPerto(vaga.cidade));
  const todas = await anunciosNoAr("vaga", vaga.cidade).catch(() => []);
  const origem = ve.ponto ?? (vaga.lat != null && vaga.lng != null ? { lat: vaga.lat, lng: vaga.lng } : null);
  const daPraca = todas.filter(
    (a) => a.id !== vaga.id && a.autor_id !== vaga.autor_id && a.autor_id !== ve.usuarioId && praca.has(a.cidade),
  );
  // a função (CBO) que a IA leu de cada uma (o contexto): a mesma família vale mais que o título parecido
  const comCbo = await comFuncaoDasVagas([{ id: vaga.id }, ...daPraca.map((a) => ({ id: a.id }))]);
  const cboDe = new Map(comCbo.map((x) => [x.id, (x as { cbo?: string | null }).cbo ?? null]));
  const parecidas = daPraca
    .map((a) => ({
      a,
      parecida: funcaoParecida(vaga.titulo, a.titulo, { daVaga: cboDe.get(vaga.id), daOutra: cboDe.get(a.id) }),
      km: origem ? distanciaKm(origem.lat, origem.lng, a.lat, a.lng) : null,
    }))
    .filter((x) => x.parecida > 0);
  if (!parecidas.length) return [];
  // o % só das que podem aparecer: as da mesma função primeiro (até 40, para o % poder reordenar)
  const ordemSemPercento = [...parecidas].sort((x, y) => y.parecida - x.parecida || (x.km ?? 1e9) - (y.km ?? 1e9));
  const candidatas = ordemSemPercento.slice(0, 40);
  const pc = await porcentos(
    candidatas.map((x) => x.a.id),
    ve,
    agora,
  );
  return candidatas
    .sort(
      (x, y) =>
        y.parecida - x.parecida ||
        (pc.get(y.a.id)?.nota ?? -1) - (pc.get(x.a.id)?.nota ?? -1) ||
        (x.km ?? 1e9) - (y.km ?? 1e9),
    )
    .slice(0, ATE)
    .map(({ a, km }) => ({
      id: a.id,
      titulo: a.titulo,
      autor: { nome: a.autor_nome, foto: a.autor_foto, tipo: a.autor_tipo },
      contratante: null,
      bairro: a.bairro,
      cidade: a.cidade,
      km,
      tipo: a.tipo,
      pagamento_valor: a.pagamento_valor,
      pagamento_unidade: a.pagamento_unidade,
      pagamento_ate: a.pagamento_ate,
      comissao: a.comissao,
      beneficios: a.beneficios,
      match: pc.get(a.id) ?? null,
    }));
}

/** As outras vagas no ar de quem publicou (todas as praças), das mais novas para as mais antigas. */
export async function maisVagasDaEmpresa(
  vaga: VagaDaTela,
  ve: QuemVe,
  agora: number,
): Promise<{ vagas: VagaDaFaixa[]; total: number; autor: { nome: string; foto: string | null; tipo: string } } | null> {
  const dados = await obterPerfilPublico(vaga.autor_id, 200).catch(() => null);
  if (!dados) return null;
  const outras = dados.anuncios.filter((a) => a.tipo === "vaga" && a.id !== vaga.id);
  if (!outras.length) return null;
  const autor = { nome: dados.perfil.nome, foto: dados.perfil.foto ?? null, tipo: dados.perfil.tipo };
  const mostradas = outras.slice(0, ATE);
  const pc = await porcentos(
    mostradas.map((a) => a.id),
    ve,
    agora,
  );
  return {
    total: outras.length,
    autor,
    vagas: mostradas.map((a) => ({
      id: a.id,
      titulo: a.titulo,
      autor,
      contratante: a.contratante && !a.contratante_confidencial ? a.contratante : null,
      bairro: a.bairro,
      cidade: a.cidade,
      km: null,
      tipo: a.tipo,
      pagamento_valor: a.pagamento_valor,
      pagamento_unidade: a.pagamento_unidade,
      pagamento_ate: a.pagamento_ate ?? null,
      beneficios: a.beneficios,
      match: pc.get(a.id) ?? null,
    })),
  };
}
