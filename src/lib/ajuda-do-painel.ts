// O "?" de cada página do painel de quem contrata (empresa, comércio e agência): o que a página faz e as dicas para
// usar bem (pedido do Marcelo, 10/11/2026). A página inteira de ajuda continua em /ajuda (src/lib/ajuda.ts).
// Mudou como uma página funciona? Mude o texto dela aqui.

export type AjudaDaPagina = {
  titulo: string;
  texto: string;
  dicas: string[];
  /** a mesma página na agência, quando muda (o resto vale para todos) */
  agencia?: { texto?: string; dicas?: string[] };
};

type Regra = { caminho: RegExp; ajuda: AjudaDaPagina };

const REGRAS: Regra[] = [
  {
    caminho: /^\/painel\/?$/,
    ajuda: {
      titulo: "Hoje",
      texto: "O resumo do dia: o que pede a sua ação agora, como candidatos esperando resposta e vagas que vencem.",
      dicas: [
        "Comece pelo que está em destaque: é o que mais atrasa a contratação.",
        "Responder rápido faz o candidato não desistir. Quem responde no mesmo dia contrata antes.",
        "Toque em cada número para abrir a lista já filtrada.",
      ],
      agencia: {
        texto:
          "O resumo do dia da agência: pedidos dos clientes, candidatos esperando, finalistas prontos para mandar e o que falta receber.",
      },
    },
  },
  {
    caminho: /^\/painel\/anuncios/,
    ajuda: {
      titulo: "Vagas",
      texto: "Todas as suas vagas: no ar, pausadas e encerradas. Daqui você edita, pausa, renova e marca como preenchida.",
      dicas: [
        "Contratou? Marque “Vaga preenchida”: quem curtiu recebe o aviso e a vaga sai das buscas.",
        "Vaga com o endereço e o salário certos recebe mais candidatos de perto.",
        "Até 20 vagas no ar de graça. Para mais, com um plano: veja em Planos.",
      ],
      agencia: {
        dicas: [
          "Publique cada vaga no nome do cliente ou como “Empresa confidencial”.",
          "Contratou? Marque “Vaga preenchida”: quem curtiu recebe o aviso e a vaga sai das buscas.",
          "Agência com o CNPJ conferido pela equipe pode ter até 200 vagas no ar.",
        ],
      },
    },
  },
  {
    caminho: /^\/painel\/caixa/,
    ajuda: {
      titulo: "Candidatos",
      texto:
        "Quem curtiu as suas vagas, por etapa: novos, em análise, entrevista e contratados. À esquerda a lista; à direita a ficha de quem está aberto.",
      dicas: [
        "Curtiu de volta, deu match: o chat do Publike já faz as primeiras perguntas e o WhatsApp aparece para os dois.",
        "Leve cada pessoa para a etapa certa: assim nada fica esquecido e o candidato sabe em que pé está.",
        "A nota de aderência mostra o porquê de cada item. Aceita quem está começando? Marque “Aceita sem experiência” na vaga: o primeiro emprego não perde pontos.",
        "As anotações da ficha são só suas: o candidato não vê.",
      ],
    },
  },
  {
    caminho: /^\/painel\/candidatos/,
    ajuda: {
      titulo: "Lista e planilha",
      texto: "Todos os candidatos de todas as vagas numa lista, para filtrar e baixar em planilha.",
      dicas: ["Use os filtros para achar alguém de uma vaga antiga.", "A planilha abre no Excel ou no Google Planilhas."],
    },
  },
  {
    caminho: /^\/painel\/anuncio\/[^/]+\/quadro/,
    ajuda: {
      titulo: "Quadro da vaga",
      texto:
        "Os candidatos desta vaga em colunas, por etapa. Arraste ou use os botões da ficha para mudar de etapa, e veja o currículo, as respostas e a distância de cada um.",
      dicas: [
        "“Resumo da IA” lê o currículo contra o que a vaga pede e diz o que conferir na entrevista.",
        "Separe os melhores como finalistas para mandar a quem decide.",
        "O Teste Prático e a Entrevista em vídeo ficam na aba Avaliar da vaga.",
      ],
      agencia: {
        dicas: [
          "“Resumo da IA” lê o currículo contra o que a vaga pede e diz o que conferir na entrevista.",
          "Separe os melhores como finalistas e mande ao cliente pelo link, sem o contato deles.",
          "O Teste Prático e a Entrevista em vídeo ficam na aba Avaliar da vaga.",
        ],
      },
    },
  },
  {
    caminho: /^\/painel\/anuncio\/[^/]+\/finalistas/,
    ajuda: {
      titulo: "Finalistas da vaga",
      texto:
        "A lista curta para quem decide: o dono, o gestor ou o sócio abre pelo link, sem conta, vê o currículo e o seu parecer (sem o contato) e responde cada um.",
      dicas: [
        "Escreva o parecer de cada finalista: é o que mais ajuda quem decide.",
        "A resposta “Quero entrevistar” ou “Não seguir” chega aqui e no sino.",
        "O link vence em 30 dias. Dá para renovar ou trocar.",
      ],
      agencia: {
        texto:
          "A lista curta para o cliente: ele abre pelo link, sem conta, vê o currículo e o seu parecer (sem o contato) e responde cada um.",
        dicas: [
          "Escreva o parecer de cada finalista: é o que o cliente mais lê.",
          "Com o Plano Agência, o link sai com a sua marca e cada finalista tem o dossiê para PDF.",
          "O link vence em 30 dias. Dá para renovar ou trocar.",
        ],
      },
    },
  },
  {
    caminho: /^\/painel\/anuncio\/[^/]+\/automacoes/,
    ajuda: {
      titulo: "Automações da vaga",
      texto: "As regras desta vaga: quando algo acontece com um candidato, o Publike move de etapa ou manda a mensagem sozinho.",
      dicas: ["Comece com uma regra simples, como mandar quem não tem o obrigatório para “Não seguiu”.", "As regras valem para quem chegar depois de criadas."],
    },
  },
  {
    caminho: /^\/painel\/anuncio\/[^/]+/,
    ajuda: {
      titulo: "A vaga",
      texto: "Tudo desta vaga: os candidatos, o que avaliar, os finalistas e a contratação.",
      dicas: ["Use as abas no alto para ir de uma parte a outra.", "Editar a vaga não apaga quem já se candidatou."],
    },
  },
  {
    caminho: /^\/painel\/clientes\/[^/]+\/relatorio/,
    ajuda: {
      titulo: "Relatório para o cliente",
      texto:
        "O trabalho feito para o cliente no período: vagas, candidatos, quantos atendem o obrigatório, entrevistas, finalistas, o tempo até eles e os contratados. Com a sua marca. Só números, sem dado de candidato.",
      dicas: [
        "Mande o link ao cliente antes da reunião: ele vê os últimos 90 dias sem precisar de conta.",
        "“Imprimir ou salvar em PDF” gera o arquivo para anexar no e-mail.",
        "Trocar o link faz o anterior parar de abrir.",
      ],
    },
  },
  {
    caminho: /^\/painel\/clientes\/[^/]+/,
    ajuda: {
      titulo: "O cliente",
      texto: "As vagas, os pedidos e os candidatos de um cliente, com os dados de contato dele.",
      dicas: [
        "“Publicar vaga para este cliente” já preenche a empresa e o endereço.",
        "O e-mail do cliente é para onde vão o relatório e a pergunta da garantia.",
        "Cliente que parou de contratar pode ser arquivado: as vagas dele continuam.",
      ],
    },
  },
  {
    caminho: /^\/painel\/clientes/,
    ajuda: {
      titulo: "Clientes",
      texto: "As empresas que a agência atende. Cada uma tem as vagas, os pedidos, o relatório e os contatos.",
      dicas: [
        "Cadastre o CNPJ e o e-mail do responsável: o Publike usa nos pedidos, no relatório e na garantia.",
        "Cliente confidencial: as vagas saem sem o nome dele.",
      ],
    },
  },
  {
    caminho: /^\/painel\/pedidos/,
    ajuda: {
      titulo: "Pedidos dos clientes",
      texto: "O que cada cliente pediu pelo link dele: a vaga que precisa, o prazo para os finalistas e o andamento.",
      dicas: [
        "Mande a cada cliente o link de pedir vagas: o pedido chega aqui, no sino e por e-mail.",
        "Aceite o pedido e publique a vaga a partir dele: ela já sai ligada ao pedido.",
      ],
    },
  },
  {
    caminho: /^\/painel\/finalistas/,
    ajuda: {
      titulo: "Para o cliente",
      texto: "Uma linha por vaga, com os finalistas, o estado do link e o que o cliente já respondeu.",
      dicas: [
        "Comece pelas vagas com gente pronta: são as que o cliente espera.",
        "O link mostra se o cliente já abriu. Não abriu em dois dias? Vale lembrar pelo WhatsApp.",
      ],
    },
  },
  {
    caminho: /^\/painel\/contratados/,
    ajuda: {
      titulo: "Contratados",
      texto: "Quem você colocou nos clientes, com a taxa, a garantia e o que falta receber.",
      dicas: [
        "Registre o início, a taxa e os dias de garantia no cartão de cada pessoa, no quadro da vaga.",
        "Saiu dentro da garantia? Marque a saída: conta como reposição.",
        "Com o Plano Agência, o Publike pergunta ao cliente, 7 dias antes do fim da garantia, se a pessoa continua.",
      ],
    },
  },
  {
    caminho: /^\/painel\/contratacao/,
    ajuda: {
      titulo: "Contratação",
      texto: "Os próximos passos de quem foi contratado: a proposta, os documentos da admissão e o primeiro dia.",
      dicas: ["Os documentos ficam guardados só até a entrega ao contador.", "A pessoa recebe o lembrete dois dias antes do primeiro dia."],
    },
  },
  {
    caminho: /^\/painel\/links\/pagina/,
    ajuda: {
      titulo: "Página de carreiras",
      texto: "A sua página de vagas com a cara da empresa: a cor da marca, as fotos, por que trabalhar aí, os benefícios e um endereço curto.",
      dicas: [
        "Libera sozinha com 10 vagas publicadas, ou com qualquer assinatura, ou por R$ 19,90 por mês.",
        "Use o endereço curto no Instagram e no cartão de visita.",
      ],
    },
  },
  {
    caminho: /^\/painel\/links/,
    ajuda: {
      titulo: "Página de vagas",
      texto: "Tudo para divulgar as suas vagas fora do Publike: a página com todas elas, o texto para grupos, imagens para o Instagram, o cartaz e o quadro para o seu site.",
      dicas: [
        "Mande o texto pronto nos grupos de WhatsApp do bairro: é o que mais traz candidato perto.",
        "O quadro para o site mostra as vagas no ar sozinho, sem você atualizar.",
      ],
    },
  },
  {
    caminho: /^\/painel\/numeros/,
    ajuda: {
      titulo: "Resultados",
      texto: "Os números das suas vagas: visitas, candidatos, tempo de resposta e contratações.",
      dicas: ["Vaga com muita visita e pouco candidato costuma pedir salário ou descrição mais clara."],
    },
  },
  {
    caminho: /^\/painel\/copiloto/,
    ajuda: {
      titulo: "Triagem com IA",
      texto: "A IA lê todos os currículos de cada vaga pelos critérios que você escolher e mostra quem atende, com a prova de cada ponto.",
      dicas: [
        "Marque como obrigatório só o que é mesmo obrigatório: o resto vira desempate.",
        "A IA não olha nome, foto nem contato. Quem decide é você.",
        "Dá para experimentar 15 dias grátis.",
      ],
    },
  },
  {
    caminho: /^\/painel\/testes/,
    ajuda: {
      titulo: "Teste Prático",
      texto: "Um teste curto da função que o candidato faz pelo celular, para confirmar que a pessoa sabe fazer. O resultado chega no quadro da vaga: acima, dentro ou abaixo do esperado.",
      dicas: ["Peça o teste depois do match, para quem já tem interesse.", "Dá para experimentar 15 dias grátis."],
    },
  },
  {
    caminho: /^\/painel\/video/,
    ajuda: {
      titulo: "Entrevista em vídeo",
      texto: "Para ver a pessoa contando como faz o serviço antes de chamar: ela grava as respostas pelo celular, no prazo que você escolher, e a IA transcreve e resume. Ou a entrevista ao vivo, dentro do Publike.",
      dicas: ["Três perguntas curtas bastam.", "A IA julga só o que a pessoa disse, nunca a aparência ou o jeito de falar."],
    },
  },
  {
    caminho: /^\/painel\/automacoes/,
    ajuda: {
      titulo: "Automações",
      texto: "Regras do tipo Quando, Se e Então: o Publike move candidatos e manda mensagens sozinho.",
      dicas: ["Ex.: quem mora a até 5 km e tem CNH vai para Em análise e recebe a mensagem.", "Comece com uma regra e veja como ela age antes de criar outras."],
    },
  },
  {
    caminho: /^\/painel\/salarios/,
    ajuda: {
      titulo: "Consulta de salários",
      texto: "Quanto o mercado paga para cada função na sua região (Novo Caged), o que as vagas do Publike oferecem e quanto oferecer para fechar rápido.",
      dicas: ["Você começa com 5 consultas grátis e ganha mais 2 a cada 5 vagas novas."],
    },
  },
  {
    caminho: /^\/painel\/mutiroes/,
    ajuda: {
      titulo: "Mutirão",
      texto:
        "Um dia de entrevistas em sequência para contratar várias pessoas de uma vez: você escolhe o dia, os horários e as vagas, e cada pessoa marca o seu horário.",
      dicas: [
        "Chame quem curtiu as vagas: só aparecem os horários que ainda têm lugar, e o lembrete sai na véspera.",
        "No dia, marque quem chegou e quem faltou, e abra a ficha para contratar.",
        "Vem nos planos. O primeiro mutirão é grátis, para experimentar.",
      ],
    },
  },
  {
    caminho: /^\/painel\/convites/,
    ajuda: {
      titulo: "Convite automático",
      texto:
        "Ligado numa vaga, o convite sai sozinho, com o seu recado, para quem tem o currículo que combina com ela.",
      dicas: [
        "Sem plano, você recebe o aviso de até 3 pessoas que combinam por dia e convida à mão.",
        "Com um plano, os avisos vão até 30 por dia, e o convite automático pode ser ligado em cada vaga.",
        "Cada pessoa recebe no máximo 2 convites automáticos por semana, e quem não quer desliga.",
      ],
    },
  },
  {
    caminho: /^\/painel\/mapa-de-talentos/,
    ajuda: {
      titulo: "Mapa de talentos",
      texto:
        "Quantas pessoas que procuram trabalho moram a até 15, 30 e 45 minutos de ônibus da vaga, o que já fizeram e em que bairros.",
      dicas: [
        "Use para escolher o salário, o lugar do mutirão ou mostrar ao cliente quanta gente há perto.",
        "Ninguém tem a casa mostrada: só aparecem grupos de 5 pessoas ou mais.",
        "O total a até 30 minutos é grátis. O resto vem com a Consulta de salários ou um plano.",
      ],
    },
  },
  {
    caminho: /^\/painel\/equipe/,
    ajuda: {
      titulo: "Equipe",
      texto: "Quem trabalha na conta com você, cada um com o próprio login. Você vê o que cada um fez.",
      dicas: [
        "Quem administra convida, muda o papel e tira pessoas.",
        "Quem é da equipe troca de conta no nome, no alto do menu.",
      ],
    },
  },
  {
    caminho: /^\/painel\/etapas/,
    ajuda: {
      titulo: "Etapas",
      texto: "As etapas do seu processo de seleção, além das que já vêm prontas.",
      dicas: ["Etapas a mais só ajudam se alguém olha cada uma. Menos etapas, contratação mais rápida."],
    },
  },
  {
    caminho: /^\/painel\/configuracoes/,
    ajuda: {
      titulo: "Configurações",
      texto: "O jeito padrão das suas vagas e do processo: perguntas, avisos, mensagens e o que é obrigatório antes de contratar.",
      dicas: ["O que você escolher aqui vale para as próximas vagas. As que já estão no ar não mudam."],
    },
  },
  {
    caminho: /^\/painel\/planos/,
    ajuda: {
      titulo: "Planos",
      texto: "Os planos lado a lado, com o preço e o que cada um traz. Publicar, ver candidatos e conversar continuam grátis.",
      dicas: [
        "O plano é pela faixa de vagas no ar: o que cabe nas suas vagas vem marcado.",
        "Por mês, a cada 3 meses ou por ano (9 meses pelo ano). Troque em cima da lista.",
        "Só precisa por um tempo? O plano por 30 dias não renova sozinho.",
        "Só quer um recurso? Ele aparece sozinho embaixo dos planos.",
      ],
    },
  },
  {
    caminho: /^\/painel\/assinar/,
    ajuda: {
      titulo: "Assinar",
      texto: "Os planos e os recursos pagos. Publicar, ver candidatos e conversar continuam grátis.",
      dicas: [
        "O plano é pela faixa de vagas no ar: a tela mostra a que cabe na sua conta.",
        "Cartão ou Pix. Dá para cancelar quando quiser, e o que já foi pago continua valendo.",
        "No anual e no plano por 30 dias, desistiu em até 7 dias do pagamento, o dinheiro volta.",
      ],
    },
  },
  {
    caminho: /^\/painel\/(assinatura|faturas)/,
    ajuda: {
      titulo: "Assinatura e faturas",
      texto: "O que você assina, a forma de pagamento, as próximas cobranças e as faturas.",
      dicas: [
        "Passou da faixa de vagas do plano? O aviso aparece aqui, com 30 dias para mudar de plano, e nada para de funcionar.",
        "“Mudar para a faixa de cima”: você paga só a diferença dos dias que faltam.",
        "No anual (1ª compra) e no plano por 30 dias, “Desistir e receber de volta” aparece até 7 dias depois do pagamento.",
      ],
    },
  },
  {
    caminho: /^\/painel\/conversas/,
    ajuda: {
      titulo: "Mensagens",
      texto: "As conversas com os candidatos pelo chat do Publike, depois do match.",
      dicas: ["O chat faz as primeiras perguntas sozinho (CNH, horário, quando começa) e você recebe o resumo."],
    },
  },
];

/** A ajuda da página do painel (ou null, sem texto para ela), já na versão da agência quando muda. */
export function ajudaDaPagina(caminho: string, agencia: boolean): AjudaDaPagina | null {
  const regra = REGRAS.find((r) => r.caminho.test(caminho));
  if (!regra) return null;
  const a = regra.ajuda;
  if (!agencia || !a.agencia) return a;
  return { ...a, texto: a.agencia.texto ?? a.texto, dicas: a.agencia.dicas ?? a.dicas };
}
