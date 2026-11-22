// As funcionalidades da IA e o apelido dela (claude/plano-ia-por-funcionalidade.md, 05/11/2026), sem nada do
// servidor: servem também às telas. A escolha do modelo de cada uma fica em lib/ia/funcionalidades.ts.

export const FUNCIONALIDADES_IA = [
  { id: "chat", nome: "IA do Publike", ajuda: "O chat com o Publike, para quem procura e para quem contrata, e o atendimento no WhatsApp." },
  { id: "revisao", nome: "Revisão", ajuda: "A moderação automática dos anúncios, das avaliações e dos recados." },
  { id: "ler", nome: "Ler currículo e vaga", ajuda: "O PDF ou a foto do currículo, o currículo montado pelo WhatsApp, a vaga da imagem e a importação." },
  { id: "textos", nome: "Melhorar textos", ajuda: "O “Melhorar com a IA” do currículo e do anúncio." },
  { id: "funcao", nome: "Função da vaga", ajuda: "A ocupação da CBO de cada vaga e de cada experiência dos currículos (salário do mercado e o % de combina)." },
  { id: "empresa", nome: "Triagem e copiloto", ajuda: "A triagem com IA (e os critérios montados pela vaga), o copiloto, o resumo do candidato e a entrevista em vídeo." },
  { id: "descobrir", nome: "Descobrir", ajuda: "As notas das vagas indicadas para quem procura." },
  { id: "admin", nome: "Admin", ajuda: "O resumo do painel, o agrupar empresas, os conteúdos e as matérias da Receita (as notícias têm modelo próprio)." },
  {
    id: "impulso",
    nome: "Impulso",
    ajuda: "As palavras-chave e os grupos de anúncios das vagas impulsionadas no Google.",
  },
] as const;

export type FuncionalidadeIA = (typeof FUNCIONALIDADES_IA)[number]["id"];

/** O apelido limpo: até 20 letras, espaços e hífen; vazio, null. */
export function limparApelido(apelido: string | null | undefined): string | null {
  const a = (apelido ?? "").replace(/\s+/g, " ").trim();
  return a && /^[\p{L}][\p{L} '-]{0,19}$/u.test(a) ? a : null;
}

/**
 * Os jeitos de dizer a IA nas frases, com o apelido ou sem ele. Com apelido, sem artigo (vale para nome de qualquer
 * gênero): "com Ipê", "por Ipê". Sem: "com a IA", "pela IA".
 */
export function falasDaIA(apelido: string | null | undefined) {
  const nome = limparApelido(apelido);
  return nome
    ? {
        nome,
        Nome: nome,
        com: `com ${nome}`,
        por: `por ${nome}`,
        de: `de ${nome}`,
        a: `a ${nome}`,
        // o chat: "o assistente" vira o apelido
        oAssistente: nome,
        OAssistente: nome,
        aoAssistente: `a ${nome}`,
        comOAssistente: `com ${nome}`,
        apelido: nome,
      }
    : {
        nome: "a IA",
        Nome: "A IA",
        com: "com a IA",
        por: "pela IA",
        de: "da IA",
        a: "à IA",
        oAssistente: "o assistente",
        OAssistente: "O assistente",
        aoAssistente: "ao assistente",
        comOAssistente: "com o assistente",
        apelido: null,
      };
}

export type FalasDaIA = ReturnType<typeof falasDaIA>;
