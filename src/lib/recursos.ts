import type { Intencao } from "./intencao";

// "O que dá para fazer no Publike", por perfil. Usado na home e no Como funciona.
// Frases curtas, do jeito que a pessoa fala; cada item é algo que o site faz hoje.

export type IconeRecurso =
  | "mapa"
  | "onibus"
  | "maleta"
  | "coracao"
  | "curriculo"
  | "etapas"
  | "conversa"
  | "aviso"
  | "descobrir"
  | "ferramenta"
  | "fotos"
  | "estrela"
  | "loja"
  | "renovar"
  | "megafone"
  | "texto"
  | "pessoas"
  | "planilha"
  | "predio"
  | "cadeado"
  | "celular"
  | "microfone"
  | "horario"
  | "video"
  | "teste"
  | "retorno"
  | "automacao"
  | "proposta"
  | "resultados"
  | "comeca"
  | "copiar";

/** `novo`: a tag "Novo" no cartão (tire umas semanas depois que a coisa nasceu). */
export type Recurso = { icone: IconeRecurso; titulo: string; texto: string; novo?: boolean };

export type Perfil = {
  valor: Intencao;
  aba: string;
  resumo: string;
  recursos: Recurso[];
  /** os recursos pagos, à parte (quem contrata): 15 dias grátis para experimentar */
  extras?: { titulo: string; texto: string; recursos: Recurso[] };
  acao: { texto: string; href: string };
};

export const PERFIS: Perfil[] = [
  {
    valor: "trabalho",
    aba: "Procuro trabalho",
    resumo: "Ache trabalho perto de casa, fale direto com quem contrata e saiba sempre em que pé está.",
    recursos: [
      {
        icone: "mapa",
        titulo: "Vagas perto de casa",
        texto: "No mapa ou em lista, as mais perto aparecem primeiro, com o tempo de ônibus até lá.",
      },
      {
        icone: "coracao",
        titulo: "Curtiu, deu match",
        texto: "Curtir é se candidatar. Se quem publicou aceitar, o WhatsApp aparece para os dois.",
      },
      {
        icone: "microfone",
        titulo: "Currículo falando",
        texto: "Conte em voz alta o que você faz e o Publike preenche o currículo. Ou mande o PDF ou a foto.",
        novo: true,
      },
      {
        icone: "horario",
        titulo: "Você escolhe o horário",
        texto: "A empresa oferece horários e você marca a entrevista que cabe no seu dia, com lembrete na véspera.",
        novo: true,
      },
      {
        icone: "video",
        titulo: "Entrevista pelo celular",
        texto: "Algumas empresas pedem respostas em vídeo: você grava pelo celular, na hora que puder.",
        novo: true,
      },
      {
        icone: "teste",
        titulo: "Teste Prático",
        texto: "Mostre que sabe o serviço num teste de 10 minutos pelo celular e saia na frente.",
        novo: true,
      },
      {
        icone: "retorno",
        titulo: "Sempre tem resposta",
        texto: "Se a vaga não seguir com você, o Publike avisa e mostra vagas parecidas perto.",
        novo: true,
      },
      {
        icone: "aviso",
        titulo: "Aviso de vaga nova",
        texto: "Curtiu uma vaga? Avisamos quando aparecer outra parecida perto de você.",
      },
      {
        icone: "comeca",
        titulo: "Começa já",
        texto: "Precisa começar logo? Filtre as vagas que começam já.",
        novo: true,
      },
      {
        icone: "pessoas",
        titulo: "Apareça na aba Talentos",
        texto: "Se quiser, as empresas da região acham o seu currículo e convidam você.",
      },
      {
        icone: "etapas",
        titulo: "Saiba em que pé está",
        texto: "Veja a etapa de cada candidatura: em análise, entrevista, contratado.",
      },
      {
        icone: "conversa",
        titulo: "Chat no Publike",
        texto: "Depois do match, combine tudo sem sair do site.",
      },
    ],
    acao: { texto: "Ver vagas perto de mim", href: "/?tipo=vaga" },
  },
  {
    valor: "contratar_servico",
    aba: "Contratar um serviço",
    resumo: "Diarista, pedreiro, eletricista: profissionais do seu bairro, com fotos e preço.",
    recursos: [
      {
        icone: "ferramenta",
        titulo: "Profissionais do bairro",
        texto: "Quem trabalha perto de você aparece primeiro, no mapa ou em lista.",
      },
      {
        icone: "fotos",
        titulo: "Fotos e preço",
        texto: "Veja trabalhos já feitos e quanto custa antes de chamar.",
      },
      {
        icone: "estrela",
        titulo: "Avaliações de verdade",
        texto: "Notas de quem contratou pelo Publike. Você também avalia depois.",
      },
      {
        icone: "coracao",
        titulo: "Peça para contratar",
        texto: "O profissional aceita, deu match, e o WhatsApp aparece para os dois.",
      },
      {
        icone: "conversa",
        titulo: "Chat no Publike",
        texto: "Combine o dia e o valor sem passar seu número antes.",
      },
      {
        icone: "etapas",
        titulo: "Acompanhe o serviço",
        texto: "Orçamento enviado, agendado, concluído: você vê cada passo.",
      },
    ],
    acao: { texto: "Ver profissionais perto de mim", href: "/?tipo=servico" },
  },
  {
    valor: "oferecer_servico",
    aba: "Ofereço serviços",
    resumo: "Mostre o que você faz e receba pedidos de quem mora perto. De graça.",
    recursos: [
      {
        icone: "loja",
        titulo: "Sua vitrine grátis",
        texto: "O que você faz, o preço, fotos dos trabalhos e os bairros onde atende.",
      },
      {
        icone: "mapa",
        titulo: "Quem mora perto acha você",
        texto: "Você aparece no mapa para clientes do seu bairro.",
      },
      {
        icone: "aviso",
        titulo: "Aviso de cliente",
        texto: "Alguém quer contratar você? Chega um aviso, e você aceita ou não.",
      },
      {
        icone: "etapas",
        titulo: "Organize os pedidos",
        texto: "Marque cada cliente: orçamento enviado, agendado, concluído.",
      },
      {
        icone: "estrela",
        titulo: "Boas notas contam",
        texto: "As avaliações dos clientes aparecem no seu perfil e trazem mais pedidos.",
      },
      {
        icone: "renovar",
        titulo: "No ar por 90 dias",
        texto: "Seus serviços ficam no ar 90 dias. Salvar de novo renova.",
      },
    ],
    acao: { texto: "Montar minha vitrine", href: "/painel/servicos" },
  },
  {
    valor: "contratar_pessoa",
    aba: "Procuro funcionário",
    resumo: "Publique a vaga de graça, contrate gente que mora perto e acompanhe cada candidato até a contratação.",
    recursos: [
      {
        icone: "megafone",
        titulo: "Vaga no ar em minutos",
        texto: "Cole o texto ou mande a foto da vaga e a IA preenche. Publicar é grátis.",
        novo: true,
      },
      {
        icone: "copiar",
        titulo: "Vários cargos de uma vez",
        texto: "Mesmas condições para caixa, repositor e atendente? Uma vaga para cada, num passo só.",
        novo: true,
      },
      {
        icone: "mapa",
        titulo: "Quem mora perto vê primeiro",
        texto: "Cada pessoa vê o tempo de ônibus de casa até o trabalho.",
      },
      {
        icone: "etapas",
        titulo: "Candidatos em etapas",
        texto: "Novos, Em análise, Entrevista e Contratados, com a ficha de cada um e o próximo passo.",
        novo: true,
      },
      {
        icone: "horario",
        titulo: "O candidato escolhe o horário",
        texto: "Ofereça os seus horários livres: o candidato escolhe e os dois recebem lembrete.",
        novo: true,
      },
      {
        icone: "retorno",
        titulo: "Retorno a quem não seguiu",
        texto: "Quem não seguiu recebe o aviso com outras vagas. Sua empresa fica bem falada.",
        novo: true,
      },
      {
        icone: "automacao",
        titulo: "Automações prontas",
        texto: "Recado de recebido, lembrete dos parados, retorno: ligue cada um com um toque.",
        novo: true,
      },
      {
        icone: "proposta",
        titulo: "Proposta e contratação",
        texto: "Mande a proposta pelo Publike e marque a vaga como preenchida quando completar.",
        novo: true,
      },
      {
        icone: "curriculo",
        titulo: "Aba Talentos",
        texto: "Veja quem procura trabalho perto e convide para a sua vaga.",
      },
      {
        icone: "resultados",
        titulo: "Resultados",
        texto: "Quantos se candidataram, quantos você chamou e em quantos dias contratou.",
        novo: true,
      },
      {
        icone: "conversa",
        titulo: "Chat e WhatsApp",
        texto: "Depois do aceite, converse pelo Publike ou chame no WhatsApp com a mensagem pronta.",
      },
      {
        icone: "predio",
        titulo: "Empresa, agência e equipe",
        texto: "Do MEI à indústria. Chame a sua equipe para avaliar os candidatos junto.",
      },
    ],
    extras: {
      titulo: "Para ir mais longe",
      texto:
        "Recursos pagos, para quem contrata muito. Experimente cada um por 15 dias grátis, ou assine todos no Plano Completo.",
      recursos: [
        {
          icone: "texto",
          titulo: "Triagem com IA",
          texto: "A IA lê os currículos contra o que a vaga pede e mostra quem chamar primeiro.",
        },
        {
          icone: "teste",
          titulo: "Teste Prático",
          texto: "Até 3 testes por vaga e os testes da sua empresa. O teste sugerido na vaga é grátis.",
        },
        {
          icone: "video",
          titulo: "Entrevista em vídeo",
          texto: "O candidato grava as respostas e a IA resume. Ou a entrevista ao vivo, sem instalar nada.",
          novo: true,
        },
        {
          icone: "automacao",
          titulo: "Automações personalizadas",
          texto: "Monte as suas regras: quando, para quem e o que o Publike faz sozinho.",
          novo: true,
        },
      ],
    },
    acao: { texto: "Publicar vaga grátis", href: "/publicar" },
  },
];

/** O que vale para todo mundo. */
export const PARA_TODOS: Recurso[] = [
  { icone: "coracao", titulo: "Grátis", texto: "Publicar, curtir e conversar não custa nada." },
  {
    icone: "cadeado",
    titulo: "Seu número protegido",
    texto: "O WhatsApp só aparece quando dá match, e só para os dois.",
  },
  {
    icone: "celular",
    titulo: "Funciona como app",
    texto: "Instale no celular ou no computador e abra direto da tela inicial.",
  },
];

export function perfilDaIntencao(intencao: Intencao | null): Intencao {
  // quem quer aparecer na aba Talentos procura trabalho: a mesma aba de recursos
  return intencao === "talento" ? "trabalho" : (intencao ?? "trabalho");
}
