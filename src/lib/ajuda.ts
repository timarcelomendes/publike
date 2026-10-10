import { CIDADES, LIMITES_CONTA } from "./constantes";

// Página de ajuda (/ajuda) e o que o assistente sabe sobre o Publike.
// Mudou como algo funciona? Mude aqui: a página e o assistente leem daqui.

export type PerguntaAjuda = { p: string; r: string };
export type TemaAjuda = { id: string; titulo: string; perguntas: PerguntaAjuda[] };

export const TEMAS_AJUDA: TemaAjuda[] = [
  {
    id: "comecar",
    titulo: "Começando",
    perguntas: [
      {
        p: "O que é o Publike?",
        r: "Uma ferramenta do povo para gerar emprego em Goiânia e região. Tem vagas com carteira, diárias, freelances e profissionais que prestam serviço, organizados pela distância e pelo tempo de ônibus de casa. Quem precisa publica, quem faz curte. Deu match, vocês conversam pelo WhatsApp.",
      },
      {
        p: "É grátis mesmo?",
        r: "Sim. Publicar, curtir e conversar é de graça para quem procura trabalho, para quem presta serviço e para empresas de qualquer tamanho. Ninguém pode cobrar para você conseguir trabalho, nem pelo Publike nem fora dele.",
      },
      {
        p: "Funciona em quais cidades?",
        r: `Em Goiânia e região: ${CIDADES.join(", ")}.`,
      },
      {
        p: "Como eu entro? Precisa de senha?",
        r: "Não precisa de senha. Toque em Entrar e use um dos jeitos que aparecem na tela: receber um link no e-mail ou entrar com a conta do Google, do Facebook ou do LinkedIn. O link do e-mail funciona uma vez só, por pouco tempo, e pode ser aberto em qualquer navegador ou celular.",
      },
      {
        p: "O link de entrar não chegou. E agora?",
        r: "Confira a caixa de spam e as abas Promoções ou Atualizações. O e-mail vem de nao-responda@publike.org. Se passar alguns minutos, peça outro link na tela de entrar. Se o link disser que venceu ou já foi usado, é só pedir um novo.",
      },
    ],
  },
  {
    id: "procurar",
    titulo: "Para quem procura trabalho",
    perguntas: [
      {
        p: "Como acho vagas perto de mim?",
        r: "Na tela inicial, o Publike pede sua localização e mostra primeiro o que está perto, com um marcador “Você” no mapa. Também dá para tocar em “Onde você mora?” e informar o bairro ou o CEP de casa, ou em “Perto de mim”. Dá para ver em lista, grade, blocos ou no mapa, e filtrar por categoria, tipo de contratação, distância e tempo de ônibus.",
      },
      {
        p: "Para que serve o CEP de casa?",
        r: "Com o CEP de casa, cada vaga mostra a distância e o tempo de ônibus, e dá para buscar só o que fica a até 30 minutos, por exemplo. Ninguém vê seu CEP: guardamos só um ponto arredondado, de uns 300 metros.",
      },
      {
        p: "O que é o Descobrir?",
        r: "É um jeito rápido de ver vagas, uma de cada vez: deslize para o lado para pular ou curtir. As vagas que combinam com o que você procura, no seu bairro, e as que estão em alta aparecem primeiro.",
      },
      {
        p: "Como me candidato a uma vaga?",
        r: "Abra a vaga e toque em Curtir. Quem publicou vê seu perfil e a sua mensagem. Se curtir você de volta, dá match e o WhatsApp dos dois aparece no painel.",
      },
      {
        p: "Quem vê meu currículo?",
        r: "Preencha “Meu currículo” uma vez. Só quem anunciou uma vaga que você curtiu vê o currículo, enquanto a curtida existir. Ele não aparece no seu perfil público nem na busca. Se a vaga pede currículo, o match só acontece depois que você preencher o seu.",
      },
      {
        p: "Presto serviço (diarista, pedreiro, manicure…). Como apareço?",
        r: "Monte sua vitrine em “Meus serviços”: o que você faz, o preço, fotos dos trabalhos e onde atende. Quando alguém quiser contratar, chega um aviso. Aceitou, deu match. Os serviços ficam 90 dias no ar, e salvar de novo renova.",
      },
    ],
  },
  {
    id: "contratar",
    titulo: "Para quem contrata",
    perguntas: [
      {
        p: "Quem pode publicar vaga?",
        r: "Qualquer pessoa, comércio, empresa de qualquer tamanho (do MEI à indústria) ou agência de emprego de Goiânia e região, com um WhatsApp no perfil.",
      },
      {
        p: "Como publico uma vaga?",
        r: `Toque em “Publicar grátis”, escreva o título, a descrição, o tipo de contratação (carteira, temporária, diária ou freelance), o valor e o local. Comércio e empresa podem informar o CEP e o número: o pino fica na porta e quem mora perto vê primeiro, com o tempo de ônibus até aí. Cada conta pode ter até ${LIMITES_CONTA.comum.noAr} anúncios no ar e publicar ${LIMITES_CONTA.comum.porDia} por dia.`,
      },
      {
        p: "Quanto tempo a vaga fica no ar?",
        r: "30 dias, e pode ser renovada de 30 em 30 dias no seu painel. Dá para pausar ou encerrar quando quiser.",
      },
      {
        p: "Como escolho quem contratar?",
        r: "No painel, veja quem curtiu sua vaga, o perfil e o currículo de cada pessoa. Curta de volta quem combina: dá match e o WhatsApp dos dois aparece.",
      },
      {
        p: "Meu endereço aparece?",
        r: "Comércio e empresa podem mostrar o endereço, como uma fachada. Vaga de pessoa física (uma família que procura diarista, por exemplo) e vaga de empresa confidencial mostram só uma área de uns 500 metros, sem endereço.",
      },
      {
        p: "Sou agência de emprego ou RH. Posso usar?",
        r: `Pode, e de graça. Crie a conta como “Agência / RH” e informe o CNPJ. Em cada vaga, diga para qual empresa ela é ou marque “Empresa confidencial”. Depois que a equipe confere o CNPJ, a agência pode ter até ${LIMITES_CONTA.agenciaVerificada.noAr} vagas no ar e publicar ${LIMITES_CONTA.agenciaVerificada.porDia} por dia. A agência não pode cobrar nada de quem se candidata.`,
      },
    ],
  },
  {
    id: "match",
    titulo: "Curtidas, match e conversa",
    perguntas: [
      {
        p: "O que é match?",
        r: "É quando os dois lados topam: você curte uma vaga e quem publicou curte você de volta, ou você pede um serviço e o profissional aceita. Aí o WhatsApp dos dois aparece no painel, em Matches.",
      },
      {
        p: "Por que o telefone não aparece no anúncio?",
        r: "Para evitar golpes e spam. O contato só aparece quando dá match, e só para as duas pessoas.",
      },
      {
        p: "E se eu quiser desistir de um match?",
        r: "Toque em “Desfazer match” no painel ou no anúncio, escolha o motivo e escreva uma justificativa. O WhatsApp some para os dois.",
      },
      {
        p: "Como funcionam as avaliações?",
        r: "Quem contratou um profissional pelo Publike avalia depois do match, com nota de 1 a 5 e um comentário. A nota média aparece a partir de 3 avaliações, e o profissional pode responder uma vez.",
      },
    ],
  },
  {
    id: "seguranca",
    titulo: "Segurança e conta",
    perguntas: [
      {
        p: "Como evito golpes?",
        r: "Ninguém pode cobrar para você conseguir trabalho: nada de taxa de cadastro, curso, uniforme ou exame pago antes de contratar. Desconfie de salário muito acima do normal ou de pressa para fechar negócio. Não mande foto de documento, senha ou códigos que chegam por SMS. Na entrevista, prefira lugares movimentados e avise alguém de confiança.",
      },
      {
        p: "Como denuncio um anúncio?",
        r: "Abra o anúncio e toque em “Denunciar anúncio”. Quem publicou não fica sabendo quem denunciou. Três denúncias tiram o anúncio do ar até a moderação analisar.",
      },
      {
        p: "Como paro de receber e-mails?",
        r: "Em Meu perfil, desmarque a opção de receber avisos por e-mail. Avisos sobre a sua conta (como suspensão) chegam mesmo assim.",
      },
      {
        p: "Como apago minha conta?",
        r: "Abra Meu perfil e toque em Excluir conta, no fim da página. Tudo é apagado na hora: perfil, contato, foto, anúncios, curtidas e matches.",
      },
      {
        p: "Achei um erro ou tenho uma ideia. Onde mando?",
        r: "Na página Sugestões e erros (link no rodapé do site). Qualquer pessoa pode mandar, com ou sem conta: erro, sugestão, elogio ou melhoria.",
      },
    ],
  },
];

/** O conteúdo da ajuda em texto corrido, para o assistente. */
export function textoDaAjuda() {
  return TEMAS_AJUDA.map((t) => `## ${t.titulo}\n${t.perguntas.map((q) => `- ${q.p}\n  ${q.r}`).join("\n")}`).join(
    "\n\n",
  );
}
