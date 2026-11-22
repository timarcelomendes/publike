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

/**
 * Os grupos em que o uso da IA é contado: as funcionalidades com modelo (acima), a transcrição de áudio, a leitura do
 * currículo e as atividades da vaga (as duas com o modelo em Admin › Qualificados).
 */
export type GrupoDoUsoIA = FuncionalidadeIA | "transcricao" | "qualificar" | "atividades";

/**
 * Cada coisa que chama a IA (22/11/2026, Marcelo: "tudo que usa IA precisa ter controle individual e com opções de
 * selecionar o modelo na tela do admin/ia"). Em Admin › IA, cada uma liga e desliga sozinha e pode ter o seu modelo
 * (`config_site.ia_usos`, migração 20270907120000); sem escolha, vale o modelo do grupo (ou do Admin › Qualificados).
 * Cada chamada conta no uso pelo id daqui. A transcrição escolhe entre os modelos de transcrição da OpenAI.
 */
export const USOS_IA = [
  // o chat
  { id: "assistente", grupo: "chat", nome: "Chat do site", ajuda: "O “Tirar dúvidas” e a página /ajuda: responde, procura vagas e empresas." },
  { id: "whatsapp_atendimento", grupo: "chat", nome: "Atendimento no WhatsApp", ajuda: "Entende cada mensagem e decide a resposta." },
  { id: "whatsapp_busca", grupo: "chat", nome: "Busca do WhatsApp", ajuda: "Tira da conversa a função e o lugar que a pessoa procura." },
  // a revisão
  { id: "revisar_anuncio", grupo: "revisao", nome: "Revisar anúncios", ajuda: "Cada anúncio novo ou editado: golpe, cobrança, discriminação." },
  { id: "revisar_avaliacao", grupo: "revisao", nome: "Revisar avaliações", ajuda: "As avaliações das empresas e das pessoas." },
  { id: "revisar_recado", grupo: "revisao", nome: "Revisar recados", ajuda: "Os recados entre quem contrata e quem procura." },
  { id: "revisar_comentario", grupo: "revisao", nome: "Revisar comentários", ajuda: "Os comentários nas vagas." },
  // ler
  { id: "curriculo_arquivo", grupo: "ler", nome: "Currículo do PDF ou da foto", ajuda: "Lê o currículo pronto e preenche o do Publike." },
  { id: "curriculo_fala", grupo: "ler", nome: "Currículo falado", ajuda: "Monta o currículo do que a pessoa contou falando, no site." },
  { id: "curriculo_whatsapp_pergunta", grupo: "ler", nome: "Currículo pelo WhatsApp: a próxima pergunta", ajuda: "Decide o que perguntar a seguir na conversa." },
  { id: "curriculo_whatsapp_funcao", grupo: "ler", nome: "Currículo pelo WhatsApp: perguntas da função", ajuda: "As perguntas de cada função (o que fazia, com o quê)." },
  { id: "curriculo_whatsapp_montar", grupo: "ler", nome: "Currículo pelo WhatsApp: montar", ajuda: "Monta o currículo no fim da conversa." },
  { id: "ler_vagas", grupo: "ler", nome: "Vaga da imagem ou da mensagem", ajuda: "Lê a vaga de uma foto, de um cartaz ou de um texto colado: ao publicar, no WhatsApp e no Admin." },
  { id: "importar_vagas", grupo: "ler", nome: "Importar vagas", ajuda: "Lê várias vagas de uma imagem ou de um texto colado, no Admin (importar)." },
  // textos
  { id: "melhorar_anuncio", grupo: "textos", nome: "Melhorar o anúncio", ajuda: "O “Melhorar com a IA” ao publicar." },
  { id: "melhorar_curriculo", grupo: "textos", nome: "Melhorar o currículo", ajuda: "As sugestões para o currículo ficar melhor." },
  // função
  { id: "funcao_cbo", grupo: "funcao", nome: "Função da CBO", ajuda: "A ocupação de cada vaga e de cada experiência (salário do mercado e o % de combina)." },
  // empresa
  { id: "triagem_criterios", grupo: "empresa", nome: "Critérios da triagem", ajuda: "Monta os critérios da triagem pela vaga." },
  { id: "triagem_leitura", grupo: "empresa", nome: "Triagem: ler cada currículo", ajuda: "Lê o currículo contra os critérios e mostra o trecho que comprova." },
  { id: "resumo_candidato", grupo: "empresa", nome: "Resumo do candidato", ajuda: "Pontos fortes, o que conferir e perguntas para a entrevista." },
  { id: "entrevista_perguntas", grupo: "empresa", nome: "Perguntas da entrevista em vídeo", ajuda: "Sugere as perguntas pela vaga." },
  { id: "entrevista_resumo", grupo: "empresa", nome: "Resumo da entrevista em vídeo", ajuda: "Resume as respostas gravadas." },
  // descobrir
  { id: "descobrir_notas", grupo: "descobrir", nome: "Notas do Descobrir", ajuda: "A ordem das vagas indicadas para quem procura." },
  // admin
  { id: "resumo_painel", grupo: "admin", nome: "Resumo do painel", ajuda: "O resumo da semana, com alertas e sugestões." },
  { id: "agrupar_empresas", grupo: "admin", nome: "Agrupar empresas", ajuda: "Junta as empresas parecidas da base." },
  { id: "conteudos", grupo: "admin", nome: "Conteúdos", ajuda: "Os textos dos conteúdos do site." },
  { id: "materias_receita", grupo: "admin", nome: "Matérias da Receita e do Caged", ajuda: "As matérias dos negócios que abriram e do que mais contratou." },
  { id: "noticias", grupo: "admin", nome: "Notícias", ajuda: "Busca na internet as notícias de emprego da região." },
  // impulso
  { id: "impulso_palavras", grupo: "impulso", nome: "Impulso: palavras-chave", ajuda: "As palavras de cada grupo de anúncios no Google." },
  { id: "impulso_buscas", grupo: "impulso", nome: "Impulso: julgar as buscas", ajuda: "Separa as buscas do Google que servem das que não servem." },
  { id: "impulso_revisar", grupo: "impulso", nome: "Impulso: revisar", ajuda: "Revisa os anúncios e as palavras antes de subir." },
  // Talentos (o modelo padrão fica em Admin › Qualificados)
  { id: "leitura_curriculo", grupo: "qualificar", nome: "Leitura do currículo", ajuda: "As funções indicadas e o resumo dos currículos de Talentos." },
  { id: "atividades_vaga", grupo: "atividades", nome: "Atividades da vaga", ajuda: "Se a pessoa fazia as mesmas atividades da vaga, para o % de combina." },
  // a transcrição (só a OpenAI transcreve)
  { id: "transcricao_curriculo", grupo: "transcricao", nome: "Transcrever o currículo falado", ajuda: "O áudio do currículo falado no site." },
  { id: "transcricao_whatsapp", grupo: "transcricao", nome: "Transcrever áudio do WhatsApp", ajuda: "Os áudios que as pessoas mandam no WhatsApp." },
  { id: "transcricao_entrevista", grupo: "transcricao", nome: "Transcrever a entrevista em vídeo", ajuda: "As respostas gravadas na entrevista em vídeo." },
] as const satisfies readonly { id: string; grupo: GrupoDoUsoIA; nome: string; ajuda: string }[];

export type UsoIA = (typeof USOS_IA)[number]["id"];

/** Os grupos na ordem da tela, com o nome (as funcionalidades e os três de fora). */
export const GRUPOS_DO_USO: { id: GrupoDoUsoIA; nome: string }[] = [
  ...FUNCIONALIDADES_IA.map((f) => ({ id: f.id, nome: f.nome })),
  { id: "qualificar", nome: "Talentos" },
  { id: "atividades", nome: "Atividades da vaga" },
  { id: "transcricao", nome: "Transcrição de áudio" },
];

/** A escolha de um uso guardada no banco: desligado e o modelo próprio (sem modelo, o do grupo). */
export type EscolhaDoUso = { ligado?: boolean; modelo?: string };

/** As escolhas válidas de cada uso, de `config_site.ia_usos` (o que não for um uso conhecido fica de fora). */
export function escolhasDosUsos(bruto: unknown): Partial<Record<UsoIA, EscolhaDoUso>> {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return {};
  const certo: Partial<Record<UsoIA, EscolhaDoUso>> = {};
  for (const u of USOS_IA) {
    const v = (bruto as Record<string, unknown>)[u.id];
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const { ligado, modelo } = v as Record<string, unknown>;
    certo[u.id] = {
      ...(ligado === false ? { ligado: false } : {}),
      ...(typeof modelo === "string" && modelo ? { modelo } : {}),
    };
  }
  return certo;
}

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
