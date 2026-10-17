// Modelos prontos para publicar uma vaga em poucos segundos: o título, a descrição, o
// tipo de contratação e um valor para começar (a pessoa ajusta ao caso dela).
//
// Os valores são uma sugestão para Goiânia em 2026, não uma tabela oficial:
//   - salário mínimo nacional de 2026: R$ 1.621 (barbieriadvogados.com)
//   - atendente de balcão em Goiânia: média de R$ 1.719 (salario.com.br, 2026)
//   - servente de obras em Goiás: média de R$ 1.712 por mês (salario.com.br, 2026)
//   - diarista em Goiânia: de R$ 120 a R$ 200 a diária (labra.com.br, 2026)

import type { Beneficio, Categoria, Jornada } from "./constantes";
import type { Regime, Unidade } from "./tipos";

export type ModeloAnuncio = {
  id: string;
  /** o nome no botão */
  nome: string;
  titulo: string;
  descricao: string;
  categoria: Categoria;
  regime: Regime;
  valor: number;
  ate: number | null;
  unidade: Unidade;
  comissao?: boolean;
  jornada?: Jornada;
  beneficios?: Beneficio[];
  pedeCurriculo?: boolean;
};

const CLT: Pick<ModeloAnuncio, "regime" | "unidade" | "beneficios" | "pedeCurriculo"> = {
  regime: "clt",
  unidade: "mes",
  beneficios: ["vale_transporte"],
  pedeCurriculo: true,
};

export const MODELOS_ANUNCIO: ModeloAnuncio[] = [
  {
    id: "atendente",
    nome: "Atendente de balcão",
    titulo: "Atendente de balcão",
    descricao:
      "Procuramos atendente de balcão para atender os clientes, organizar o balcão e ajudar no caixa quando precisar.\n\nNão precisa de experiência: ensinamos no dia a dia. Precisa gostar de atender bem e ser pontual.",
    categoria: "comercio",
    ...CLT,
    valor: 1700,
    ate: 1900,
    jornada: "escala_6x1",
  },
  {
    id: "caixa",
    nome: "Operador(a) de caixa",
    titulo: "Operador(a) de caixa",
    descricao:
      "Vaga de operador(a) de caixa: registrar as compras, receber em dinheiro, cartão e Pix e fechar o caixa no fim do turno.\n\nExperiência com caixa é um ponto a mais, mas não é obrigatória.",
    categoria: "comercio",
    ...CLT,
    valor: 1700,
    ate: 1900,
    jornada: "escala_6x1",
  },
  {
    id: "repositor",
    nome: "Repositor(a)",
    titulo: "Repositor(a) de mercadorias",
    descricao:
      "Procuramos repositor(a) para abastecer as prateleiras, conferir validade e preço e ajudar a receber as mercadorias.\n\nNão precisa de experiência.",
    categoria: "comercio",
    ...CLT,
    valor: 1700,
    ate: 1850,
    jornada: "escala_6x1",
  },
  {
    id: "vendedor",
    nome: "Vendedor(a) de loja",
    titulo: "Vendedor(a) de loja",
    descricao:
      "Vaga de vendedor(a) para atender os clientes na loja, mostrar os produtos, fechar as vendas e cuidar da arrumação.\n\nSalário fixo mais comissão sobre as vendas.",
    categoria: "comercio",
    ...CLT,
    valor: 1700,
    ate: null,
    comissao: true,
    jornada: "escala_6x1",
  },
  {
    id: "cozinha",
    nome: "Auxiliar de cozinha",
    titulo: "Auxiliar de cozinha",
    descricao:
      "Procuramos auxiliar de cozinha para preparar os ingredientes, ajudar no preparo dos pratos e manter a cozinha limpa e organizada.\n\nExperiência em cozinha é um ponto a mais.",
    categoria: "alimentacao",
    ...CLT,
    beneficios: ["vale_transporte", "refeicao_no_local"],
    valor: 1700,
    ate: 1900,
    jornada: "escala_6x1",
  },
  {
    id: "limpeza",
    nome: "Auxiliar de limpeza",
    titulo: "Auxiliar de limpeza",
    descricao:
      "Vaga de auxiliar de limpeza para limpar e organizar os ambientes, banheiros e áreas comuns, e repor os materiais.\n\nNão precisa de experiência.",
    categoria: "limpeza",
    ...CLT,
    valor: 1650,
    ate: 1800,
    jornada: "integral",
  },
  {
    id: "diarista",
    nome: "Diarista 1x por semana",
    titulo: "Diarista uma vez por semana",
    descricao:
      "Procuro diarista para uma faxina por semana em casa: limpeza da casa toda, banheiros, cozinha e passar pano.\n\nCombinamos o dia da semana. Os produtos de limpeza ficam por minha conta.",
    categoria: "limpeza",
    regime: "diaria",
    unidade: "dia",
    valor: 150,
    ate: 200,
    jornada: "flexivel",
  },
  {
    id: "pedreiro",
    nome: "Ajudante de pedreiro",
    titulo: "Ajudante de pedreiro",
    descricao:
      "Procuramos ajudante de pedreiro para obra: preparar massa, carregar material, ajudar no assentamento e limpar a obra no fim do dia.\n\nPagamento por diária.",
    categoria: "construcao",
    regime: "diaria",
    unidade: "dia",
    valor: 100,
    ate: 130,
    jornada: "integral",
  },
  {
    id: "garcom",
    nome: "Garçom para fim de semana",
    titulo: "Garçom ou garçonete para o fim de semana",
    descricao:
      "Precisamos de garçom ou garçonete para atender as mesas no fim de semana: anotar pedidos, servir e cuidar do salão.\n\nPagamento por noite trabalhada.",
    categoria: "alimentacao",
    regime: "freelance",
    unidade: "dia",
    valor: 100,
    ate: 150,
    jornada: "fim_de_semana",
  },
  {
    id: "entregador",
    nome: "Entregador com moto",
    titulo: "Entregador com moto própria",
    descricao:
      "Procuramos entregador com moto própria para levar os pedidos aos clientes da região.\n\nPrecisa ter CNH categoria A e celular com internet.",
    categoria: "logistica",
    regime: "freelance",
    unidade: "dia",
    valor: 100,
    ate: null,
    jornada: "flexivel",
  },
];

// Sem categoria escolhida: a do título, pelas palavras do ofício (se nada bate, "Outros").
const PALAVRAS: [Categoria, RegExp][] = [
  ["alimentacao", /cozinh|chapeir|garç|garcon|pizza|padar|confeit|lanch|churras|bar(man|tender)|copeir|salgad/],
  ["limpeza", /diarist|faxin|limpez|zelador|camareir|passadeir|lavadeir/],
  ["construcao", /pedreir|servente|ajudante de obra|pintor|azulej|gesse|carpint|marceneir|obra|mestre de/],
  ["eletrica-hidraulica", /eletricist|encanador|bombeiro hidr|hidr[aá]ulic/],
  ["logistica", /entregad|motoboy|motorista|ajudante de carga|estoquist|almoxarif|conferent|carregad/],
  ["comercio", /vendedor|atendente|caixa|repositor|balconist|promotor|frentista|loja/],
  ["cuidados", /bab[aá]|cuidador|acompanhante|enfermag|t[eé]cnico de enferm/],
  ["beleza", /cabeleir|manicure|pedicure|barbeir|esteticist|maquiad|depila/],
  ["administrativo", /recepcion|administrativ|secret[aá]ri|auxiliar de escrit|telemarket|atendimento ao cliente/],
  ["seguranca", /porteir|vigia|seguran[cç]a|vigilant/],
  ["jardinagem", /jardin|piscin|ro[cç]ad/],
  ["auto", /mec[aâ]nic|lavador|funilei|borrach|lava.?jato/],
  ["educacao", /professor|aula|monitor|tutor/],
  ["tecnologia", /programad|desenvolved|suporte t[eé]cnico|t[eé]cnico de inform|designer/],
  ["industria", /operador de m[aá]quina|produ[cç][aã]o|costureir|soldador|torneir/],
  ["eventos", /evento|festa|buffet|recrea/],
];

export function categoriaPeloTitulo(titulo: string): Categoria {
  const t = titulo.toLowerCase();
  return PALAVRAS.find(([, r]) => r.test(t))?.[0] ?? "outros";
}

/** A descrição de quem deixou em branco, com o que a pessoa preencheu. */
export function descricaoSimples(d: {
  titulo: string;
  regime: string | null;
  nomeRegime: string | null;
  horario: string | null;
  bairro: string;
  cidade: string;
}) {
  const partes = [
    `Vaga de ${d.titulo.replace(/\.$/, "")} no ${d.bairro}, em ${d.cidade}.`,
    d.nomeRegime ? `Contratação: ${d.nomeRegime.toLowerCase()}.` : null,
    d.horario ? `Horário: ${d.horario}.` : null,
    "Se tiver interesse, é só curtir a vaga: quem publicou vê seu perfil e, se aceitar, vocês conversam.",
  ];
  return partes.filter(Boolean).join("\n\n");
}
