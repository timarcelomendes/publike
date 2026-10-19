import { CIDADES, LIMITES_CONTA } from "./constantes";
import type { TipoConta } from "./tipos";

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
        r: "Sim. Publicar, curtir e conversar é de graça para quem procura trabalho, para quem presta serviço e para empresas de qualquer tamanho. Ninguém pode cobrar para você conseguir trabalho, nem pelo Publike nem fora dele. A página “É grátis”, no rodapé, explica os limites contra spam e como o Publike se mantém.",
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
        r: "Preencha “Meu currículo” uma vez. Quem anunciou uma vaga que você curtiu vê o currículo, enquanto a curtida existir. Se quiser, ligue “Deixar as empresas me encontrarem” no currículo: quem tem vaga na sua cidade vê o currículo sem telefone e sem e-mail, com o nome encurtado, e pode convidar você; o contato só sai se você curtir a vaga e der match. E, se ligar “Aparecer na aba Talentos”, um resumo seu aparece na aba Talentos da busca. Dá para desligar quando quiser. Se a vaga pede currículo, o match sai quando o seu chegar: se aceitarem você antes, chega um aviso para mandar.",
      },
      {
        p: "O que é a aba Talentos?",
        r: "É a vitrine de quem procura trabalho, ao lado das abas Vagas e Serviços. Aparece só quem ligou “Aparecer na aba Talentos” no currículo. Quem visita vê um resumo: o nome encurtado (Maria S.), o bairro, o que a pessoa faz, as habilidades, os cursos e os cargos, sem o nome das empresas. Empresas, comércios e agências que entraram na conta veem o currículo completo e podem convidar para uma vaga. Telefone, e-mail e o PDF ficam escondidos, e a aba fica fora do Google. O contato só sai no match: a empresa convida, você vê a vaga e decide se curte.",
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
        p: "Como acho gente pela aba Talentos?",
        r: "Na busca, toque em Talentos: aparece quem procura trabalho na região e escolheu aparecer, com o que faz, a experiência e as habilidades. Filtre pelo cargo, por uma habilidade ou pela cidade. Entrando com a conta da empresa, comércio ou agência, você abre o currículo completo e convida a pessoa para uma vaga sua no ar. Ela recebe o convite, vê a vaga e decide se curte; o contato aparece no match.",
      },
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
        r: "Você escolhe ao publicar, em “Expiração automática”: 15, 30, 60 ou 90 dias, outro número (até 365) ou “Sem prazo”, em que a vaga fica no ar até você encerrar. Com prazo, dá para renovar no painel. Dá para pausar ou encerrar quando quiser.",
      },
      {
        p: "Preenchi a vaga. E agora?",
        r: "Em Meus anúncios (ou na página da vaga), toque em “Vaga preenchida”. A vaga continua no site com a marcação “Vaga preenchida”, ninguém mais consegue curtir, e quem curtiu e ainda esperava recebe um aviso (quem você contratou não). Mudou de ideia? “Reabrir a vaga”.",
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
      {
        p: "Sou agência: como organizo as vagas por cliente?",
        r: "No painel, em Clientes, cadastre as empresas para quem você seleciona: nome, CNPJ, endereço, quem é o contato lá e anotações. Ao publicar, escolha o cliente: o nome e o endereço já vêm na vaga. Na ficha de cada cliente aparecem as vagas, os candidatos, quem espera resposta e quem foi contratado, e dá para baixar a planilha só dos candidatos daquele cliente. CNPJ, contato e anotações ficam só com você; na vaga aparece só o nome do cliente (ou “Empresa confidencial”, e aí você continua sabendo de quem é a vaga).",
      },
    ],
  },
  {
    id: "match",
    titulo: "Curtidas, match e conversa",
    perguntas: [
      {
        p: "O que é o “Contato direto”?",
        r: "É uma opção de quem publica. Ligada, quem curtir a vaga (ou pedir o serviço) já dá match na hora: os dois veem o WhatsApp e o e-mail um do outro, sem esperar o aceite. Desligada, quem publicou escolhe quem aceita. Anúncios com a opção ligada mostram o selo “Contato direto”. Vaga que pede currículo libera o contato quando o seu currículo chegar.",
      },
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
        r: "Abra o anúncio e toque em “Denunciar anúncio”. Quem publicou não fica sabendo quem denunciou. Algumas denúncias de pessoas diferentes tiram o anúncio do ar até a moderação analisar.",
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

/**
 * Um passo da jornada: o que fazer, por quê e onde (o link leva direto para a tela).
 * `detalhes`: o que aparece na tela, dicas e cuidados, em frases curtas.
 * `imagem`: a tela de verdade, em public/ajuda/<imagem>.webp (capturada no celular).
 */
export type PassoJornada = {
  titulo: string;
  texto: string;
  detalhes?: string[];
  imagem?: string;
  link?: { href: string; texto: string };
};
/** Um caminho dentro do tipo de conta (a pessoa que procura trabalho, a que oferece serviço...). */
export type JornadaAjuda = { id: string; nome: string; resumo: string; passos: PassoJornada[] };
/** O passo a passo de um tipo de conta (o mesmo "Você é" do cadastro). */
export type PerfilAjuda = { tipo: TipoConta; jornadas: JornadaAjuda[] };

const entrar = (tipo: string, extra: string[] = []): PassoJornada => ({
  titulo: "Entre e complete o perfil",
  texto: `Não tem senha. Toque em Entrar, use o e-mail (ou Google, Facebook, LinkedIn) e, no “Você é”, escolha ${tipo}.`,
  detalhes: [
    "O link de entrar chega no e-mail, vale uma vez e por pouco tempo. Não chegou? Veja o spam e peça outro.",
    "No perfil vão o nome, a cidade, o bairro e o WhatsApp. O WhatsApp só aparece no match, para os dois.",
    ...extra,
    "Dá para instalar o Publike como app no celular: “Instalar app”, no topo.",
  ],
  imagem: "perfil",
  link: { href: "/entrar", texto: "Entrar" },
});

const COMO_RECEBER: PassoJornada = {
  titulo: "Escolha como receber os candidatos",
  texto: "No formulário da vaga, decida o que pedir e como o contato é liberado.",
  detalhes: [
    "Pedir currículo: quem curtir é convidado a preencher (estudos, experiências, cursos, CNH). Se você aceitar alguém sem currículo, a pessoa recebe o pedido e o match sai quando ele chegar.",
    "Perguntas: faça perguntas suas (sim ou não, opções ou texto). Marque a resposta esperada para destacar quem combina ou eliminar quem não serve.",
    "Contato direto (no fim do formulário): ligado, quem curtir já vê o seu WhatsApp e você vê o dele. Desligado, você aceita um por um.",
  ],
  imagem: "contato-direto",
};
const INTERESSADOS: PassoJornada = {
  titulo: "Veja os interessados",
  texto: "Cada curtida chega com aviso no sino e por e-mail, e aparece no painel da vaga.",
  detalhes: [
    "Para cada pessoa: perfil, mensagem, currículo, respostas às perguntas e o % de match com a vaga.",
    "Curtir de volta (aceitar) dá match e libera o contato dos dois.",
    "Em Candidatos você vê os interessados de todas as vagas juntos, filtra e baixa a lista numa planilha.",
    "No painel, em Talentos, aparecem pessoas da cidade da vaga que deixaram o currículo à vista das empresas: dá para convidar para a vaga, e a pessoa decide se curte.",
  ],
  imagem: "interessados",
  link: { href: "/painel/candidatos", texto: "Candidatos" },
};
const TALENTOS: PassoJornada = {
  titulo: "Ache gente na aba Talentos",
  texto: "Na busca, a aba Talentos mostra quem procura trabalho na região e escolheu aparecer.",
  detalhes: [
    "Cada pessoa aparece com o que faz, a experiência, as habilidades e o bairro. Filtre pelo cargo, por uma habilidade ou pela cidade.",
    "Entrando com a conta da empresa, abra o currículo completo: onde a pessoa trabalhou, as datas e o que fazia.",
    "“Convidar para a vaga”: a pessoa recebe o convite, vê a vaga e decide se curte. O contato sai no match.",
  ],
  imagem: "talentos",
  link: { href: "/talentos", texto: "Ver os talentos" },
};
const ENTREVISTA: PassoJornada = {
  titulo: "Converse e mude as etapas",
  texto:
    "Deu match, o WhatsApp e o e-mail de vocês aparecem para os dois. Combine pelo WhatsApp ou pelo chat do Publike.",
  detalhes: [
    "Etapas de cada candidato: Novo, Em análise, Entrevista, Contratado ou Não seguiu. A pessoa vê a etapa e recebe aviso.",
    "Dá para marcar a entrevista pelo Publike e anotar o que combinou (a anotação só você vê).",
    "Não deu certo? “Desfazer match” pede o motivo e tira o contato dos dois.",
  ],
  link: { href: "/painel/caixa", texto: "Caixa de entrada" },
};
const RENOVAR: PassoJornada = {
  titulo: "Preencheu? Marque a vaga",
  texto: "Em Meus anúncios, você cuida da vaga quando quiser: preenchida, pausada, renovada ou encerrada.",
  detalhes: [
    "Vaga preenchida: ela continua no site com a marcação, ninguém mais curte, e quem esperava recebe o aviso.",
    "Ao publicar, você escolhe em quantos dias a vaga sai do ar sozinha (15, 30, 60, 90 ou outro) ou “Sem prazo”. Com prazo, dá para renovar.",
    "Pausar: some da busca sem perder os candidatos. Encerrar: tira a vaga do ar.",
    "Publicar parecida: copia uma vaga sua para não começar do zero.",
    `Cada conta tem até ${LIMITES_CONTA.comum.noAr} anúncios no ar e publica até ${LIMITES_CONTA.comum.porDia} por dia.`,
  ],
  imagem: "meus-anuncios",
  link: { href: "/painel/anuncios", texto: "Meus anúncios" },
};
const publicar = (titulo: string, texto: string, extra: string[], imagem = "publicar"): PassoJornada => ({
  titulo,
  texto,
  detalhes: [
    "Obrigatório é pouco: o título, o tipo de contratação, o valor (ou “a combinar”) e o bairro. Sem descrição, o Publike escreve uma simples.",
    ...extra,
    "Use “Melhorar texto com IA” para deixar o anúncio claro e completo, e confira antes de publicar.",
    "Telefone, e-mail ou link no texto não passam: o contato aparece sozinho no match.",
  ],
  imagem,
  link: { href: "/publicar", texto: "Publicar vaga grátis" },
});
const VITRINE: PassoJornada[] = [
  {
    titulo: "Monte a vitrine",
    texto: "Em Meus serviços, escolha o que você faz entre os ofícios da lista (ou “Outro serviço”). Até 8 serviços.",
    detalhes: [
      "Cada serviço tem nome (ex.: “Pedreiro: reboco e contrapiso”), descrição de como você trabalha e preço de referência.",
      "O preço aparece como “a partir de”, por hora, dia, serviço, m² ou visita. Prefere não dizer? Marque “A combinar”.",
      "Fotos dos trabalhos (até 6 por serviço) chamam mais clientes. Nada de telefone, placa de carro ou rosto de cliente nas fotos.",
    ],
    imagem: "servicos",
    link: { href: "/painel/servicos", texto: "Montar a vitrine" },
  },
  {
    titulo: "Diga onde e quando atende",
    texto: "Marque o seu bairro no mapa e escolha as regiões de Goiânia e as cidades que você atende.",
    detalhes: [
      "O mapa mostra só uma área de uns 500 metros, nunca o seu endereço.",
      "Quem mora nas regiões que você atende vê seus serviços primeiro, mesmo longe de você.",
      "Dias e horários são opcionais (ex.: “Seg a sáb, das 7h às 17h”).",
    ],
    imagem: "atende",
  },
  {
    titulo: "Escolha o contato direto",
    texto: "No fim do formulário, decida como os pedidos chegam.",
    detalhes: [
      "Ligado: quem tocar em “Quero contratar” já recebe o seu WhatsApp, e você o dele. Mais rápido.",
      "Desligado: você vê o pedido com a mensagem e escolhe quem aceita.",
      "Vale para todos os seus serviços. Dá para mudar quando quiser.",
    ],
    imagem: "contato-direto-servicos",
  },
  {
    titulo: "Responda e organize os pedidos",
    texto: "Cada pedido chega com aviso e aparece no painel, com a mensagem de quem quer contratar.",
    detalhes: [
      "Etapas de cada cliente: Novo, Orçamento enviado, Agendado, Concluído ou Não seguiu.",
      "Depois do match, combine o serviço, o endereço, o preço e o dia pelo WhatsApp ou pelo chat do Publike.",
    ],
    link: { href: "/painel", texto: "Meu painel" },
  },
  {
    titulo: "Junte avaliações e mantenha no ar",
    texto: "Depois do serviço, quem contratou pode dar nota e comentar. As avaliações aparecem na sua vitrine.",
    detalhes: [
      "Boas notas trazem mais pedidos: quem procura vê a média antes de chamar.",
      "Os serviços ficam 90 dias no ar. Salvar a vitrine de novo renova o prazo.",
    ],
    imagem: "vitrine",
    link: { href: "/painel/avaliacoes", texto: "Minhas avaliações" },
  },
];

/** O caminho de cada tipo de conta no Publike, do começo ao fim (página de ajuda e assistente). */
export const PERFIS_AJUDA: PerfilAjuda[] = [
  {
    tipo: "pessoa",
    jornadas: [
      {
        id: "trabalho",
        nome: "Procuro trabalho",
        resumo: "Ache vaga perto de casa, curta e converse direto com quem contrata. Tudo grátis.",
        passos: [
          entrar("“Pessoa”"),
          {
            titulo: "Diga onde você mora",
            texto: "Com o CEP (ou a localização do celular), as vagas mais perto aparecem primeiro.",
            detalhes: [
              "Cada vaga mostra a distância e o tempo de ônibus da sua casa até o trabalho.",
              "Não sabe o CEP? Use a localização do celular.",
              "O CEP fica só com você: quem publica não vê onde você mora.",
            ],
            imagem: "onde-mora",
            link: { href: "/?casa=1", texto: "Informar onde moro" },
          },
          {
            titulo: "Preencha o currículo",
            texto: "Leva uns 3 minutos e vale para todas as vagas.",
            detalhes: [
              "O que você faz (sua profissão), habilidades, estudos, experiências, cursos e CNH.",
              "Com o currículo, cada vaga mostra o seu % de match: o quanto você combina com o que ela pede.",
              "Vagas que pedem currículo já recebem o seu quando você curte.",
              "Se quiser, deixe o currículo à vista das empresas: elas podem convidar você para uma vaga, sem ver o seu contato.",
            ],
            imagem: "curriculo",
            link: { href: "/perfil/curriculo", texto: "Preencher o currículo" },
          },
          {
            titulo: "Apareça na aba Talentos",
            texto: "No fim do currículo, ligue “Aparecer na aba Talentos”: as empresas acham você na busca.",
            detalhes: [
              "Atalho: “Currículo”, ao lado de “Publicar grátis” no alto da tela (no computador), ou “Cadastrar meu currículo” no alto da aba Talentos.",
              "Quem visita vê um resumo: o nome encurtado, o bairro, o que você faz, as habilidades e os cargos, sem o nome das empresas.",
              "Empresas, comércios e agências que entraram veem o currículo completo e convidam você para uma vaga.",
              "Telefone, e-mail e o PDF ficam escondidos, e a aba fica fora do Google. O contato só sai no match.",
              "Desligou, saiu da aba na hora.",
            ],
            imagem: "talentos-opcao",
            link: { href: "/talentos", texto: "Ver a aba Talentos" },
          },
          {
            titulo: "Procure do seu jeito",
            texto: "Na busca, filtre e veja as vagas em blocos ou no mapa.",
            detalhes: [
              "Filtros: tipo de contratação (carteira, temporária, diária, freelance…), horário, distância ou tempo de ônibus, e a ordem.",
              "No mapa, aproxime numa região: a lista mostra só o que está ali. “Buscar nesta área” procura a partir dali.",
              "Em Descobrir, as vagas vêm uma por uma: deslize para o lado e curta as que combinam.",
            ],
            imagem: "busca",
            link: { href: "/?tipo=vaga", texto: "Ver vagas perto de mim" },
          },
          {
            titulo: "Curta as vagas que combinam",
            texto: "Toque em “Curtir a vaga”. A empresa vê o seu perfil, o currículo e a mensagem.",
            detalhes: [
              "Mensagem opcional, de até 280 letras (ex.: “Tenho 2 anos de experiência e moro perto”). Sem telefone: o contato sai no match.",
              "Se a empresa fez perguntas, responda ali mesmo, antes de curtir.",
              "Vaga com o selo “Contato direto” libera o WhatsApp na hora em que você curte.",
              "Salve vagas para ver depois e siga a empresa ou o bairro para saber das próximas.",
            ],
            imagem: "curtir",
          },
          {
            titulo: "Acompanhe suas curtidas",
            texto: "Em Minhas curtidas você vê o que aconteceu com cada vaga.",
            detalhes: [
              "Etapas: Recebido, Em análise, Entrevista, Contratado ou Encerrado. Chega um aviso a cada mudança.",
              "Se a empresa aceitou e falta o currículo, aparece o pedido: mande e o match sai na hora.",
              "Desistiu? Dá para descurtir enquanto espera resposta.",
            ],
            imagem: "curtidas",
            link: { href: "/painel/curtidas", texto: "Minhas curtidas" },
          },
          {
            titulo: "Deu match: converse",
            texto: "O WhatsApp e o e-mail de vocês aparecem para os dois. Combine a entrevista.",
            detalhes: [
              "Converse pelo WhatsApp ou pelo chat do Publike, sem sair do site.",
              "Ninguém pode cobrar nada para você conseguir trabalho: taxa, curso, uniforme ou exame pago é golpe. Denuncie.",
              "Na entrevista, prefira lugares movimentados e avise alguém de confiança.",
            ],
            imagem: "match",
          },
          {
            titulo: "Receba as vagas novas",
            texto: "Não achou ainda? Deixe o Publike avisar você.",
            detalhes: [
              "Na busca, toque em “Me avise de vagas assim”: chega um aviso quando entrar vaga nova parecida.",
              "Conhece alguém que faria a vaga? “Indicar pelo WhatsApp” manda o link.",
            ],
          },
        ],
      },
      {
        id: "servicos",
        nome: "Ofereço serviços",
        resumo:
          "Diarista, pedreiro, eletricista, manicure: monte sua vitrine grátis e seja chamado por quem mora perto.",
        passos: [entrar("“Pessoa”"), ...VITRINE],
      },
      {
        id: "casa",
        nome: "Contrato para casa",
        resumo: "Uma faxina, um reparo, uma babá: ache um profissional perto ou publique a vaga da sua casa.",
        passos: [
          entrar("“Pessoa”"),
          {
            titulo: "Busque em Serviços",
            texto: "Na busca, escolha Serviços e o que precisa: diarista, pedreiro, eletricista, manicure…",
            detalhes: [
              "Os profissionais que atendem a sua região aparecem primeiro, no mapa ou em lista.",
              "Na vitrine: o que a pessoa faz, fotos dos trabalhos, preço de referência (“a partir de”) e avaliações de quem já contratou.",
            ],
            imagem: "busca-servicos",
            link: { href: "/?tipo=servico", texto: "Ver serviços perto de mim" },
          },
          {
            titulo: "Toque em Quero contratar",
            texto: "Mande uma mensagem curta com o que precisa, o bairro e o melhor dia.",
            detalhes: [
              "Ex.: “Preciso rebocar um muro de 12 metros no Setor Bueno. Pode ser sábado?”",
              "Sem telefone na mensagem: o contato aparece no match.",
              "Profissional com o selo “Contato direto” libera o WhatsApp na hora.",
            ],
            imagem: "quero-contratar",
          },
          {
            titulo: "Ou publique a vaga da casa",
            texto: "Precisa de alguém fixo ou por diária (diarista, babá, cuidador)? Publique a vaga.",
            detalhes: [
              "Para conta Pessoa, a vaga mostra só uma área de uns 500 metros, nunca o seu endereço.",
              "Quem curtir aparece no seu painel, com perfil e currículo. Você escolhe quem aceita.",
            ],
            imagem: "publicar",
            link: { href: "/publicar", texto: "Publicar vaga grátis" },
          },
          {
            titulo: "Combine e acompanhe",
            texto: "Deu match, o WhatsApp de vocês aparece para os dois.",
            detalhes: [
              "Seus pedidos ficam em Minhas curtidas, com a etapa: Orçamento enviado, Agendado, Concluído.",
              "Combine o preço e o dia antes. Não pague adiantado para quem você não conhece.",
            ],
            imagem: "curtidas",
            link: { href: "/painel/curtidas", texto: "Meus pedidos" },
          },
          {
            titulo: "Avalie depois do serviço",
            texto: "Dê uma nota e conte como foi.",
            detalhes: ["Sua avaliação ajuda os vizinhos a escolher e valoriza quem trabalha bem."],
          },
        ],
      },
    ],
  },
  {
    tipo: "comercio",
    jornadas: [
      {
        id: "contratar",
        nome: "Contratar",
        resumo: "Loja, bar, salão, oficina, padaria: ache gente do bairro para trabalhar com você, de graça.",
        passos: [
          entrar("“Comércio”", [
            "Com o CNPJ (opcional), o Publike busca os dados públicos e preenche o nome e o endereço da loja.",
          ]),
          publicar(
            "Publique a vaga com o endereço da loja",
            "Leva dois minutos, e dá para começar por um modelo pronto (atendente, caixa, auxiliar de cozinha…).",
            [
              "Com o CEP e o número, o pino fica na porta da loja: quem mora perto vê primeiro, com o tempo de ônibus até aí.",
              "A próxima vaga já vem com o endereço da última.",
              "Diga o salário (ou faixa), os benefícios, a escala e o horário: vaga completa recebe mais curtidas.",
            ],
          ),
          COMO_RECEBER,
          INTERESSADOS,
          TALENTOS,
          ENTREVISTA,
          RENOVAR,
        ],
      },
      {
        id: "servicos",
        nome: "Mostrar serviços",
        resumo: "Salão, oficina, assistência técnica: mostre o que você faz e receba pedidos de quem mora perto.",
        passos: [entrar("“Comércio”"), ...VITRINE],
      },
    ],
  },
  {
    tipo: "empresa",
    jornadas: [
      {
        id: "contratar",
        nome: "Contratar",
        resumo: "Empresa, indústria, condomínio ou ONG: receba candidatos da região, com currículo e triagem.",
        passos: [
          entrar("“Empresa”", [
            "Com o CNPJ (opcional), o Publike busca os dados públicos e preenche o nome e o endereço.",
          ]),
          publicar(
            "Publique a vaga completa",
            "Quanto mais completa, mais gente certa curte. Vaga com carteira, temporária, estágio, diária ou freelance.",
            [
              "Salário ou faixa, comissão e benefícios (vale-transporte, refeição, plano de saúde…).",
              "Escala e horário, escolaridade, experiência, CNH, modelo de trabalho e vaga PcD.",
              "Com o endereço, quem mora perto vê primeiro, com o tempo de ônibus até a empresa.",
            ],
          ),
          COMO_RECEBER,
          INTERESSADOS,
          TALENTOS,
          ENTREVISTA,
          RENOVAR,
        ],
      },
    ],
  },
  {
    tipo: "agencia",
    jornadas: [
      {
        id: "recrutar",
        nome: "Recrutar para clientes",
        resumo: "Agência de emprego ou RH: publique as vagas dos seus clientes, de graça, com o nome da agência.",
        passos: [
          entrar("“Agência / RH”", [
            "O CNPJ da agência é obrigatório (vale também o CNPJ com letras, o novo da Receita).",
          ]),
          {
            titulo: "Espere a conferência do CNPJ",
            texto: "A equipe do Publike confere o CNPJ e dá o selo de agência verificada.",
            detalhes: [
              `Verificada, a agência pode ter até ${LIMITES_CONTA.agenciaVerificada.noAr} vagas no ar e publicar ${LIMITES_CONTA.agenciaVerificada.porDia} por dia (antes: ${LIMITES_CONTA.comum.noAr} e ${LIMITES_CONTA.comum.porDia}).`,
              "Quem procura vaga pode conferir o CNPJ na Receita: ele aparece no perfil da agência.",
              "Trocar o CNPJ tira o selo até a nova conferência.",
            ],
          },
          {
            titulo: "Cadastre os seus clientes",
            texto: "No painel, em Clientes, guarde as empresas para quem você seleciona.",
            detalhes: [
              "Só o nome é obrigatório. Com o CNPJ, o Publike busca na Receita o nome e o endereço.",
              "O endereço do cliente já vai para as vagas dele. Marque “Vagas confidenciais” para o cliente que não quer aparecer.",
              "Quem é o contato no cliente, o telefone e as anotações ficam só com você.",
              "Ao publicar para uma empresa nova, ela também entra em Clientes.",
            ],
            imagem: "clientes",
            link: { href: "/painel/clientes", texto: "Abrir Clientes" },
          },
          publicar(
            "Publique a vaga do cliente",
            "Em cada vaga, escolha o cliente (ou escreva outra empresa) ou marque “Empresa confidencial”.",
            [
              "A vaga sai com o selo “Vaga de agência” e o nome da agência.",
              "Empresa confidencial: na vaga aparece “Empresa confidencial” e o local vira uma área de uns 500 metros, sem o endereço do cliente. No painel, você continua vendo de quem é a vaga.",
              "Publique as vagas de vários clientes da mesma conta, cada uma com o seu local.",
            ],
            "vaga-agencia",
          ),
          {
            ...COMO_RECEBER,
            detalhes: [
              ...(COMO_RECEBER.detalhes ?? []),
              "Quem você aceita recebe o WhatsApp e o e-mail da agência, nunca os do cliente.",
            ],
          },
          INTERESSADOS,
          TALENTOS,
          {
            titulo: "Acompanhe cada cliente",
            texto: "A ficha do cliente junta as vagas, os candidatos e quem foi contratado.",
            detalhes: [
              "Em Minhas vagas e em Candidatos, o filtro “Cliente” mostra só as vagas e os candidatos de uma empresa.",
              "“Planilha dos candidatos” baixa a lista daquele cliente para mandar a ele (o contato só de quem deu match).",
              "Cliente que parou de contratar? Arquive: ele sai da lista ao publicar e as vagas dele continuam como estão.",
            ],
            imagem: "cliente-ficha",
            link: { href: "/painel/clientes", texto: "Ver os clientes" },
          },
          ENTREVISTA,
          RENOVAR,
          {
            titulo: "Sem cobrar do candidato",
            texto: "A agência não pode cobrar nada de quem se candidata.",
            detalhes: [
              "Nem taxa de cadastro, nem curso, nem exame, nem uniforme.",
              "Vaga que cobra é tirada do ar pela moderação, e a conta pode ser suspensa.",
            ],
          },
        ],
      },
    ],
  },
];

/** O endereço da página de um caminho: /ajuda/caminho/pessoa-trabalho. */
export const idDoCaminho = (tipo: TipoConta, jornada: string) => `${tipo}-${jornada}`;

/** Todos os caminhos, com o tipo de conta (para as páginas /ajuda/caminho/[id]). */
export function todosOsCaminhos() {
  return PERFIS_AJUDA.flatMap((p) =>
    p.jornadas.map((j) => ({ id: idDoCaminho(p.tipo, j.id), tipo: p.tipo, jornada: j })),
  );
}

/** O conteúdo da ajuda em texto corrido, para o assistente. */
export function textoDaAjuda() {
  const temas = TEMAS_AJUDA.map((t) => `## ${t.titulo}\n${t.perguntas.map((q) => `- ${q.p}\n  ${q.r}`).join("\n")}`);
  const jornadas = PERFIS_AJUDA.flatMap((p) =>
    p.jornadas.map(
      (j) =>
        `## Passo a passo (conta ${p.tipo}): ${j.nome}\n${j.passos
          .map((x, i) => {
            const link = x.link ? ` (${x.link.texto}: ${x.link.href})` : "";
            const detalhes = (x.detalhes ?? []).map((d) => `\n   - ${d}`).join("");
            return `${i + 1}. ${x.titulo}: ${x.texto}${link}${detalhes}`;
          })
          .join("\n")}`,
    ),
  );
  return [...temas, ...jornadas].join("\n\n");
}
