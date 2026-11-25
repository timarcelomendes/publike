import { CATEGORIAS, REGIMES } from "./constantes";
import { TURNOS } from "./filtros";

// A busca escrita como a pessoa fala (25/11/2026; Marcelo, com o que o mercado já tem: o LinkedIn lançou em português,
// em janeiro, a busca de vagas por frase). "Garçom à noite perto do Setor Bueno" vira a função, o turno e o lugar dos
// filtros de sempre (a IA lê; src/lib/acoes/busca-por-frase.ts). A busca de uma ou duas palavras ("garçom") segue igual.

/** As palavras que mostram que é uma frase, mesmo curta ("garçom à noite"). */
const DE_FRASE =
  /\b(perto|moro|morando|bairro|setor|jardim|vila|regi[aã]o|manh[aã]|tarde|noite|madrugada|fim de semana|s[aá]bado|domingo|sem experi[eê]ncia|primeiro emprego|clt|carteira|est[aá]gio|aprendiz|di[aá]ria|freela|tempor[aá]ri[oa]|come[cç]ar|urgente|hoje|meio per[ií]odo|home office|em casa|que pague|sal[aá]rio)\b/i;

/** É uma frase para a IA ler? (4 palavras ou mais, ou uma das palavras de frase) */
export function pareceFrase(texto: string) {
  const t = texto.replace(/\s+/g, " ").trim();
  if (t.length < 8 || t.length > 200) return false;
  return t.split(" ").length >= 4 || DE_FRASE.test(t);
}

/** O que a IA entendeu, para mostrar acima da lista ("Cozinheira · perto do Jardim América · de manhã"). */
export type BuscaEntendida = {
  q: string;
  categoria: string | null;
  turno: string | null;
  regime: string | null;
  ja: boolean;
  /** o lugar achado no mapa */
  lugar: { nome: string; lat: number; lng: number } | null;
  pertoDeMim: boolean;
  /** as partes do que entendeu, para mostrar */
  partes: string[];
};

/** O que a IA devolve (o esquema de src/lib/acoes/busca-por-frase.ts). */
export type LidoDaFrase = {
  funcao: string;
  categoria: string;
  turno: string;
  regime: string;
  comeca_ja: boolean;
  bairro: string;
  cidade: string;
  perto_de_mim: boolean;
};

/** Os filtros do que a IA leu (só o que vale nas listas), com as partes para mostrar. null: nada para filtrar. */
export function buscaDoLido(lido: Partial<LidoDaFrase>, lugar: BuscaEntendida["lugar"]): BuscaEntendida | null {
  const funcao = String(lido.funcao ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  const categoria = CATEGORIAS.find((c) => c.slug === lido.categoria) ?? null;
  const turno = TURNOS.find((x) => x.valor === lido.turno) ?? null;
  const regime = lido.regime && lido.regime in REGIMES ? (lido.regime as keyof typeof REGIMES) : null;
  const partes = [
    funcao ? funcao.charAt(0).toUpperCase() + funcao.slice(1) : categoria?.nome,
    lugar ? `${lugar.nome} e arredores` : null,
    turno?.curto,
    regime ? REGIMES[regime].nome : null,
    lido.comeca_ja ? "começa já" : null,
  ].filter((x): x is string => Boolean(x));
  if (!partes.length) return null;
  return {
    q: funcao,
    categoria: funcao ? null : (categoria?.slug ?? null),
    turno: turno?.valor ?? null,
    regime,
    ja: Boolean(lido.comeca_ja),
    lugar,
    pertoDeMim: Boolean(lido.perto_de_mim) && !lugar,
    partes,
  };
}
