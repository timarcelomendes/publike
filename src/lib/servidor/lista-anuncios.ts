import "server-only";
import { matchComAVaga, type Aderencia, type Candidato } from "@/lib/aderencia";
import { obterMeuCurriculo, obterMeuPerfil, requisitosDasVagas, type DetalhesDaVaga } from "@/lib/dados";
import type { Filtros } from "@/lib/filtros";
import type { Local } from "@/lib/regioes";
import type { AnuncioResumo } from "@/lib/tipos";
import { ganhosDoBanco } from "@/lib/vaga-extra";

// O que a lista de anúncios precisa além da busca (o % de match, os extras do cartão e de onde
// sai o tempo de ônibus). Usado pelo Explorar e pela linha do tempo da home.

/** Para o % de match: o currículo e onde a pessoa mora (sem currículo, nada). */
export async function quemProcura(): Promise<Omit<Candidato, "respostas"> | null> {
  try {
    const [curriculo, perfil] = await Promise.all([obterMeuCurriculo(), obterMeuPerfil()]);
    return curriculo && perfil ? { curriculo, cidade: perfil.cidade, bairro: perfil.bairro } : null;
  } catch {
    return null;
  }
}

/** O que cada vaga da lista pede (para o % de match e o filtro de turno). */
export async function requisitosDaLista(anuncios: AnuncioResumo[]): Promise<Map<string, DetalhesDaVaga>> {
  const ids = anuncios.filter((a) => a.tipo === "vaga").map((a) => a.id);
  if (!ids.length) return new Map();
  // de 100 em 100: a lista da linha pode ter mais de 200 (o endereço da consulta não fica comprido demais)
  const partes: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) partes.push(ids.slice(i, i + 100));
  const vagas = (await Promise.all(partes.map((p) => requisitosDasVagas(p)))).flat();
  return new Map(vagas.map((v) => [v.id, v]));
}

/** A linha de benefícios do cartão (vaga). */
export function extrasDe(v: DetalhesDaVaga | undefined) {
  return v
    ? {
        pedeCurriculo: v.pede_curriculo,
        beneficios: v.beneficios_lista ?? [],
        vagas: v.vagas,
        expiraEm: v.expira_em,
        preenchida: Boolean(v.preenchida_em),
        contatoDireto: Boolean(v.contato_direto),
        ganhos: ganhosDoBanco(v.ganhos_extras),
        resumo: v.descricao ? v.descricao.replace(/\s+/g, " ").trim().slice(0, 220) : null,
      }
    : null;
}

/** O % de match de cada vaga com o currículo de quem busca (as próprias vagas ficam de fora). */
export function matchDasVagas(
  anuncios: AnuncioResumo[],
  requisitos: Map<string, DetalhesDaVaga>,
  quem: Omit<Candidato, "respostas">,
  usuarioId: string,
  agora: number,
): Map<string, Aderencia> {
  const m = new Map<string, Aderencia>();
  for (const a of anuncios) {
    const v = requisitos.get(a.id);
    if (!v || a.autor_id === usuarioId) continue;
    const match = matchComAVaga(v, quem, agora);
    if (match) m.set(a.id, match);
  }
  return m;
}

/** De onde sai o tempo de ônibus dos cards: da casa (CEP) ou do GPS. */
export function origemDoTempo(filtros: Filtros, local: Local | null): "casa" | "voce" | null {
  if (filtros.origem === "gps") return "voce";
  if (filtros.origem === "centro" && local?.ponto) return "casa";
  return null;
}
