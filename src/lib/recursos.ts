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
  | "celular";

export type Recurso = { icone: IconeRecurso; titulo: string; texto: string };

export type Perfil = {
  valor: Intencao;
  aba: string;
  resumo: string;
  recursos: Recurso[];
  acao: { texto: string; href: string };
};

export const PERFIS: Perfil[] = [
  {
    valor: "trabalho",
    aba: "Procuro trabalho",
    resumo: "Ache trabalho perto de casa e fale direto com quem contrata.",
    recursos: [
      {
        icone: "mapa",
        titulo: "Vagas perto de casa",
        texto: "No mapa ou em lista, as mais perto aparecem primeiro.",
      },
      {
        icone: "onibus",
        titulo: "Tempo de ônibus",
        texto: "Cada vaga mostra quanto tempo você leva de casa até lá.",
      },
      {
        icone: "maleta",
        titulo: "Carteira, diária ou freelance",
        texto: "Escolha o tipo de trabalho e até onde você topa ir.",
      },
      {
        icone: "descobrir",
        titulo: "Descobrir",
        texto: "Vagas uma por uma: deslize para o lado e curta as que combinam.",
      },
      {
        icone: "coracao",
        titulo: "Curtiu, deu match",
        texto: "Se quem publicou curtir você de volta, o WhatsApp aparece para os dois.",
      },
      {
        icone: "curriculo",
        titulo: "Currículo em minutos",
        texto: "Preencha uma vez. Quem anunciou a vaga que você curtiu vê junto com seu perfil.",
      },
      {
        icone: "etapas",
        titulo: "Saiba em que pé está",
        texto: "Veja a etapa de cada vaga: entrevista, aprovado, contratado.",
      },
      {
        icone: "conversa",
        titulo: "Chat no Publike",
        texto: "Depois do match, combine a entrevista sem sair do site.",
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
    aba: "Contratar alguém",
    resumo: "Publique a vaga de graça e contrate gente que mora perto.",
    recursos: [
      {
        icone: "megafone",
        titulo: "Vaga no ar em minutos",
        texto: "Carteira, temporária, diária ou freelance. Publicar é grátis.",
      },
      {
        icone: "texto",
        titulo: "Ajuda para escrever",
        texto: "O botão “Melhorar texto com IA” deixa o anúncio claro e completo.",
      },
      {
        icone: "mapa",
        titulo: "Quem mora perto vê primeiro",
        texto: "Cada pessoa vê o tempo de ônibus de casa até o trabalho.",
      },
      {
        icone: "pessoas",
        titulo: "Veja quem curtiu",
        texto: "Perfil, currículo e o que cada pessoa faz. Curta de volta quem combina.",
      },
      {
        icone: "planilha",
        titulo: "Etapas e planilha",
        texto: "Marque entrevista, aprovado, contratado. Baixe a lista de candidatos.",
      },
      {
        icone: "conversa",
        titulo: "Chat no Publike",
        texto: "Depois do match, marque a entrevista sem sair do site.",
      },
      {
        icone: "predio",
        titulo: "Empresa ou agência",
        texto: "Do MEI à indústria. Agência e RH publicam com CNPJ, também de graça.",
      },
    ],
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
  return intencao ?? "trabalho";
}
