// Manter contato com as empresas que vieram dos convites e já publicaram (19/11/2026; Marcelo: "reforçar para que elas
// publiquem mais vagas, e entender a razão de não ter publicado ainda, de forma simples e objetiva").
//
// Cada empresa tem um motivo para a mensagem de hoje (um só, o mais forte), e a mensagem é curta: a vaga dela, o que
// aconteceu, o pedido de mais vagas e, quando não tem vaga no ar, a pergunta do porquê, com respostas numeradas (a
// empresa responde só com o número). A mensagem sai do WhatsApp da equipe, aberta pelo link, uma de cada vez.

export const MOTIVOS_DA_EMPRESA = [
  { id: "vai_publicar", nome: "Vai publicar" },
  { id: "sem_vaga", nome: "Sem vaga agora" },
  { id: "contratou_fora", nome: "Contratou por outro lugar" },
  { id: "candidatos", nome: "Candidatos não serviram" },
  { id: "dificil", nome: "Achou difícil publicar" },
  { id: "outro", nome: "Outro motivo" },
] as const;
export type MotivoDaEmpresa = (typeof MOTIVOS_DA_EMPRESA)[number]["id"];
export const ehMotivo = (x: unknown): x is MotivoDaEmpresa => MOTIVOS_DA_EMPRESA.some((m) => m.id === x);

/** Por que falar com a empresa hoje. */
export type Situacao =
  /** a vaga está no ar e já tem candidatos: pedir a próxima */
  | "no_ar"
  /** a vaga sai do ar em até 5 dias */
  | "vencendo"
  /** nenhuma vaga no ar: entender por que não publicou de novo */
  | "sem_vaga";

export type EmpresaParaContato = {
  id: string;
  nome: string;
  whatsapp: string | null;
  /** a vaga mais recente */
  vaga: { titulo: string; candidatos: number; no_ar: boolean; expira_em: string | null; criado_em: string } | null;
  publicadas: number;
  no_ar: number;
  contato_em: string | null;
  contato_motivo: MotivoDaEmpresa | null;
};

const DIA = 86_400_000;
/** Depois de um contato, a empresa volta para a lista em 30 dias. */
export const ESPERA_DIAS = 30;

export function situacaoDa(e: EmpresaParaContato, agora: number): Situacao {
  if (!e.no_ar || !e.vaga?.no_ar) return "sem_vaga";
  const fim = e.vaga.expira_em ? new Date(e.vaga.expira_em).getTime() : null;
  return fim && fim - agora <= 5 * DIA ? "vencendo" : "no_ar";
}

/** Falou há menos de 30 dias: fica para depois. */
export const falouHaPouco = (e: Pick<EmpresaParaContato, "contato_em">, agora: number) =>
  Boolean(e.contato_em && agora - new Date(e.contato_em).getTime() < ESPERA_DIAS * DIA);

function sorteio(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}
const escolher = <T,>(semente: string, opcoes: readonly T[]) => opcoes[sorteio(semente) % opcoes.length];

const minuscula = (t: string) => (t === t.toUpperCase() ? t.toLowerCase() : t.charAt(0).toLowerCase() + t.slice(1));
const candidatos = (n: number) => (n === 1 ? "1 candidato" : `${n} candidatos`);

/** A pergunta do porquê, com as respostas numeradas (a mesma ordem dos motivos que a equipe marca). */
const PORQUE =
  "Se tiverem outra vaga aberta, me manda o cargo ou a foto do anúncio que eu publico pra vocês, sem custo. Se não, me conta o motivo, só com o número:\n" +
  "1. Não temos vaga agora\n2. Contratamos por outro lugar\n3. Os candidatos não serviram\n4. Achei difícil publicar\n5. Outro motivo";

/** A resposta numerada da empresa vira o motivo. */
export const MOTIVO_DO_NUMERO: Record<string, MotivoDaEmpresa> = {
  "1": "sem_vaga",
  "2": "contratou_fora",
  "3": "candidatos",
  "4": "dificil",
  "5": "outro",
};

/** A mensagem de hoje para a empresa. */
export function mensagemDeContato(e: EmpresaParaContato, assinatura: string, agora: number) {
  const semente = `${e.id}|${new Date(agora).toISOString().slice(0, 7)}`;
  const quem = assinatura.trim() ? `Aqui é ${assinatura.trim()}, do Publike` : "Aqui é do Publike";
  const oi = `${escolher(semente + "oi", ["Oi, tudo bem?", "Olá, tudo certo?", "Oi, pessoal!"])} ${quem}.`;
  const v = e.vaga;
  const titulo = v ? minuscula(v.titulo) : null;
  const situacao = situacaoDa(e, agora);
  if (situacao === "no_ar" && v)
    return [
      oi,
      v.candidatos > 0
        ? `A vaga de ${titulo} já recebeu ${candidatos(v.candidatos)} no Publike.`
        : `A vaga de ${titulo} está no ar no Publike.`,
      escolher(semente + "mais", [
        "Vocês têm mais alguma vaga aberta? Me manda o cargo ou a foto do anúncio que eu publico pra vocês, sem custo.",
        "Tem outra vaga aberta por aí? É só me mandar o cargo ou a foto do anúncio que eu publico pra vocês, sem custo.",
      ]),
    ].join("\n\n");
  if (situacao === "vencendo" && v)
    return [
      oi,
      `A vaga de ${titulo} sai do ar em poucos dias${v.candidatos > 0 ? ` (recebeu ${candidatos(v.candidatos)})` : ""}. Já contrataram ou querem que eu renove?`,
      "E se tiverem outra vaga aberta, me manda que eu publico também, sem custo.",
    ].join("\n\n");
  return [
    oi,
    v
      ? `A vaga de ${titulo} já saiu do ar${v.candidatos > 0 ? ` (recebeu ${candidatos(v.candidatos)})` : ""}. Conseguiram contratar?`
      : "Vi que vocês ainda não têm vaga no ar com a gente.",
    PORQUE,
  ].join("\n\n");
}

/** O nome da situação, na lista. */
export const NOME_DA_SITUACAO: Record<Situacao, string> = {
  no_ar: "Vaga no ar: pedir a próxima",
  vencendo: "Vaga saindo do ar: renovar ou a próxima",
  sem_vaga: "Sem vaga no ar: entender por quê",
};
