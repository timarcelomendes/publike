// A função (ocupação da CBO 2002) que o título da vaga sugere, sem IA e sem custo: "Auxiliar de cozinha" →
// 513505, "Auxiliar nos serviços de alimentação". É o código que a empresa registra na carteira e o que o Novo
// Caged usa nas contratações (a faixa de salário do mercado vem por ele: claude/plano-salario-e-curriculo.md, parte 2).
// Só as funções mais contratadas no comércio e nos serviços de Goiânia; o resto fica com a IA (src/lib/ia/funcao.ts).
// Ganha a expressão que aparece primeiro no título e, no mesmo lugar, a mais longa ("Atendente de padaria" não é só
// "atendente"). Palavras que servem para várias funções ("pintor", "mecânico", "conferente") só valem com o
// complemento ("pintor de obras"): sem ele, quem decide é a IA. Os nomes são os oficiais da CBO.

// [código, nome oficial, expressões do título (sem acento, em minúsculas, separadas por vírgula)]
const REGRAS: [string, string, string][] = [
  [
    "513505",
    "Auxiliar nos serviços de alimentação",
    "auxiliar de cozinha, ajudante de cozinha, auxiliar de cozinheiro, salgadeiro, salgadeira, auxiliar de confeitaria, auxiliar de confeiteiro, auxiliar de padeiro, ajudante de padeiro, auxiliar de padaria, auxiliar de sushiman",
  ],
  ["513205", "Cozinheiro geral", "cozinheiro, cozinheira"],
  ["513405", "Garçom", "garcom, garcon, garconete"],
  ["513415", "Cumim", "cumim, auxiliar de garcom"],
  [
    "513435",
    "Atendente de lanchonete",
    "atendente de lanchonete, chapeiro, chapeira, chapista, balconista de lanchonete",
  ],
  ["513440", "Barista", "barista"],
  ["513425", "Copeiro", "copeiro, copeira"],
  ["513605", "Churrasqueiro", "churrasqueiro"],
  ["513610", "Pizzaiolo", "pizzaiolo"],
  ["513615", "Sushiman", "sushiman, sushi man"],
  ["848305", "Padeiro", "padeiro, padeira"],
  ["848310", "Confeiteiro", "confeiteiro, confeiteira"],
  ["848510", "Açougueiro", "acougueiro"],
  ["521125", "Repositor de mercadorias", "repositor, repositora"],
  ["421125", "Operador de caixa", "operador de caixa, operadora de caixa, caixa, fiscal de caixa"],
  [
    "521110",
    "Vendedor de comércio varejista",
    "vendedor, vendedora, consultor de vendas, consultora de vendas, vendedor interno, vendedora interna",
  ],
  ["521115", "Promotor de vendas", "promotor de vendas, promotora de vendas, promotor, promotora"],
  [
    "521140",
    "Atendente de lojas e mercados",
    "atendente de loja, atendente de padaria, atendente de balcao, atendente de mercado, atendente, balconista",
  ],
  ["521130", "Atendente de farmácia - balconista", "atendente de farmacia, balconista de farmacia"],
  ["517425", "Fiscal de loja", "fiscal de loja, fiscal de prevencao"],
  ["784105", "Embalador, a mão", "embalador, embaladora, empacotador, empacotadora"],
  ["422105", "Recepcionista, em geral", "recepcionista"],
  ["411005", "Auxiliar de escritório", "auxiliar administrativo, auxiliar de escritorio, auxiliar adm"],
  ["411010", "Assistente administrativo", "assistente administrativo, assistente adm"],
  [
    "422310",
    "Operador de telemarketing ativo e receptivo",
    "operador de telemarketing, operadora de telemarketing, telemarketing",
  ],
  ["414105", "Almoxarife", "almoxarife"],
  ["414125", "Estoquista", "estoquista"],
  ["414140", "Auxiliar de logistica", "auxiliar de logistica, assistente de logistica"],
  ["414120", "Conferente mercadoria (exceto carga e descarga)", "conferente de mercadorias, conferente de loja"],
  ["783210", "Carregador (armazém)", "ajudante de carga, auxiliar de carga e descarga, carregador e descarregador"],
  ["782220", "Operador de empilhadeira", "operador de empilhadeira, operadora de empilhadeira, empilhadeirista"],
  [
    "782510",
    "Motorista de caminhão (rotas regionais e internacionais)",
    "motorista de caminhao, motorista carreteiro, carreteiro, motorista truck",
  ],
  ["782410", "Motorista de ônibus urbano", "motorista de onibus"],
  [
    "782310",
    "Motorista de furgão ou veículo similar",
    "motorista entregador, motorista de entrega, motorista de van, motorista de furgao",
  ],
  ["519110", "Motofretista", "motoboy, motofretista, entregador motociclista, entregador de moto, motoentregador"],
  ["715210", "Pedreiro", "pedreiro"],
  [
    "717020",
    "Servente de obras",
    "servente de obras, servente de pedreiro, ajudante de obras, ajudante de pedreiro, servente",
  ],
  ["716610", "Pintor de obras", "pintor de obras, pintor predial, pintor de paredes"],
  ["715615", "Eletricista de instalações", "eletricista"],
  ["724110", "Encanador", "encanador, bombeiro hidraulico"],
  ["715505", "Carpinteiro", "carpinteiro"],
  ["715315", "Armador de estrutura de concreto armado", "armador de ferragens, armador de ferro"],
  ["724440", "Serralheiro", "serralheiro"],
  ["514320", "Faxineiro", "faxineira, faxineiro, auxiliar de limpeza, ajudante de limpeza, servente de limpeza"],
  ["512120", "Empregado doméstico diarista", "diarista"],
  ["512105", "Empregado doméstico nos serviços gerais", "empregada domestica, empregado domestico, domestica"],
  ["514120", "Zelador de edifício", "zelador, zeladora"],
  ["513315", "Camareiro de hotel", "camareira, camareiro"],
  ["516305", "Lavadeiro, em geral", "lavadeira, lavadeiro"],
  [
    "516210",
    "Cuidador de idosos",
    "cuidador de idosos, cuidadora de idosos, cuidador, cuidadora, acompanhante de idoso",
  ],
  ["516205", "Babá", "baba"],
  ["322205", "Técnico de enfermagem", "tecnico de enfermagem, tecnica de enfermagem"],
  ["322230", "Auxiliar de enfermagem", "auxiliar de enfermagem"],
  ["516120", "Manicure", "manicure, pedicure"],
  ["516110", "Cabeleireiro", "cabeleireiro, cabeleireira"],
  ["516105", "Barbeiro", "barbeiro"],
  ["322130", "Esteticista", "esteticista"],
  [
    "784205",
    "Alimentador de linha de produção",
    "auxiliar de producao, ajudante de producao, operador de producao, operadora de producao, alimentador de linha",
  ],
  ["724315", "Soldador", "soldador"],
  ["763215", "Costureiro, a máquina na confecção em série", "costureira, costureiro"],
  ["517410", "Porteiro de edifícios", "porteiro, porteira"],
  ["517420", "Vigia", "vigia"],
  ["517330", "Vigilante", "vigilante"],
  [
    "914405",
    "Mecânico de manutenção de automóveis, motocicletas e veículos similares",
    "mecanico de automoveis, mecanico automotivo, mecanico de carros, mecanico de motos",
  ],
  ["519935", "Lavador de veículos", "lavador de carros, lavador de veiculos, lava jato"],
  ["521135", "Frentista", "frentista"],
  ["992115", "Borracheiro", "borracheiro"],
  ["622010", "Jardineiro", "jardineiro"],
  ["514330", "Limpador de piscinas", "piscineiro"],
  ["514310", "Auxiliar de manutenção predial", "auxiliar de manutencao, auxiliar de manutencao predial"],
];

export type FuncaoSugerida = { cbo: string; nome: string };

/** A função no formulário da vaga: de onde veio (a regra do título, a IA ou a escolha de quem publica). */
export type FuncaoParaForm = FuncaoSugerida & { origem: "regra" | "ia" | "empresa" };

/** "Mecânico — Jardim Goiás" → " mecanico jardim goias " (com espaço nas pontas, para achar a expressão inteira). */
function normalizar(texto: string) {
  return ` ${texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

const EXPRESSOES = REGRAS.flatMap(([cbo, nome, lista]) =>
  lista.split(",").map((e) => ({ cbo, nome, busca: ` ${e.trim()} ` })),
);

const NOMES = new Map(REGRAS.map(([cbo, nome]) => [cbo, nome]));

/** A função que o título sugere, ou null (aí a IA tenta, pela lista da CBO). */
export function funcaoPeloTitulo(titulo: string | null | undefined): FuncaoSugerida | null {
  if (!titulo?.trim()) return null;
  const t = normalizar(titulo);
  let melhor: { cbo: string; nome: string; onde: number; tamanho: number } | null = null;
  for (const e of EXPRESSOES) {
    const onde = t.indexOf(e.busca);
    if (onde < 0) continue;
    if (!melhor || onde < melhor.onde || (onde === melhor.onde && e.busca.length > melhor.tamanho))
      melhor = { cbo: e.cbo, nome: e.nome, onde, tamanho: e.busca.length };
  }
  return melhor ? { cbo: melhor.cbo, nome: melhor.nome } : null;
}

/** O nome de uma função das regras (as mais comuns), sem carregar a CBO inteira; null se não for uma delas. */
export function nomeDaFuncaoComum(cbo: string) {
  return NOMES.get(cbo) ?? null;
}

/** "513505" → "5135-05", como aparece na carteira. */
export function codigoCbo(cbo: string) {
  return `${cbo.slice(0, 4)}-${cbo.slice(4)}`;
}
