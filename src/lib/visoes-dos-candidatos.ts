import { abaDaEtapa, esperaResposta } from "@/lib/constantes";
import { areaDe, deslocamentoEntreAreas } from "@/lib/regioes";
import type { ItemCaixa } from "@/lib/servidor/caixa";

// As visões de Candidatos (11/11/2026, claude/plano-visoes-dos-candidatos.md), como em Vagas: a Mesa e "Pelo que
// pede você" grátis; o Quadro de todas as vagas, o Mapa de onde moram e a Agenda das entrevistas nos planos, com os
// mesmos 15 dias grátis das visões de Vagas. Tudo sai do que a tela já lê (montarCaixa).

export const VISOES_CANDIDATOS = ["mesa", "prioridade", "quadro", "mapa", "agenda"] as const;
export type VisaoDosCandidatos = (typeof VISOES_CANDIDATOS)[number];
export const VISOES_PAGAS_CANDIDATOS: readonly VisaoDosCandidatos[] = ["quadro", "mapa", "agenda"];
export const COOKIE_VISAO_CANDIDATOS = "publike_visao_candidatos";

export const NOME_DA_VISAO_CANDIDATOS: Record<VisaoDosCandidatos, string> = {
  mesa: "Mesa",
  prioridade: "Pelo que pede você",
  quadro: "Quadro",
  mapa: "Mapa",
  agenda: "Agenda",
};

export function lerVisaoDosCandidatos(v: string | null | undefined): VisaoDosCandidatos {
  return (VISOES_CANDIDATOS as readonly string[]).includes(v ?? "") ? (v as VisaoDosCandidatos) : "mesa";
}

const DIA = 86_400_000;
/** Brasília não tem mais horário de verão: o dia de lá é o UTC menos 3 horas. */
const FUSO = -3 * 3_600_000;

/** O começo do dia (em Brasília) de um instante, em ms UTC. */
export function inicioDoDia(t: number) {
  return Math.floor((t + FUSO) / DIA) * DIA - FUSO;
}

/** A segunda-feira (em Brasília) da semana de um instante. */
export function inicioDaSemana(t: number) {
  const dia = inicioDoDia(t);
  const semana = new Date(dia - FUSO).getUTCDay(); // 0 = domingo
  return dia - ((semana + 6) % 7) * DIA;
}

/** "15h", "9h30" no horário de Brasília. */
export function horaCurta(t: number) {
  const d = new Date(t + FUSO);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

function dias(n: number) {
  return n === 1 ? "1 dia" : `${n} dias`;
}

/** "há 20 horas", "há 2 dias". */
export function haQuanto(iso: string | null | undefined, agora: number) {
  if (!iso) return "";
  const ms = Math.max(0, agora - new Date(iso).getTime());
  if (ms < 3_600_000) return "há menos de 1 hora";
  if (ms < DIA) {
    const h = Math.floor(ms / 3_600_000);
    return h === 1 ? "há 1 hora" : `há ${h} horas`;
  }
  return `há ${dias(Math.floor(ms / DIA))}`;
}

// ———————————————————————————————— Pelo que pede você

export type GrupoDoPedido = "responder" | "logo" | "decidir" | "parado" | "sozinho";

export const GRUPOS_DO_PEDIDO: { valor: GrupoDoPedido; nome: string; vazio?: string }[] = [
  { valor: "responder", nome: "Esperam a sua resposta" },
  { valor: "logo", nome: "Entrevistas hoje e amanhã" },
  { valor: "decidir", nome: "Entrevistados: falta decidir" },
  { valor: "parado", nome: "Parados, sem o próximo passo" },
  { valor: "sozinho", nome: "Andam sozinhos" },
];

/** Em análise há tantos dias sem entrevista: parado. */
export const DIAS_PARADO_EM_ANALISE = 5;

export type PedidoDoCandidato = {
  grupo: GrupoDoPedido;
  /** o porquê, em palavras: "Espera há 2 dias", "Hoje às 15h · confirmou" */
  motivo: string;
  /** pede pressa (texto em terracota) */
  alerta: boolean;
  /** o botão: "Decidir", "Marcar a entrevista"… (vai para a ficha) */
  acao: string | null;
  /** para ordenar dentro do grupo (menor primeiro) */
  ordem: number;
};

/** Em que grupo a pessoa fica e por quê. null: fora do caminho (contratados e quem não seguiu). */
export function pedidoDoCandidato(c: ItemCaixa, agora: number): PedidoDoCandidato | null {
  const aba = abaDaEtapa(c);
  if (aba === "contratados" || aba === "nao_seguiu") return null;
  const desde = new Date(c.curtido_em).getTime();
  if (esperaResposta(c)) {
    return {
      grupo: "responder",
      motivo: `Espera ${haQuanto(c.curtido_em, agora)}`,
      alerta: agora - desde >= DIA,
      acao: null,
      ordem: desde,
    };
  }
  const e = c.entrevista;
  if (e && e.situacao !== "escolher") {
    const t = new Date(e.quando).getTime();
    if (t < agora) {
      return {
        grupo: "decidir",
        motivo: inicioDoDia(t) === inicioDoDia(agora) ? `Entrevista foi hoje às ${horaCurta(t)}` : `Entrevista foi ${haQuanto(e.quando, agora)}`,
        alerta: agora - t >= DIA,
        acao: "Decidir",
        ordem: t,
      };
    }
    const hoje = inicioDoDia(agora);
    if (t < hoje + 2 * DIA) {
      const dia = t < hoje + DIA ? "Hoje" : "Amanhã";
      const situacao =
        e.situacao === "confirmada" ? "confirmou" : e.situacao === "remarcar" ? "pediu para remarcar" : "sem confirmar";
      return {
        grupo: "logo",
        motivo: `${dia} às ${horaCurta(t)} · ${situacao}`,
        alerta: e.situacao !== "confirmada",
        acao: e.situacao === "remarcar" ? "Remarcar" : "Ver a entrevista",
        ordem: t,
      };
    }
    return { grupo: "sozinho", motivo: `Entrevista ${dias(Math.ceil((inicioDoDia(t) - hoje) / DIA))} adiante`, alerta: false, acao: null, ordem: t };
  }
  if (e?.situacao === "escolher")
    return { grupo: "sozinho", motivo: "Escolhendo o horário da entrevista", alerta: false, acao: null, ordem: desde };
  if (c.aceita) return { grupo: "sozinho", motivo: "Aceito: esperando o currículo", alerta: false, acao: null, ordem: desde };
  const etapaDesde = new Date(c.etapa_em ?? c.curtido_em).getTime();
  const parado = Math.floor((agora - etapaDesde) / DIA);
  if (aba === "entrevista")
    return { grupo: "parado", motivo: "Na Entrevista, sem data marcada", alerta: true, acao: "Marcar a entrevista", ordem: etapaDesde };
  if (parado >= DIAS_PARADO_EM_ANALISE)
    return {
      grupo: "parado",
      motivo: `${aba === "analise" ? "Em análise" : "Aceito"} há ${dias(parado)}`,
      alerta: parado >= 2 * DIAS_PARADO_EM_ANALISE,
      acao: "Marcar a entrevista",
      ordem: etapaDesde,
    };
  return {
    grupo: "sozinho",
    motivo: aba === "analise" ? `Em análise há ${dias(parado)}` : `Aceito ${haQuanto(c.curtido_em, agora)}`,
    alerta: false,
    acao: null,
    ordem: etapaDesde,
  };
}

/** Os grupos de "Pelo que pede você", cada um na ordem dele (quem espera há mais tempo primeiro). */
export function agruparPeloPedido(itens: ItemCaixa[], agora: number) {
  const porGrupo = new Map<GrupoDoPedido, { c: ItemCaixa; p: PedidoDoCandidato }[]>();
  for (const c of itens) {
    const p = pedidoDoCandidato(c, agora);
    if (!p) continue;
    porGrupo.set(p.grupo, [...(porGrupo.get(p.grupo) ?? []), { c, p }]);
  }
  return GRUPOS_DO_PEDIDO.map((g) => ({
    ...g,
    pessoas: (porGrupo.get(g.valor) ?? []).sort((a, b) => a.p.ordem - b.p.ordem),
  }));
}

// ———————————————————————————————— Mapa

export type RegiaoNoMapa = {
  chave: string;
  nome: string;
  /** km ao norte e a leste da vaga (entre os centros das regiões) */
  norte: number;
  leste: number;
  km: number;
  pessoas: ItemCaixa[];
};

/** Os candidatos de uma vaga por região, com a distância até a região da vaga; e quem não deu para pôr no mapa. */
export function candidatosNoMapa(itens: ItemCaixa[], vaga: { cidade: string; bairro: string | null }) {
  const regioes = new Map<string, RegiaoNoMapa>();
  const fora: ItemCaixa[] = [];
  for (const c of itens) {
    const d = deslocamentoEntreAreas(vaga, { cidade: c.cidade, bairro: c.bairro });
    if (!d) {
      fora.push(c);
      continue;
    }
    const area = areaDe({ cidade: c.cidade, bairro: c.bairro }, vaga.cidade);
    const r = regioes.get(area.chave) ?? { ...area, ...d, pessoas: [] };
    r.pessoas.push(c);
    regioes.set(area.chave, r);
  }
  const lista = [...regioes.values()].sort((a, b) => a.km - b.km || b.pessoas.length - a.pessoas.length);
  return { regioes: lista, fora, daVaga: areaDe(vaga) };
}

/** Os anéis do mapa (km), até cobrir a região mais longe. */
export function aneisDoMapa(maisLonge: number) {
  const passos = [3, 6, 12, 30, 60, 120];
  const aneis: number[] = [];
  for (const p of passos) {
    aneis.push(p);
    if (p >= maisLonge) break;
  }
  return aneis;
}

/** "~3 km", "na mesma região". */
export function kmEmPalavras(km: number) {
  if (km < 0.5) return "na mesma região";
  return `~${km < 10 ? Math.max(1, Math.round(km)) : Math.round(km / 5) * 5} km`;
}

// ———————————————————————————————— Siglas das vagas (Quadro e Agenda)

/** Duas letras por vaga ("Atendente de loja" → AL), sem repetir. */
export function siglasDasVagas(vagas: { id: string; titulo: string }[]) {
  const usadas = new Set<string>();
  const siglas = new Map<string, string>();
  for (const v of vagas) {
    const palavras = v.titulo
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/\s+/)
      .filter((p) => p.length > 2 || /^[A-Z]/.test(p));
    let s = (palavras.length > 1 ? palavras[0][0] + palavras[1][0] : (palavras[0] ?? "Va").slice(0, 2)).toUpperCase();
    const base = s;
    for (let i = 2; usadas.has(s); i++) s = `${base[0]}${i}`;
    usadas.add(s);
    siglas.set(v.id, s);
  }
  return siglas;
}
