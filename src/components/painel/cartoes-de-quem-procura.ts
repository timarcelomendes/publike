import { CalendarClock, FileText, Hourglass, MessageCircle, PartyPopper } from "lucide-react";
import type { Conexao } from "@/lib/conexoes";
import { esperaCurriculo, esperaResposta, etapaParaQuemCurtiu, type EtapaCandidato } from "@/lib/constantes";
import { caminhoConversa, type ConversaPessoa } from "@/lib/conversas";
import { minhasProximasEntrevistas, obterMeuCurriculo, obterMeuPerfil } from "@/lib/dados";
import { nomeCurtoDaConta, plural } from "@/lib/formato";
import { dataDaEntrevista } from "@/lib/recrutamento";
import { minhasConexoes } from "@/lib/servidor/conexoes";
import { conversasPorPessoa } from "@/lib/servidor/conversas";
import type { Curriculo, MeuPerfil, MinhaCurtida } from "@/lib/tipos";
import { cartoesDaConta, cartoesDeConexao, conversaDoModo, nomes, talvez } from "./cartoes-hoje";
import type { Cartao } from "./hoje";

// O "Para fazer agora" de quem procura trabalho: fica no alto das Candidaturas (e o Painel conta
// quantos são). Aceites, entrevistas, mensagens, matches parados, conexões, o currículo e as vagas
// curtidas que vão sair do ar.

const DIA = 24 * 3600e3;

export type EntrevistaMinha = Awaited<ReturnType<typeof minhasProximasEntrevistas>>[number];

/** Onde está cada candidatura, em 4 passos: curtiu, aceito, entrevista, contratado. */
export function andamento(c: MinhaCurtida, etapa: EtapaCandidato | null, entrevista: EntrevistaMinha | undefined) {
  if (c.status === "dispensada") return { feitas: 1, atual: false, texto: "Não foi dessa vez", fim: true };
  if (c.status === "desfeito") return { feitas: 1, atual: false, texto: "Match desfeito", fim: true };
  if (etapa === "nao_seguiu") return { feitas: 2, atual: false, texto: "Encerrado", fim: true };
  if (etapa === "contratado") return { feitas: 4, atual: false, texto: "Contratado! Parabéns", fim: false };
  if (entrevista || etapa === "entrevista")
    return {
      feitas: 2,
      atual: true,
      texto: entrevista ? `Entrevista ${dataDaEntrevista(entrevista.quando)}` : "Em entrevista",
      fim: false,
    };
  if (c.status === "match") return { feitas: 2, atual: true, texto: "Deu match: combinem a entrevista", fim: false };
  if (esperaCurriculo(c)) return { feitas: 1, atual: true, texto: "Aceitou você: falta o currículo", fim: false };
  return {
    feitas: 1,
    atual: true,
    texto: etapa === "analise" ? `${c.autor_nome} está analisando` : `Esperando ${c.autor_nome} responder`,
    fim: false,
  };
}

/** A etapa que quem publicou marcou, como quem curtiu vê (só as que valem para o status da curtida). */
export function etapaDaCurtida(
  c: MinhaCurtida,
  etapas: Map<string, { etapa: EtapaCandidato; atualizado_em: string }>,
): EtapaCandidato | null {
  return etapaParaQuemCurtiu(c.tipo, c.status, etapas.get(c.anuncio_id)?.etapa) ?? null;
}

/** Os cartões do "Para fazer agora" de quem procura trabalho, do mais urgente para o menos. */
export function cartoesDeQuemProcura({
  perfil,
  curtidas,
  etapas,
  curriculo,
  entrevistas,
  conversas,
  conexoes,
  agora,
}: {
  perfil: MeuPerfil | null;
  curtidas: MinhaCurtida[] | null;
  etapas: Map<string, { etapa: EtapaCandidato; atualizado_em: string }>;
  /** `{ c: null }`: ainda não tem currículo; null: não deu para ler */
  curriculo: { c: Curriculo | null } | null;
  entrevistas: EntrevistaMinha[];
  conversas: ConversaPessoa[] | null;
  conexoes: Conexao[] | null;
  agora: number;
}): Cartao[] {
  const vagas = (curtidas ?? []).filter((c) => c.tipo === "vaga");
  const aceitas = vagas.filter(esperaCurriculo);
  const tituloDe = new Map(vagas.map((v) => [v.anuncio_id, v]));
  const entrevistaDe = new Map(entrevistas.map((e) => [e.anuncio_id, e]));
  const semCurriculo = curriculo !== null && curriculo.c === null;

  const cartoes: Cartao[] = [];
  if (aceitas.length) {
    cartoes.push({
      icone: PartyPopper,
      tom: "bom",
      quando: "Boa notícia",
      titulo: aceitas.length === 1 ? `${aceitas[0].autor_nome} aceitou você` : `${aceitas.length} vagas aceitaram você`,
      texto: `Em ${nomes(aceitas.map((c) => c.titulo))}. Mande o currículo e o match sai na hora.`,
      href:
        aceitas.length === 1
          ? `/perfil/curriculo?next=${encodeURIComponent(`/anuncio/${aceitas[0].anuncio_id}`)}`
          : "/perfil/curriculo",
      acao: "Mandar meu currículo",
    });
  }
  const paraConfirmar = entrevistas.filter((e) => e.situacao === "marcada");
  for (const e of entrevistas.filter((x) => new Date(x.quando).getTime() <= agora + 3 * DIA).slice(0, 2)) {
    const v = tituloDe.get(e.anuncio_id);
    const confirmar = e.situacao === "marcada";
    cartoes.push({
      icone: CalendarClock,
      tom: confirmar ? "urgente" : "normal",
      quando: dataDaEntrevista(e.quando),
      titulo: `Entrevista${v ? ` para ${v.titulo}` : ""}`,
      texto: confirmar
        ? `${v?.autor_nome ?? "Quem publicou"} marcou: confirme que vai ou peça outro horário.`
        : e.situacao === "remarcar"
          ? "Você pediu outro horário: espere o novo dia."
          : "Confirmada. Chegue uns minutos antes.",
      href: `/anuncio/${e.anuncio_id}`,
      acao: confirmar ? "Confirmar" : "Ver detalhes",
    });
  }
  if (paraConfirmar.length > 2) {
    cartoes.push({
      icone: CalendarClock,
      titulo: `${paraConfirmar.length} entrevistas para confirmar`,
      href: "/painel/curtidas?tipo=vaga&etapa=entrevista",
      acao: "Ver",
    });
  }
  cartoes.push(...cartoesDaConta(perfil, conversas, conversaDoModo.trabalhar));
  // match dos últimos 7 dias parado: ninguém escreveu na conversa depois do match. Quem nunca trocou
  // mensagem já tem o "Mandar um oi" (cartoesDaConta); aqui fica quem já tinha conversado antes (a
  // mensagem da curtida, outra vaga)
  const parados = vagas.filter((c) => {
    if (c.status !== "match" || !c.respondida_em || c.anuncio_status !== "ativo") return false;
    const desde = new Date(c.respondida_em).getTime();
    const etapa = etapaDaCurtida(c, etapas);
    if (agora - desde > 7 * DIA || entrevistaDe.has(c.anuncio_id) || (etapa && etapa !== "analise")) return false;
    const conversa = conversas?.find((x) => x.outro_id === c.autor_id);
    if (!conversa?.ultima_texto) return false;
    return !conversa.ultima_em || new Date(conversa.ultima_em).getTime() < desde;
  });
  if (parados.length) {
    const nome = nomeCurtoDaConta(parados[0].autor_nome, parados[0].autor_tipo);
    cartoes.push({
      icone: MessageCircle,
      tom: "bom",
      quando: "Deu match",
      titulo:
        parados.length === 1 ? `Combine a entrevista com ${nome}` : `${parados.length} matches esperando a conversa`,
      texto:
        parados.length === 1
          ? `Em ${parados[0].titulo}. Mande uma mensagem e combinem o dia e o horário.`
          : `Em ${nomes(parados.map((c) => c.titulo))}. Mande uma mensagem e combinem a entrevista.`,
      href: parados.length === 1 ? caminhoConversa(parados[0].autor_id) : "/painel/conversas",
      acao: "Conversar",
    });
  }
  cartoes.push(...cartoesDeConexao(conexoes));
  if (semCurriculo && aceitas.length === 0) {
    cartoes.push({
      icone: FileText,
      quando: "Currículo",
      titulo: "Monte seu currículo",
      texto: "Leva poucos minutos e mostra o seu % de match em cada vaga.",
      href: "/perfil/curriculo",
      acao: "Montar agora",
    });
  }
  const vencendo = vagas.filter(
    (c) =>
      esperaResposta(c) &&
      c.anuncio_status === "ativo" &&
      new Date(c.expira_em).getTime() - agora < 3 * DIA &&
      new Date(c.expira_em).getTime() > agora,
  );
  if (vencendo.length) {
    cartoes.push({
      icone: Hourglass,
      quando: "Em breve",
      titulo: `${plural(vencendo.length, "vaga que você curtiu sai", "vagas que você curtiu saem")} do ar`,
      texto: `${nomes(vencendo.map((c) => c.titulo))}. Mande uma mensagem pelo anúncio, se tiver.`,
      href: "/painel/curtidas?tipo=vaga&situacao=aguardando",
      acao: "Ver as vagas",
    });
  }
  return cartoes;
}

/**
 * O "Para fazer agora" das Candidaturas: as curtidas e as etapas já vêm da página; aqui, as leituras que
 * faltam (o perfil, o currículo, as entrevistas, as conversas e as conexões).
 */
export async function paraFazerDeQuemProcura(
  curtidas: MinhaCurtida[],
  etapas: Map<string, { etapa: EtapaCandidato; atualizado_em: string }>,
  agora: number,
): Promise<Cartao[]> {
  const [perfil, curriculo, entrevistas, conversas, conexoes] = await Promise.all([
    obterMeuPerfil().catch(() => null),
    // { c: null } = ainda não tem currículo; null = não deu para ler
    talvez(
      obterMeuCurriculo().then((c) => ({ c })),
      "o currículo",
    ),
    minhasProximasEntrevistas(agora).catch(() => []),
    conversasPorPessoa().catch(() => null),
    minhasConexoes().catch(() => null),
  ]);
  return cartoesDeQuemProcura({ perfil, curtidas, etapas, curriculo, entrevistas, conversas, conexoes, agora });
}
