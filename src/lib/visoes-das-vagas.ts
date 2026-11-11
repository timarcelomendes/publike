import { abaDaEtapa, esperaResposta, STATUS_ANUNCIO } from "./constantes";
import { semPrazo } from "./formato";
import { ENTREVISTA_ABERTA } from "./recrutamento";
import type { StatusAnuncio } from "./tipos";

// As visões de Vagas (11/11/2026, claude/plano-visoes-das-vagas.md): a Lista e "Pelo que pede você" (grátis) e o
// Mosaico e a Linha do tempo (nos planos, com 15 dias grátis). Tudo sai do que a tela já lê: as vagas, os candidatos
// (com a hora da curtida e da etapa) e as entrevistas. Aqui só a conta, sem banco, para testar com tsx.

const DIA = 24 * 3600 * 1000;

/** As visões, na ordem do seletor. As duas últimas são dos planos. */
export const VISOES = ["lista", "prioridade", "mosaico", "tempo"] as const;
export type VisaoDasVagas = (typeof VISOES)[number];
export const VISOES_PAGAS: VisaoDasVagas[] = ["mosaico", "tempo"];
export const NOME_DA_VISAO: Record<VisaoDasVagas, string> = {
  lista: "Lista",
  prioridade: "Pelo que pede você",
  mosaico: "Mosaico",
  tempo: "Linha do tempo",
};

/** A visão pedida (ou a guardada); as de antes (Cartões e Linhas) viram a Lista. */
export function lerVisao(v: string | null | undefined): VisaoDasVagas {
  return (VISOES as readonly string[]).includes(v ?? "") ? (v as VisaoDasVagas) : "lista";
}

export type Estado = "ar" | "preenchida" | "pausada" | "fora";

/** O grupo de "Pelo que pede você", na ordem da tela. */
export const GRUPOS = ["pedem", "vencem", "paradas", "preenchidas", "andam", "fora"] as const;
export type Grupo = (typeof GRUPOS)[number];
export const GRUPO: Record<Grupo, { nome: string; ajuda: string }> = {
  pedem: { nome: "Pedem você agora", ajuda: "Gente esperando a sua resposta ou entrevista hoje" },
  vencem: { nome: "Saem do ar esta semana", ajuda: "Renove para não perder quem ainda está chegando" },
  paradas: { nome: "Paradas", ajuda: "Ninguém novo há 5 dias ou mais" },
  preenchidas: { nome: "Preenchidas, ainda no ar", ajuda: "Encerre para parar de receber gente" },
  andam: { nome: "Andam sozinhas", ajuda: "Nada para fazer agora" },
  fora: { nome: "Fora do ar", ajuda: "Encerradas, vencidas ou em análise" },
};

/** O que o botão da vaga faz: um só, com o que ela pede agora. */
export type Acao =
  | { tipo: "responder"; rotulo: string }
  | { tipo: "entrevista"; rotulo: string }
  | { tipo: "renovar"; rotulo: string }
  | { tipo: "divulgar"; rotulo: string }
  | { tipo: "encerrar"; rotulo: string }
  | { tipo: "reativar"; rotulo: string }
  | { tipo: "abrir"; rotulo: string };

type Candidato = {
  anuncio_id: string;
  status: string;
  etapa?: string | null;
  aceita_em?: string | null;
  curtido_em: string;
  etapa_em?: string | null;
};
type Entrevista = { anuncio_id: string; quando: string; situacao: string };

export type EntradaDaVaga = {
  id: string;
  titulo: string;
  status: string;
  criado_em: string;
  expira_em: string;
  atualizado_em?: string | null;
  preenchida_em?: string | null;
  prazo_dias?: number | null;
  /** quantas pessoas a vaga contrata */
  vagas?: number | null;
};

export type ResumoDaVaga = {
  id: string;
  titulo: string;
  status: StatusAnuncio;
  estado: Estado;
  /** "Pausada", "Preenchida", "Encerrada"... (no ar, nada) */
  selo: string | null;
  etapas: { novos: number; analise: number; entrevista: number; contratados: number };
  quantas: number;
  esperam: number;
  /** dias que o mais antigo espera a resposta */
  esperaHa: number | null;
  /** a hora da entrevista de hoje ("15h") */
  entrevistaHoje: string | null;
  /** as entrevistas em aberto e as feitas, para a linha do tempo */
  entrevistas: { quando: string; aberta: boolean }[];
  /** quando contratou cada um (a etapa "Contratado") */
  contratacoes: string[];
  /** dias sem ninguém novo (desde o último ou desde a publicação) */
  diasSemNovo: number;
  /** candidatos por dia, dos últimos 14 dias (o último é hoje) */
  porDia: number[];
  novosNaSemana: number;
  /** dias até sair do ar (null: sem prazo ou fora do ar) */
  venceEm: number | null;
  semPrazo: boolean;
  criadoEm: string;
  expiraEm: string;
  /** a última mudança da vaga: quando pausou ou encerrou */
  mudouEm: string;
  preenchidaEm: string | null;
  prazoDias: number | null;
  grupo: Grupo;
  /** a frase principal: o que a vaga pede agora */
  agora: string;
  alerta: boolean;
  /** a frase de baixo: o prazo ou o porquê */
  detalhe: string;
  acao: Acao;
  /** a sugestão do pago na hora da necessidade (vaga parada: o Convite automático) */
  dica: { texto: string; href: string } | null;
};

const dias = (n: number) => (n === 1 ? "1 dia" : `${n} dias`);
const diaBr = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

function horaBr(iso: string) {
  const [h, m] = new Date(iso)
    .toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
    .split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

/** O resumo de uma vaga para as quatro visões. */
export function resumirVaga(
  v: EntradaDaVaga,
  candidatos: Candidato[],
  entrevistas: Entrevista[],
  agora: number,
): ResumoDaVaga {
  const status = (v.status in STATUS_ANUNCIO ? v.status : "ativo") as StatusAnuncio;
  const daVaga = candidatos.filter((c) => c.anuncio_id === v.id);
  const etapas = { novos: 0, analise: 0, entrevista: 0, contratados: 0 };
  for (const c of daVaga) {
    const aba = abaDaEtapa(c);
    if (aba !== "nao_seguiu") etapas[aba] += 1;
  }
  const esperando = daVaga.filter((c) => esperaResposta({ status: c.status, aceita_em: c.aceita_em ?? null }));
  const maisAntigo = esperando.reduce((m, c) => Math.min(m, new Date(c.curtido_em).getTime()), Infinity);
  const esperaHa = esperando.length ? Math.max(0, Math.floor((agora - maisAntigo) / DIA)) : null;

  const hoje = diaBr(agora);
  const daVagaEntrevistas = entrevistas.filter((e) => e.anuncio_id === v.id && e.situacao !== "cancelada");
  const hojeAbertas = daVagaEntrevistas
    .filter((e) => ENTREVISTA_ABERTA.includes(e.situacao) && e.situacao !== "escolher" && diaBr(new Date(e.quando).getTime()) === hoje)
    .sort((a, b) => a.quando.localeCompare(b.quando));
  const entrevistaHoje = hojeAbertas.length ? horaBr(hojeAbertas[0].quando) : null;

  const curtidas = daVaga.map((c) => new Date(c.curtido_em).getTime());
  const ultimo = curtidas.length ? Math.max(...curtidas) : new Date(v.criado_em).getTime();
  const diasSemNovo = Math.max(0, Math.floor((agora - ultimo) / DIA));
  const porDia = Array.from({ length: 14 }, (_, i) => {
    const d = diaBr(agora - (13 - i) * DIA);
    return curtidas.filter((t) => diaBr(t) === d).length;
  });
  const novosNaSemana = porDia.slice(7).reduce((a, b) => a + b, 0);

  const sem = semPrazo(v.expira_em);
  const noAr = status === "ativo";
  const venceEm = noAr && !sem ? Math.max(0, Math.ceil((new Date(v.expira_em).getTime() - agora) / DIA)) : null;
  const mudouEm = v.atualizado_em ?? v.criado_em;
  const haQuanto = (iso: string) => Math.max(0, Math.floor((agora - new Date(iso).getTime()) / DIA));
  const publicadaHa = haQuanto(v.criado_em);
  const estado: Estado =
    status === "ativo" ? (v.preenchida_em ? "preenchida" : "ar") : status === "pausado" ? "pausada" : "fora";
  const selo =
    estado === "ar" ? null : estado === "preenchida" ? "Preenchida" : (STATUS_ANUNCIO[status]?.nome ?? null);

  const prazoTexto = sem ? "Fica no ar até você encerrar" : venceEm !== null ? (venceEm === 0 ? "Sai do ar hoje" : `Vence em ${dias(venceEm)}`) : "";
  const renovar = `Renovar por ${v.prazo_dias ?? 30} dias`;
  let grupo: Grupo;
  let agoraTexto: string;
  let detalhe: string;
  let alerta = false;
  let acao: Acao;
  let dica: ResumoDaVaga["dica"] = null;

  if (estado === "fora") {
    grupo = "fora";
    const ha = haQuanto(status === "expirado" ? v.expira_em : mudouEm);
    agoraTexto =
      status === "expirado"
        ? `Saiu do ar há ${dias(ha)}`
        : status === "encerrado"
          ? `Encerrada há ${dias(ha)}`
          : (STATUS_ANUNCIO[status]?.ajuda ?? "Fora do ar");
    detalhe = etapas.contratados
      ? `Contratou ${etapas.contratados}`
      : `${daVaga.length} ${daVaga.length === 1 ? "candidato" : "candidatos"}`;
    acao =
      status === "expirado" || status === "encerrado"
        ? { tipo: "renovar", rotulo: renovar }
        : { tipo: "abrir", rotulo: "Abrir a vaga" };
  } else if (esperando.length) {
    grupo = "pedem";
    agoraTexto = esperando.length === 1 ? "1 espera a sua resposta" : `${esperando.length} esperam a sua resposta`;
    detalhe = esperaHa ? `O mais antigo espera há ${dias(esperaHa)}` : "Chegaram hoje";
    alerta = true;
    acao = { tipo: "responder", rotulo: `Responder ${esperando.length}` };
  } else if (entrevistaHoje) {
    grupo = "pedem";
    agoraTexto = `Entrevista hoje às ${entrevistaHoje}`;
    detalhe = hojeAbertas.length > 1 ? `Mais ${hojeAbertas.length - 1} hoje` : prazoTexto;
    acao = { tipo: "entrevista", rotulo: "Ver a entrevista" };
  } else if (estado === "preenchida") {
    grupo = "preenchidas";
    agoraTexto = "Marcada como preenchida";
    detalhe = "Continua no ar, recebendo candidatos";
    acao = { tipo: "encerrar", rotulo: "Encerrar a vaga" };
  } else if (estado === "pausada") {
    grupo = "andam";
    agoraTexto = `Pausada há ${dias(haQuanto(mudouEm))}`;
    detalhe = "Ninguém novo entra enquanto pausada";
    acao = { tipo: "reativar", rotulo: "Voltar ao ar" };
  } else if (venceEm !== null && venceEm <= 5) {
    grupo = "vencem";
    agoraTexto = venceEm === 0 ? "Sai do ar hoje" : `Sai do ar em ${dias(venceEm)}`;
    detalhe = `${daVaga.length} ${daVaga.length === 1 ? "candidato" : "candidatos"}, ${etapas.entrevista} em entrevista`;
    alerta = true;
    acao = { tipo: "renovar", rotulo: renovar };
  } else if (diasSemNovo >= 5 && publicadaHa >= 5) {
    grupo = "paradas";
    agoraTexto = daVaga.length ? `Ninguém novo há ${dias(diasSemNovo)}` : `Ninguém se candidatou em ${dias(publicadaHa)}`;
    detalhe = prazoTexto;
    acao = { tipo: "divulgar", rotulo: "Divulgar" };
    dica = { texto: "O Convite automático chama quem combina", href: "/painel/convites" };
  } else {
    grupo = "andam";
    agoraTexto = novosNaSemana
      ? `${novosNaSemana} ${novosNaSemana === 1 ? "novo" : "novos"} nesta semana`
      : daVaga.length
        ? "Tudo respondido"
        : "Publicada agora há pouco";
    detalhe = prazoTexto;
    acao = { tipo: "abrir", rotulo: "Abrir a vaga" };
  }

  return {
    id: v.id,
    titulo: v.titulo,
    status,
    estado,
    selo,
    etapas,
    quantas: Math.max(1, v.vagas ?? 1),
    esperam: esperando.length,
    esperaHa,
    entrevistaHoje,
    entrevistas: daVagaEntrevistas.map((e) => ({ quando: e.quando, aberta: ENTREVISTA_ABERTA.includes(e.situacao) })),
    contratacoes: daVaga
      .filter((c) => abaDaEtapa(c) === "contratados")
      .map((c) => c.etapa_em ?? c.curtido_em),
    diasSemNovo,
    porDia,
    novosNaSemana,
    venceEm,
    semPrazo: sem,
    criadoEm: v.criado_em,
    expiraEm: v.expira_em,
    mudouEm,
    preenchidaEm: v.preenchida_em ?? null,
    prazoDias: v.prazo_dias ?? null,
    grupo,
    agora: agoraTexto,
    alerta,
    detalhe,
    acao,
    dica,
  };
}

/** "Pede você primeiro": a ordem dos grupos e, dentro, quem espera mais. */
export function ordemPedeVoce(a: ResumoDaVaga, b: ResumoDaVaga) {
  return GRUPOS.indexOf(a.grupo) - GRUPOS.indexOf(b.grupo) || b.esperam - a.esperam || (b.esperaHa ?? 0) - (a.esperaHa ?? 0);
}
