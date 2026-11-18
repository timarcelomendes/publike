// O texto próprio das funções mais buscadas (claude/plano-organico.md, item 6): o que faz, o que as vagas pedem, uma
// dica e as perguntas de cada uma. As páginas de função (/vagas/goiania/frentista) eram iguais umas às outras, só com
// o nome trocado, e o Google não tinha por que mostrar uma delas. Aqui só entra o que vale para a função em qualquer
// lugar (as regras de trabalho, a lei, o dia a dia); os números da cidade (as vagas, o salário) a página calcula.
// Para escrever uma nova: a chave é o slug da função (src/lib/funcoes-das-paginas.ts) e as frases são curtas.

export type TextoDaFuncao = {
  /** "O que faz": duas ou três frases sobre o dia a dia */
  faz: string;
  /** o que as vagas costumam pedir (um item por linha) */
  pedem: string[];
  /** uma dica para conseguir a vaga */
  dica: string;
  /** as perguntas que só essa função tem (entram nas perguntas da página e no FAQPage) */
  perguntas: { p: string; r: string }[];
};

export const TEXTOS_DAS_FUNCOES: Record<string, TextoDaFuncao> = {
  frentista: {
    faz: "O frentista abastece os veículos, confere o óleo, a água e os pneus, limpa o para-brisa e recebe o pagamento no dinheiro, no cartão ou no Pix. Em muitos postos também vende óleo, aditivo e os produtos da loja de conveniência.",
    pedem: [
      "Ensino fundamental ou médio; muitas vagas aceitam quem nunca trabalhou em posto.",
      "Atenção com o troco e com o fechamento do caixa do turno.",
      "Disponibilidade para escala, fim de semana e, em posto 24 horas, turno da noite.",
    ],
    dica: "No currículo, conte se você já lidou com caixa, Pix e atendimento ao público: é o que o gerente do posto mais procura em quem está começando.",
    perguntas: [
      {
        p: "Frentista recebe adicional de periculosidade?",
        r: "Sim. Quem trabalha nas bombas de combustível tem direito ao adicional de periculosidade de 30% sobre o salário-base, por lidar com inflamáveis. Ele é pago junto com o salário, no contracheque.",
      },
      {
        p: "Precisa de curso para ser frentista?",
        r: "Não precisa de curso antes. O treinamento de segurança para trabalhar com combustível (a NR-20) é obrigação do posto, sem custo para quem trabalha.",
      },
    ],
  },
  "operador-de-empilhadeira": {
    faz: "O operador de empilhadeira carrega e descarrega caminhões, leva os paletes para as prateleiras do armazém e ajuda a manter o estoque organizado. Antes de começar o turno, faz a conferência da máquina: freio, buzina, garfos e bateria ou gás.",
    pedem: [
      "Curso de operador de empilhadeira: a norma de segurança NR-11 exige treinamento para operar, e muitas vagas pedem o certificado.",
      "Experiência em armazém, centro de distribuição ou indústria conta muito.",
      "Algumas empresas pedem também a carteira de motorista.",
    ],
    dica: "Leve o certificado do curso e diga no currículo com qual tipo de empilhadeira você já trabalhou (a gás, elétrica, retrátil) e em que tipo de armazém.",
    perguntas: [
      {
        p: "Qual curso precisa para ser operador de empilhadeira?",
        r: "A NR-11 exige que o operador receba um treinamento específico, que o habilita a operar, e use no trabalho um cartão de identificação com nome e foto, que vale por um ano e é renovado com exame de saúde pago pelo empregador. Na prática, muitas vagas já pedem o certificado do curso na contratação.",
      },
      {
        p: "Precisa de carteira de motorista para operar empilhadeira?",
        r: "A NR-11 pede o treinamento e o cartão de identificação; a carteira de motorista não está na norma, mas algumas empresas pedem. Vale ler o que cada vaga diz.",
      },
    ],
  },
  "motorista-de-caminhao": {
    faz: "O motorista de caminhão leva as cargas da empresa ao cliente, confere a mercadoria e a nota fiscal na saída e na entrega e cuida do veículo no dia a dia: pneus, freios, óleo e documentos. Pode rodar só na cidade ou fazer viagens pela região.",
    pedem: [
      "Carteira de motorista categoria C (caminhão) ou E (carreta), com a observação EAR, de quem exerce atividade remunerada.",
      "Exame toxicológico em dia, obrigatório para as categorias C, D e E.",
      "Curso de MOPP para quem leva produto perigoso, como combustível e gás.",
    ],
    dica: "Diga no currículo a categoria da carteira, os tipos de caminhão que já dirigiu (toco, truck, carreta) e as rotas que conhece. Carteira sem pontos e toxicológico em dia contam a seu favor.",
    perguntas: [
      {
        p: "Qual carteira de motorista precisa para dirigir caminhão?",
        r: "A categoria C, para caminhão, ou a E, para carreta (o caminhão com reboque). Para trabalhar como motorista, a carteira precisa da observação EAR, de quem exerce atividade remunerada.",
      },
      {
        p: "Motorista de caminhão precisa fazer exame toxicológico?",
        r: "Sim. Quem tem carteira C, D ou E faz o exame toxicológico para tirar e renovar a carteira e repete o exame a cada dois anos e meio. Na contratação com carteira assinada, a empresa também pede o exame.",
      },
    ],
  },
  "auxiliar-de-producao": {
    faz: "O auxiliar de produção trabalha na linha da fábrica: abastece as máquinas, separa, embala e etiqueta os produtos, confere se saíram sem defeito e mantém o setor limpo. Em Goiás, muitas vagas são da indústria de alimentos, como frigoríficos, laticínios e outras fábricas de alimentos.",
    pedem: [
      "Ensino fundamental ou médio; muitas vagas são para quem está começando.",
      "Disponibilidade para turno, inclusive à noite, e para trabalhar em pé.",
      "Uso dos equipamentos de proteção (luva, touca, bota, protetor de ouvido), que a empresa fornece.",
    ],
    dica: "Na entrevista, fale de pontualidade e de qualquer trabalho em equipe que você já fez: é o que mais pesa para quem contrata sem experiência na fábrica.",
    perguntas: [
      {
        p: "Precisa de experiência para ser auxiliar de produção?",
        r: "Muitas vagas não pedem: a empresa ensina o trabalho da linha. Ensino fundamental ou médio e disponibilidade para o turno costumam bastar.",
      },
    ],
  },
  vendedor: {
    faz: "O vendedor atende quem entra na loja, entende o que a pessoa procura, mostra os produtos e fecha a venda. Também cuida da vitrine, da reposição e do pós-venda. Em Goiânia, o comércio de moda, como a Região da 44, e os shoppings estão entre os que mais contratam.",
    pedem: [
      "Ensino médio e jeito para conversar com o cliente.",
      "Experiência com vendas, metas ou comissão conta ponto, mas muita loja contrata quem está começando.",
      "Disponibilidade para sábado e, no shopping, domingo e feriado na escala.",
    ],
    dica: "No currículo, ponha números: quanto você vendia por mês, se bateu meta, quantos clientes atendia. Na entrevista, a loja costuma pedir para você vender um produto ali na hora.",
    perguntas: [
      {
        p: "Vendedor ganha comissão?",
        r: "Em muitas lojas, sim: o salário fixo vem com uma comissão sobre as vendas. Vale olhar na vaga se a comissão está informada e como ela é calculada.",
      },
    ],
  },
  "auxiliar-de-cozinha": {
    faz: "O auxiliar de cozinha faz o pré-preparo (lava, descasca e corta os alimentos), separa os ingredientes para o cozinheiro, organiza a cozinha e lava a louça e os utensílios. Segue as regras de higiene do restaurante o tempo todo.",
    pedem: [
      "Curso de boas práticas na manipulação de alimentos conta ponto.",
      "Agilidade, organização e cuidado com a higiene.",
      "Disponibilidade para fim de semana e feriado, quando restaurante e lanchonete mais trabalham.",
    ],
    dica: "Se você já cozinhou em casa de família, em festa ou em evento, conte no currículo: é experiência. Um curso curto de manipulação de alimentos ajuda a sair na frente.",
    perguntas: [
      {
        p: "Precisa de curso para ser auxiliar de cozinha?",
        r: "Não é obrigatório antes de começar, mas as regras da Anvisa pedem que quem manipula alimento seja capacitado em boas práticas. Ter o curso de manipulação de alimentos conta ponto na seleção.",
      },
    ],
  },
  porteiro: {
    faz: "O porteiro controla a entrada e a saída de pessoas e veículos, atende o interfone, recebe encomendas e correspondências e registra o que acontece no turno. Em condomínio, também acompanha os prestadores de serviço e faz a ronda nas áreas comuns.",
    pedem: [
      "Ensino fundamental ou médio e boa educação no atendimento.",
      "Curso de porteiro ou de controle de acesso conta ponto, mas não é obrigatório por lei.",
      "Disponibilidade para escala, muitas vezes 12x36, inclusive à noite.",
    ],
    dica: "Diga no currículo se você já usou sistema de portaria, câmeras e controle de encomendas. Referência de outro condomínio ajuda muito.",
    perguntas: [
      {
        p: "Porteiro é a mesma coisa que vigilante?",
        r: "Não. O porteiro cuida do acesso e do atendimento. O vigilante faz a segurança armada ou desarmada e precisa do curso de formação de vigilante, em escola autorizada pela Polícia Federal.",
      },
      {
        p: "Porteiro trabalha em escala 12x36?",
        r: "Muitas vagas de condomínio são em 12x36: doze horas de trabalho e trinta e seis de descanso. Outras são em turnos de oito horas. A vaga diz a escala.",
      },
    ],
  },
  repositor: {
    faz: "O repositor abastece as gôndolas e as prateleiras, confere a validade e tira o que venceu, organiza os produtos pela regra de que o que vence primeiro sai primeiro e confere as etiquetas de preço.",
    pedem: [
      "Ensino fundamental ou médio; muitas vagas são para o primeiro emprego.",
      "Organização e disposição para carregar caixas.",
      "Disponibilidade para escala; alguns supermercados repõem à noite.",
    ],
    dica: "Conte no currículo se você já organizou estoque, nem que seja no comércio da família: é o mesmo trabalho.",
    perguntas: [
      {
        p: "Repositor precisa de experiência?",
        r: "Muitas vagas não pedem. É uma das portas de entrada mais comuns no supermercado, e dali dá para crescer para estoquista, conferente ou encarregado.",
      },
    ],
  },
  "atendente-de-loja": {
    faz: "O atendente de loja recebe os clientes, ajuda a achar o que procuram, tira dúvidas sobre os produtos e, em muitas lojas, passa as compras no caixa. Também mantém a loja arrumada e os produtos com preço.",
    pedem: [
      "Ensino médio e simpatia no atendimento.",
      "Saber usar a maquininha de cartão e o Pix ajuda.",
      "Disponibilidade para sábado e, no shopping, para a escala de domingo e feriado.",
    ],
    dica: "Fale na entrevista de uma vez em que você resolveu o problema de um cliente: é a pergunta mais comum para atendente.",
    perguntas: [],
  },
  barbeiro: {
    faz: "O barbeiro faz cortes masculinos, barba e acabamento, orienta o cliente sobre o estilo e cuida da higiene das máquinas, navalhas e toalhas. Muita barbearia trabalha com hora marcada pelo WhatsApp ou por aplicativo.",
    pedem: [
      "Experiência ou curso de barbeiro, com os cortes da moda.",
      "Fotos dos seus trabalhos (o Instagram conta como portfólio).",
      "Disponibilidade para o fim da tarde e o sábado, os horários mais cheios.",
    ],
    dica: "Mostre fotos dos seus cortes. Muita barbearia faz um teste na hora, com um cliente ou um modelo.",
    perguntas: [
      {
        p: "Barbeiro trabalha com carteira assinada ou por comissão?",
        r: "Os dois. Há vagas com carteira assinada e há o barbeiro parceiro, que recebe uma parte de cada atendimento, num contrato de parceria com o salão (a Lei do Salão-Parceiro). Vale ver na vaga como é o pagamento.",
      },
    ],
  },
  "ajudante-de-carga-e-descarga": {
    faz: "O ajudante de carga e descarga carrega e descarrega os caminhões, separa e confere os volumes pela nota, organiza a mercadoria no depósito e ajuda nas entregas.",
    pedem: [
      "Disposição para trabalho pesado e para ficar em pé.",
      "Uso dos equipamentos de proteção, como luva e bota.",
      "Muitas vagas são por diária, para começar na hora.",
    ],
    dica: "Esteja disponível para começar logo: muita vaga de carga e descarga é preenchida no mesmo dia. Pontualidade conta mais que experiência.",
    perguntas: [],
  },
};

export function textoDaFuncao(slug: string): TextoDaFuncao | null {
  return TEXTOS_DAS_FUNCOES[slug] ?? null;
}
