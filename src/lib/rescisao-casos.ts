// As páginas da rescisão por caso (claude/plano-rescisao-por-caso.md): cada tipo de saída tem a sua página, com a
// calculadora já marcada, um resumo do que entra e do que não entra, um exemplo resolvido (calculado com as regras
// de verdade, então acompanha as tabelas do ano) e perguntas próprias. Servem às buscas de cada caso ("rescisão
// pedido de demissão", "rescisão acordo"), que a página geral sozinha não alcança.

import type { Entrada, TipoSaida } from "./rescisao";
import { ANO_DAS_TABELAS } from "./tabelas-trabalhistas";

export type CasoRescisao = {
  slug: string;
  /** o nome curto, para os links entre os casos */
  nome: string;
  titulo: string;
  descricao: string;
  h1: string;
  /** o primeiro parágrafo, logo abaixo do título */
  chamada: string;
  recebe: string[];
  naoRecebe: string[];
  /** o que este caso tem de diferente, em parágrafos curtos */
  atencao: { titulo: string; texto: string }[];
  exemplo: { frase: string; entrada: Entrada };
  perguntas: { p: string; r: string }[];
  /** como a calculadora abre nesta página */
  inicial: { saida?: TipoSaida; domestico?: boolean; outros?: boolean };
  seguro: boolean;
};

const A = ANO_DAS_TABELAS;

export const CASOS_RESCISAO: CasoRescisao[] = [
  {
    slug: "demissao-sem-justa-causa",
    nome: "Demissão sem justa causa",
    titulo: `Rescisão por demissão sem justa causa ${A}: calcule o que você recebe`,
    descricao: `Calcule a rescisão da demissão sem justa causa: aviso prévio proporcional, 13º e férias com os dias do aviso, multa de 40% e saque do FGTS, INSS e IR de ${A}. Grátis e com a conta de cada valor.`,
    h1: "Rescisão por demissão sem justa causa",
    chamada:
      "Quando a empresa demite sem justa causa, você recebe todas as verbas da rescisão, a multa de 40% do FGTS e pode sacar o saldo. O aviso prévio cresce com o tempo de casa e, quando é indenizado, aumenta o 13º e as férias.",
    recebe: [
      "Saldo de salário (os dias trabalhados no último mês)",
      "Aviso prévio: 30 dias mais 3 por ano completo, até 90 dias",
      "13º proporcional, contando os dias do aviso",
      "Férias vencidas e proporcionais, com 1/3",
      "Multa de 40% sobre o FGTS depositado e o saque do saldo",
      "Seguro-desemprego, se cumprir os prazos",
    ],
    naoRecebe: ["Não há desconto de aviso: quem dá o aviso é a empresa"],
    atencao: [
      {
        titulo: "Aviso indenizado ou trabalhado",
        texto:
          "Indenizado é quando a empresa paga os dias do aviso sem você trabalhar. Esses dias contam como tempo de serviço: a data de saída na carteira vai para frente e o 13º e as férias aumentam. No aviso trabalhado, você trabalha 30 dias com 2 horas a menos por dia ou 7 dias corridos de folga no fim (art. 488 da CLT), e os dias a mais da proporcionalidade são pagos.",
      },
      {
        titulo: "Saque-aniversário",
        texto:
          "Quem aderiu ao saque-aniversário recebe a multa de 40%, mas o saldo fica preso na conta. Voltar ao saque-rescisão só vale a partir do 25º mês depois do pedido.",
      },
    ],
    exemplo: {
      frase: `Contratada em 10/03/${A - 3}, com salário de R$ 2.500, recebeu o aviso indenizado em 06/11/${A}. Tinha R$ 7.000 de FGTS.`,
      entrada: {
        saida: "sem_justa_causa",
        domestico: false,
        admissao: `${A - 3}-03-10`,
        ultimoDia: `${A}-11-06`,
        aviso: "indenizado",
        salario: 2500,
        fgtsSaldo: 7000,
      },
    },
    perguntas: [
      {
        p: "Quanto tempo de aviso prévio eu tenho?",
        r: "30 dias até completar 1 ano de empresa, e mais 3 dias por ano completo, até 90 dias (Lei 12.506/2011). Com 3 anos completos, são 39 dias.",
      },
      {
        p: "O aviso indenizado aumenta o 13º e as férias?",
        r: "Sim. Os dias do aviso indenizado contam como tempo de serviço (art. 487, § 1º, da CLT): a saída é projetada para o fim do aviso, e cada mês com 15 dias ou mais vira mais 1/12 no 13º e nas férias.",
      },
      {
        p: "Desconta INSS e imposto de renda?",
        r: "Só do saldo de salário e do 13º. O aviso indenizado, as férias indenizadas com 1/3, o FGTS e a multa não têm desconto de IR, e o aviso e as férias indenizados também não têm INSS.",
      },
      {
        p: "Qual o prazo para pagar?",
        r: "10 dias corridos depois do fim do contrato (art. 477 da CLT). Se a empresa atrasar, paga uma multa de um salário.",
      },
      {
        p: "Tenho direito ao seguro-desemprego?",
        r: "Na demissão sem justa causa, sim, desde que tenha trabalhado o tempo mínimo: 12 meses nos últimos 18 no primeiro pedido, 9 meses nos últimos 12 no segundo e 6 meses seguidos a partir do terceiro.",
      },
    ],
    inicial: { saida: "sem_justa_causa" },
    seguro: true,
  },
  {
    slug: "pedido-de-demissao",
    nome: "Pedido de demissão",
    titulo: `Rescisão por pedido de demissão ${A}: calcule o que você recebe`,
    descricao: `Calcule a rescisão de quem pede demissão: saldo de salário, 13º, férias vencidas e proporcionais com 1/3 e o desconto do aviso não cumprido, com INSS e IR de ${A}. Grátis e com a conta de cada valor.`,
    h1: "Rescisão por pedido de demissão",
    chamada:
      "Quem pede demissão recebe o salário dos dias trabalhados, o 13º e as férias, mas não tem multa nem saque do FGTS, nem seguro-desemprego. O que mais muda o valor é o aviso prévio: cumprir os 30 dias, ser liberado pela empresa ou ter o mês descontado.",
    recebe: [
      "Saldo de salário",
      "13º proporcional",
      "Férias vencidas e proporcionais, com 1/3, mesmo com menos de 1 ano de empresa",
    ],
    naoRecebe: [
      "Multa de 40% do FGTS",
      "Saque do FGTS: o saldo fica na conta",
      "Seguro-desemprego",
      "Aviso prévio proporcional: quem pede dá sempre 30 dias",
    ],
    atencao: [
      {
        titulo: "O aviso de 30 dias",
        texto:
          "Quem pede demissão deve trabalhar 30 dias de aviso. Se não cumprir, a empresa pode descontar um mês de remuneração da rescisão (art. 487, § 2º, da CLT). Se a empresa liberar você do aviso, não há desconto. Vale pedir a liberação por escrito.",
      },
      {
        titulo: "O FGTS fica na conta",
        texto:
          "O saldo não é perdido: continua rendendo e pode ser usado na compra da casa própria, no saque-aniversário ou nos outros casos da lei. Também pode ser sacado depois de 3 anos seguidos sem carteira assinada.",
      },
    ],
    exemplo: {
      frase: `Contratado em 01/02/${A - 1}, com salário de R$ 1.800, pediu demissão e saiu em 06/11/${A} sem cumprir o aviso. Tinha um período de férias vencido.`,
      entrada: {
        saida: "pedido",
        domestico: false,
        admissao: `${A - 1}-02-01`,
        ultimoDia: `${A}-11-06`,
        aviso: "nao_cumprido",
        salario: 1800,
        feriasVencidas: 1,
      },
    },
    perguntas: [
      {
        p: "Quem pede demissão recebe férias?",
        r: "Sim. As férias vencidas e as proporcionais, sempre com 1/3, mesmo com menos de 1 ano de empresa (Súmula 261 do TST).",
      },
      {
        p: "A empresa pode descontar o aviso?",
        r: "Pode, se você não trabalhar os 30 dias: o desconto é de um mês de remuneração, limitado ao que há para receber. Se a empresa liberar você, não desconta.",
      },
      {
        p: "Posso sacar o FGTS se pedir demissão?",
        r: "Não na saída. O saldo fica na conta e pode ser usado para a casa própria, no saque-aniversário ou depois de 3 anos seguidos fora do regime do FGTS.",
      },
      {
        p: "Quem pede demissão tem seguro-desemprego?",
        r: "Não. O seguro-desemprego é para quem foi demitido sem justa causa ou saiu por rescisão indireta.",
      },
      {
        p: "Qual o prazo para pagar?",
        r: "O mesmo da demissão: 10 dias corridos depois do fim do contrato (art. 477 da CLT).",
      },
    ],
    inicial: { saida: "pedido" },
    seguro: false,
  },
  {
    slug: "acordo",
    nome: "Acordo (484-A)",
    titulo: `Rescisão por acordo (484-A) ${A}: calcule o que você recebe`,
    descricao: `Calcule a rescisão por acordo entre empresa e empregado (art. 484-A da CLT): metade do aviso indenizado, multa de 20%, saque de 80% do FGTS, 13º e férias inteiros, com INSS e IR de ${A}.`,
    h1: "Rescisão por acordo (art. 484-A)",
    chamada:
      "No acordo, empresa e empregado combinam o fim do contrato. Algumas verbas caem pela metade (o aviso indenizado e a multa do FGTS), você saca 80% do FGTS e as outras verbas vêm inteiras. Não há seguro-desemprego.",
    recebe: [
      "Saldo de salário",
      "Metade do aviso prévio, se for indenizado",
      "13º proporcional e férias vencidas e proporcionais com 1/3, inteiros",
      "Multa de 20% sobre o FGTS",
      "Saque de 80% do saldo do FGTS",
    ],
    naoRecebe: ["Seguro-desemprego", "Os outros 20% do FGTS, que ficam na conta"],
    atencao: [
      {
        titulo: "Precisa ser de comum acordo",
        texto:
          "A empresa não pode impor o acordo para pagar menos. Se a iniciativa foi dela e você não queria sair, a saída é uma demissão sem justa causa, com todas as verbas.",
      },
      {
        titulo: "Aviso trabalhado não cai pela metade",
        texto:
          "Só o aviso indenizado é pago pela metade. Se você trabalhar o aviso, recebe o salário dos dias trabalhados normalmente.",
      },
    ],
    exemplo: {
      frase: `Contratado em 01/06/${A - 4}, com salário de R$ 3.000, fez acordo e recebeu o aviso indenizado em 06/11/${A}. Tinha R$ 12.000 de FGTS.`,
      entrada: {
        saida: "acordo",
        domestico: false,
        admissao: `${A - 4}-06-01`,
        ultimoDia: `${A}-11-06`,
        aviso: "indenizado",
        salario: 3000,
        fgtsSaldo: 12000,
      },
    },
    perguntas: [
      {
        p: "O que cai pela metade no acordo?",
        r: "O aviso prévio indenizado e a multa do FGTS, que vai de 40% para 20%. O saldo de salário, o 13º e as férias com 1/3 vêm inteiros (art. 484-A da CLT).",
      },
      {
        p: "Quanto do FGTS posso sacar?",
        r: "80% do saldo. Os outros 20% ficam na conta e seguem as regras normais de saque.",
      },
      {
        p: "Quem faz acordo tem seguro-desemprego?",
        r: "Não. A lei exclui o seguro-desemprego na rescisão por acordo (art. 484-A, § 2º).",
      },
      {
        p: "O acordo precisa ser homologado no sindicato?",
        r: "Não. Desde a reforma de 2017, a rescisão não precisa de homologação. Mas é bom ter o acordo por escrito e conferir o termo de rescisão (TRCT) antes de assinar.",
      },
    ],
    inicial: { saida: "acordo" },
    seguro: false,
  },
  {
    slug: "contrato-de-experiencia",
    nome: "Contrato de experiência",
    titulo: `Rescisão do contrato de experiência ${A}: calcule o que você recebe`,
    descricao: `Calcule a rescisão do contrato de experiência: fim no prazo, saída antes do prazo pela empresa (art. 479) ou por você (art. 480), com 13º, férias, FGTS e INSS e IR de ${A}.`,
    h1: "Rescisão do contrato de experiência",
    chamada:
      "O contrato de experiência dura até 90 dias. O que você recebe depende de como ele acabou: no prazo, antes do prazo pela empresa ou antes do prazo por você. Na calculadora, escolha o seu caso e coloque a data prevista para o fim.",
    recebe: [
      "Saldo de salário, 13º proporcional e férias proporcionais com 1/3, em qualquer caso",
      "No fim do prazo: saque do FGTS, sem multa",
      "Empresa encerrou antes: metade dos salários até o fim previsto (art. 479), multa de 40% e saque do FGTS",
    ],
    naoRecebe: [
      "Aviso prévio, a não ser que o contrato tenha a cláusula do art. 481",
      "Seguro-desemprego no fim do prazo, nem quando você sai antes",
    ],
    atencao: [
      {
        titulo: "Se você sair antes do prazo",
        texto:
          "A empresa pode cobrar uma indenização pelo prejuízo de você sair antes (art. 480 da CLT), de no máximo a metade dos salários até o fim previsto. Ela precisa mostrar o prejuízo; não é automático.",
      },
      {
        titulo: "A cláusula do art. 481",
        texto:
          "Alguns contratos têm uma cláusula que permite a qualquer um encerrar antes do prazo. Aí valem as regras do contrato sem prazo: tem aviso prévio, e não há a indenização dos arts. 479 e 480. Confira no seu contrato.",
      },
    ],
    exemplo: {
      frase: `Contratada por 90 dias em 01/09/${A}, com salário de R$ 1.800 e fim previsto em 29/11/${A}, foi dispensada pela empresa em 15/10/${A}.`,
      entrada: {
        saida: "prazo_antes_empresa",
        domestico: false,
        admissao: `${A}-09-01`,
        ultimoDia: `${A}-10-15`,
        aviso: "indenizado",
        fimPrevisto: `${A}-11-29`,
        salario: 1800,
      },
    },
    perguntas: [
      {
        p: "Quanto tempo dura o contrato de experiência?",
        r: "No máximo 90 dias, e pode ser prorrogado uma vez dentro desse limite (por exemplo, 45 mais 45 dias). Passou disso, vira contrato sem prazo.",
      },
      {
        p: "Recebo alguma coisa se a experiência acabar no prazo?",
        r: "Sim: o saldo de salário, o 13º proporcional, as férias proporcionais com 1/3 e o saque do FGTS. Não tem multa nem aviso prévio.",
      },
      {
        p: "E se a empresa me dispensar antes do fim?",
        r: "Além das verbas normais, recebe a metade dos salários que faltavam até o fim previsto (art. 479 da CLT), a multa de 40% e o saque do FGTS.",
      },
      {
        p: "Experiência dá direito ao seguro-desemprego?",
        r: "No fim do prazo, não. Se a empresa encerrar antes e você tiver o tempo mínimo de trabalho somando os empregos anteriores, pode ter.",
      },
    ],
    inicial: { outros: true },
    seguro: true,
  },
  {
    slug: "empregada-domestica",
    nome: "Empregada doméstica",
    titulo: `Rescisão de empregada doméstica ${A}: calcule o acerto`,
    descricao: `Calcule a rescisão da empregada ou do empregado doméstico (LC 150/2015): aviso prévio proporcional, 13º, férias, FGTS e os 3,2% no lugar da multa, com INSS e IR de ${A}.`,
    h1: "Rescisão de empregada doméstica",
    chamada:
      "Empregada e empregado doméstico têm as mesmas verbas da rescisão de qualquer trabalhador com carteira: saldo de salário, aviso prévio proporcional, 13º e férias com 1/3. A diferença está no FGTS: no lugar da multa de 40%, o patrão deposita 3,2% todo mês, e esse valor vai para quem é demitido sem justa causa.",
    recebe: [
      "Saldo de salário, 13º proporcional e férias vencidas e proporcionais com 1/3",
      "Aviso prévio proporcional, como nos outros empregos",
      "Na demissão sem justa causa: o saque do FGTS e dos 3,2% depositados (indenização compensatória)",
      "Seguro-desemprego de 3 parcelas de um salário mínimo, se cumprir os prazos",
    ],
    naoRecebe: [
      "Multa de 40% paga na hora: os 3,2% mensais fazem esse papel",
      "Os 3,2% no pedido de demissão e na justa causa: aí eles voltam para o patrão",
    ],
    atencao: [
      {
        titulo: "Onde ver os 3,2%",
        texto:
          "No app FGTS, o depósito dos 3,2% aparece separado do FGTS normal. Se você não souber o saldo, a calculadora estima pelos meses de trabalho e pelo salário.",
      },
      {
        titulo: "Pelo eSocial",
        texto:
          "A rescisão da doméstica é feita no eSocial Doméstico, que gera a guia com o FGTS do mês e o termo de rescisão. O prazo para pagar é o mesmo: 10 dias corridos depois do fim do contrato.",
      },
    ],
    exemplo: {
      frase: `Contratada em 02/05/${A - 2}, com salário de R$ 1.621, foi demitida sem justa causa com aviso indenizado em 06/11/${A}.`,
      entrada: {
        saida: "sem_justa_causa",
        domestico: true,
        admissao: `${A - 2}-05-02`,
        ultimoDia: `${A}-11-06`,
        aviso: "indenizado",
        salario: 1621,
      },
    },
    perguntas: [
      {
        p: "Empregada doméstica tem direito a aviso prévio proporcional?",
        r: "Sim. São 30 dias mais 3 por ano completo, até 90 dias, como nos outros empregos (LC 150/2015, art. 23).",
      },
      {
        p: "Doméstica recebe a multa de 40% do FGTS?",
        r: "Não da forma comum. O patrão deposita 3,2% do salário todo mês, e na demissão sem justa causa a doméstica saca esse valor junto com o FGTS (LC 150/2015, art. 22).",
      },
      {
        p: "E se a doméstica pedir demissão?",
        r: "Recebe o saldo de salário, o 13º e as férias com 1/3. O FGTS fica na conta e os 3,2% voltam para o patrão.",
      },
      {
        p: "Doméstica tem seguro-desemprego?",
        r: "Tem, quando é demitida sem justa causa e trabalhou pelo menos 15 meses nos últimos 24. São até 3 parcelas de um salário mínimo (LC 150/2015, art. 26).",
      },
    ],
    inicial: { domestico: true },
    seguro: true,
  },
  {
    slug: "justa-causa",
    nome: "Justa causa",
    titulo: `Rescisão por justa causa ${A}: o que você recebe`,
    descricao: `Calcule a rescisão por justa causa: saldo de salário e férias vencidas com 1/3, com INSS e IR de ${A}. Veja o que não é pago e como contestar.`,
    h1: "Rescisão por justa causa",
    chamada:
      "Na justa causa, a empresa encerra o contrato por uma falta grave do empregado (art. 482 da CLT). É a saída em que menos se recebe: só o saldo de salário e as férias vencidas. Mesmo assim, a empresa tem de pagar no prazo.",
    recebe: [
      "Saldo de salário",
      "Férias vencidas com 1/3, em dobro se passou o prazo para tirar",
      "Salário-família, se tiver direito",
    ],
    naoRecebe: [
      "Aviso prévio",
      "13º proporcional",
      "Férias proporcionais",
      "Multa e saque do FGTS: o saldo fica na conta",
      "Seguro-desemprego",
    ],
    atencao: [
      {
        titulo: "Dá para contestar",
        texto:
          "A empresa precisa provar a falta grave. Se a justa causa for derrubada na Justiça do Trabalho, ela vira demissão sem justa causa, e a empresa paga tudo o que faltou, com a multa. O prazo para entrar com a ação é de 2 anos depois da saída.",
      },
      {
        titulo: "O prazo continua valendo",
        texto:
          "Mesmo na justa causa, a empresa tem 10 dias corridos para pagar o que é devido. Se atrasar, paga a multa de um salário (art. 477 da CLT).",
      },
    ],
    exemplo: {
      frase: `Contratado em 15/01/${A - 2}, com salário de R$ 2.200, foi dispensado por justa causa em 06/11/${A}, com um período de férias vencido.`,
      entrada: {
        saida: "justa_causa",
        domestico: false,
        admissao: `${A - 2}-01-15`,
        ultimoDia: `${A}-11-06`,
        aviso: "indenizado",
        salario: 2200,
        feriasVencidas: 1,
      },
    },
    perguntas: [
      {
        p: "O que é pago na justa causa?",
        r: "O saldo de salário, as férias vencidas com 1/3 (em dobro se passou o prazo para tirar) e o salário-família, se houver. Não há aviso, 13º proporcional, férias proporcionais, multa nem saque do FGTS.",
      },
      {
        p: "Quais faltas dão justa causa?",
        r: "As do art. 482 da CLT, como abandono de emprego, faltas sem justificativa repetidas, embriaguez em serviço, desídia, insubordinação, violação de segredo da empresa e condenação criminal. A punição precisa ser proporcional e imediata.",
      },
      {
        p: "Perco o FGTS na justa causa?",
        r: "Não perde: o saldo fica na conta, só não dá para sacar na saída. Ele pode ser usado depois, nos outros casos da lei.",
      },
      {
        p: "Posso contestar a justa causa?",
        r: "Sim, na Justiça do Trabalho, em até 2 anos depois da saída. Se a justa causa cair, a empresa paga as verbas de uma demissão sem justa causa.",
      },
    ],
    inicial: { saida: "justa_causa" },
    seguro: false,
  },
];

export const casoDaRescisao = (slug: string) => CASOS_RESCISAO.find((c) => c.slug === slug);
