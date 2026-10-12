import type { Conteudo } from "../tipos";

export const conteudo: Conteudo = {
  slug: "sine-e-publike",
  titulo: "Sine e Publike: use os dois e ache vaga mais rápido",
  descricao:
    "O Sine cadastra seu currículo, encaminha para entrevistas e cuida do seguro-desemprego. O Publike mostra vagas, diárias e serviços perto de casa. Veja como usar os dois, de graça.",
  tema: "procurar",
  publicado: "2026-10-12",
  blocos: [
    {
      t: "p",
      texto:
        "Quem procura trabalho em Goiânia e região tem mais de um caminho gratuito. E não precisa escolher um só. Pelo contrário: quanto mais lugares você usar, mais vagas você vê. Neste texto, a gente explica o que o **Sine** faz, o que a **Carteira de Trabalho Digital** mostra e como o **Publike** soma a esses dois.",
    },
    {
      t: "p",
      texto:
        "O mercado está a favor. Segundo o **Novo Caged**, do Ministério do Trabalho, Goiás criou **50.529 empregos com carteira** de janeiro a agosto de 2026, e o estado já tem quase **1,6 milhão** de vínculos formais ativos, o maior da série, iniciada em 2020.",
    },
    { t: "numero", valor: "50.529", rotulo: "empregos com carteira criados em Goiás de janeiro a agosto de 2026", fonte: 1 },
    { t: "h2", texto: "O que o Sine faz por você" },
    {
      t: "p",
      texto:
        "O **Sine**, Sistema Nacional de Emprego, tem postos nas prefeituras e no Estado. É um serviço público e gratuito. Lá você pode:",
    },
    {
      t: "lista",
      itens: [
        "**Cadastrar seu currículo** e ficar na lista para as vagas que chegam ao posto.",
        "**Ser encaminhado para entrevista**: o Sine liga você à empresa que pediu candidatos.",
        "**Pedir orientação sobre o seguro-desemprego**, se você foi demitido sem justa causa.",
      ],
    },
    {
      t: "p",
      texto:
        "Para saber onde fica e como funciona o atendimento, procure o Sine da sua cidade. Goiânia, Aparecida de Goiânia e outras cidades da região têm o seu.",
    },
    { t: "h2", texto: "Carteira de Trabalho Digital: o Sine no celular" },
    {
      t: "p",
      texto:
        "O app **Carteira de Trabalho Digital**, do gov.br, mostra o seu histórico de empregos e também vagas do Sine. É útil para conferir se seus contratos foram registrados certinho. E o pedido de seguro-desemprego também pode ser feito pelo gov.br. Se esse é o seu momento, leia [Seguro-desemprego: quem tem direito e como pedir](/conteudos/seguro-desemprego-passo-a-passo).",
    },
    { t: "h2", texto: "Onde entra o Publike" },
    {
      t: "p",
      texto:
        "Muita vaga nunca passa por posto nenhum. É a padaria do bairro que precisa de atendente, a obra que quer um servente para a semana, a família que procura diarista. Essas vagas costumam ficar no boca a boca. O Publike é um aliado gratuito que junta esse tipo de oportunidade num lugar só e **complementa** o que o Sine já faz.",
    },
    {
      t: "lista",
      itens: [
        "**Vagas com carteira, temporárias, diárias e freelances** em Goiânia e região.",
        "**Distância e tempo de ônibus** de casa em cada vaga.",
        "**Vitrine de serviços**: se você é diarista, pedreiro ou eletricista, pode mostrar seu trabalho e receber pedidos.",
        "**Grátis para todos**, sem plano pago e sem taxa.",
      ],
    },
    {
      t: "p",
      texto:
        "Funciona assim: você **curte** a vaga. Quem publicou vê seu perfil e seu currículo e decide se aceita. Se aceitar, dá **match** e a conversa e o WhatsApp aparecem para os dois.",
    },
    {
      t: "chamada",
      titulo: "Veja as vagas do seu bairro",
      texto: "Carteira assinada, diárias e freelances perto de casa, com tempo de ônibus. Grátis.",
      botao: "Ver vagas em Goiânia",
      href: "/vagas/goiania",
    },
    { t: "h2", texto: "Como usar os dois juntos, na prática" },
    {
      t: "lista",
      itens: [
        "**Primeiro passo**: faça o cadastro no Sine da sua cidade e baixe a Carteira de Trabalho Digital.",
        "**No mesmo dia**: preencha o [Meu currículo](/perfil/curriculo) no Publike e informe o CEP ou bairro de casa.",
        "**Todo dia**: olhe as vagas novas no app do gov.br e no Publike. Curta as que combinam com você.",
        "**Enquanto espera**: aceite diárias e freelances para manter a renda. Veja em [vagas e serviços](/?tipo=vaga).",
      ],
    },
    {
      t: "p",
      texto:
        "Uma coisa não atrapalha a outra. Se o Sine te chamar para uma entrevista e o Publike mostrar uma vaga a dez minutos de casa, ótimo: são duas chances.",
    },
    {
      t: "p",
      texto:
        "Uma dica a mais: anote em um caderno ou no celular onde você se candidatou, a data e o nome da empresa. Quando alguém ligar, você sabe de qual vaga se trata e não se perde. Parece bobagem, mas faz diferença quando você está em mais de um cadastro ao mesmo tempo.",
    },
    { t: "h2", texto: "Por que vale a pena se mexer agora" },
    {
      t: "p",
      texto:
        "Pela **PNAD Contínua, do IBGE**, o desemprego em Goiás ficou em **4%** no segundo trimestre de 2026, abaixo da média do Brasil, de 5,4%. Isso quer dizer que as empresas estão procurando gente e, muitas vezes, têm dificuldade de achar. Quem está bem cadastrado em mais de um lugar aparece mais.",
    },
    { t: "numero", valor: "4%", rotulo: "taxa de desemprego em Goiás no 2º trimestre de 2026", fonte: 2 },
    {
      t: "p",
      texto:
        "Quer entender melhor como o Publike soma aos caminhos públicos? Leia [Emprego é trabalho de todos](/conteudos/publike-e-os-caminhos-publicos).",
    },
    {
      t: "chamada",
      titulo: "Monte seu currículo uma vez",
      texto: "Só quem anunciou uma vaga que você curtiu vê seu currículo. Rápido e grátis.",
      botao: "Fazer meu currículo",
      href: "/perfil/curriculo",
    },
  ],
  fontes: [
    {
      titulo: "Goiás gera 50,5 mil empregos formais em oito meses, diz Caged",
      url: "https://www.brasilemfolhas.com.br/2026/10/goias-gera-50-5-mil-empregos-formais-em-oito-meses-diz-caged/",
      data: "01/10/2026",
    },
    {
      titulo: "Goiás fecha segundo trimestre de 2026 com o desemprego abaixo da média nacional (Jornal Opção, dados do IBGE)",
      url: "https://www.jornalopcao.com.br/ultimas-noticias/goias-fecha-segundo-semestre-de-2026-com-o-desemprego-abaixo-da-media-nacional-857917/",
      data: "16/08/2026",
    },
    {
      titulo: "PNAD Contínua Trimestral: desocupação cai em 13 das 27 UFs no 2º trimestre de 2026 (IBGE)",
      url: "https://agenciadenoticias.ibge.gov.br/agencia-sala-de-imprensa/2013-agencia-de-noticias/releases/47774-pnad-continua-trimestral-desocupacao-cai-em-13-das-27-ufs-no-2-trimestre-de-2026",
      data: "14/08/2026",
    },
  ],
};
