// O catálogo dos e-mails em Admin › E-mails › Todos (claude/plano-central-de-emails.md): quem recebe e com que
// frequência. O nome, o que dispara e o texto vêm do banco (public.modelos_email); a chave de cada um, de
// privado.regras_email.

export type QuemRecebe = "contrata" | "procura" | "presta" | "todos" | "equipe";

export const GRUPOS_DO_CATALOGO: { id: QuemRecebe; titulo: string; ajuda: string }[] = [
  {
    id: "contrata",
    titulo: "Para quem contrata",
    ajuda: "Empresas, comércios, agências e pessoas que publicaram uma vaga.",
  },
  { id: "procura", titulo: "Para quem procura trabalho", ajuda: "Quem curte vagas e tem currículo." },
  { id: "presta", titulo: "Para quem presta serviço", ajuda: "Quem tem vitrine de serviços." },
  { id: "todos", titulo: "Para todas as contas", ajuda: "Conversas, moderação, avisos da conta e da equipe." },
  { id: "equipe", titulo: "Para a equipe do Publike", ajuda: "Vão para os e-mails de Configurações › Quem recebe." },
];

/** Quem recebe cada e-mail; o primeiro é o grupo em que ele aparece. Sem a chave aqui, entra em "todas as contas". */
const QUEM: Record<string, QuemRecebe[]> = {
  curtida: ["contrata", "presta"],
  match_empresa: ["contrata"],
  respostas_match: ["contrata"],
  matches_sem_contato: ["contrata"],
  lembrete_curtida: ["contrata"],
  parados: ["contrata"],
  proposta_resposta: ["contrata"],
  video_enviado: ["contrata"],
  entrevista_resposta: ["contrata"],
  curriculo_recebido: ["contrata"],
  finalistas: ["contrata"],
  convite_candidato: ["contrata"],
  equipe: ["contrata"],
  talentos_semana: ["contrata"],
  resumo_vagas: ["contrata"],
  talentos_reativar: ["contrata"],
  boas_vindas_empresa: ["contrata"],
  boas_vindas_agencia: ["contrata"],
  convite_empresa: ["contrata"],
  convite_agencia: ["contrata"],
  liberacao: ["contrata"],
  talento_combina: ["contrata"],
  pedido_cliente: ["contrata"],
  busca_talentos: ["contrata"],
  documentos_admissao: ["procura"],
  indicacao: ["procura"],
  indicacao_vaga: ["procura"],
  comentario: ["contrata"],
  comentario_resposta: ["procura", "contrata"],
  conquista_pergunta: ["procura"],
  conquista_confirmar: ["contrata"],
  conquista_parabens: ["procura"],
  match: ["procura", "presta"],
  aceite_curriculo: ["procura"],
  etapa: ["procura"],
  entrevista: ["procura"],
  entrevista_lembrete: ["procura", "contrata"],
  busca: ["procura"],
  candidatura_recebida: ["procura"],
  convite: ["procura"],
  proposta: ["procura"],
  sem_resposta: ["procura"],
  video_pedido: ["procura"],
  dispensada: ["procura"],
  vaga_preenchida: ["procura"],
  vagas_semana: ["procura"],
  boas_vindas_pessoa: ["procura"],
  convite_curriculo: ["procura"],
  seguindo: ["procura"],
  boas_vindas_prestador: ["presta"],
  convite_servicos: ["presta"],
  convite_vitrine: ["presta"],
  avaliacao: ["presta"],
  avaliacao_retida: ["presta"],
  recomendacao: ["presta"],
  contratacao: ["todos"],
  match_desfeito: ["todos"],
  mensagem: ["todos"],
  conexao: ["todos"],
  mensagem_equipe: ["todos"],
  convite_perfil: ["todos"],
  em_analise: ["todos"],
  removido: ["todos"],
  liberado: ["todos"],
  conta_suspensa: ["todos"],
  conta_banida: ["todos"],
  conta_reativada: ["todos"],
  conta_acesso: ["todos"],
  conta_acesso_link: ["todos"],
  convite_convidado: ["contrata"],
};

/** Os que saem na hora, sem a fila: o texto (ou a ação) fica noutra tela. */
export const SAEM_NA_HORA: Record<string, { regra: string; texto?: { href: string; nome: string } }> = {
  conta_acesso: { regra: "Sai na hora pela ficha da conta, sem a fila (o link vale pouco tempo)." },
  conta_acesso_link: { regra: "Sai na hora pela ficha da conta, sem a fila (o link vale pouco tempo)." },
  convite_convidado: {
    regra: "Sai na hora pelo botão de cada convidado em Admin › Convites, sem a fila.",
    texto: { href: "/admin/convites", nome: "Ver em Convites" },
  },
};

const NOME_DO_GRUPO: Record<QuemRecebe, string> = {
  contrata: "quem contrata",
  procura: "quem procura trabalho",
  presta: "quem presta serviço",
  todos: "todas as contas",
  equipe: "a equipe",
};

/** O grupo em que o e-mail aparece e os outros que também recebem. */
export function quemRecebe(chave: string, grupoDoBanco: string): { grupo: QuemRecebe; tambem: string[] } {
  if (grupoDoBanco === "equipe") return { grupo: "equipe", tambem: [] };
  const lista = QUEM[chave] ?? ["todos"];
  return { grupo: lista[0], tambem: lista.slice(1).map((g) => NOME_DO_GRUPO[g]) };
}

export const DIAS_DA_SEMANA = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"] as const;

/** "30 min", "20 h", "2 dias". */
export function textoDoIntervalo(minutos: number) {
  if (minutos % 1440 === 0) return minutos === 1440 ? "1 dia" : `${minutos / 1440} dias`;
  if (minutos % 60 === 0) return `${minutos / 60} h`;
  return `${minutos} min`;
}

/** Os números que valem para todos os e-mails (Admin › E-mails › Todos › Regras gerais). */
export type NumerosDosEmails = { por_dia: number; semana_dia: number; semana_hora: number };

const DA_SEMANA = new Set(["vagas_semana", "talentos_semana", "resumo_vagas", "talentos_reativar"]);
const DE_CONTA = new Set(["conta_suspensa", "conta_banida", "conta_reativada"]);
const DE_MODERACAO = new Set(["em_analise", "removido", "liberado"]);

/** As regras de frequência e de quem recebe que valem para o e-mail, em frases curtas. */
export function regrasDoEmail(
  chave: string,
  grupoDoBanco: string,
  intervalo: number | null,
  numeros: NumerosDosEmails | null,
): string[] {
  if (grupoDoBanco === "equipe") return ["Vai para os e-mails da equipe."];
  if (grupoDoBanco === "sistema") return ["Sai só pelo botão de teste."];
  if (chave === "mensagem_equipe") return ["Sai pela ficha da conta, quando a equipe escreve."];
  if (SAEM_NA_HORA[chave]) return [SAEM_NA_HORA[chave].regra];
  const r: string[] = [];
  if (intervalo) r.push(`No máximo 1 a cada ${textoDoIntervalo(intervalo)} por pessoa.`);
  if (DA_SEMANA.has(chave)) {
    const dia = DIAS_DA_SEMANA[(numeros?.semana_dia ?? 1) - 1] ?? "segunda";
    r.push(
      `${(numeros?.semana_dia ?? 1) >= 6 ? "Todo" : "Toda"} ${dia}, a partir das ${numeros?.semana_hora ?? 9}h, também com a chave de Da semana ligada.`,
    );
  }
  if (DE_CONTA.has(chave)) r.push("Vai mesmo para quem desligou os avisos.");
  else if (DE_MODERACAO.has(chave)) r.push("Fora do limite por dia.");
  else r.push(`Até ${numeros?.por_dia ?? 30} e-mails por dia por pessoa, somando todos.`);
  if (!DE_CONTA.has(chave)) r.push("Respeita o que a pessoa desligou em Avisos.");
  return r;
}
