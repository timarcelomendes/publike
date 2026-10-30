import type { Categoria } from "./constantes";

// A área que o título (e a descrição) da vaga sugere, sem IA e sem custo: "Auxiliar de cozinha" → Alimentação.
// Serve para o formulário sugerir quando a pessoa deixa em "Outros" e para o admin arrumar as que já estão no ar.
// Ganha a palavra que aparece primeiro ("Faxineira para escritório" é Limpeza) e, no mesmo lugar, a mais longa
// ("torneiro mecânico" é Indústria, não Carros); a palavra vale também com o
// fim mudado ("cozinh" pega cozinha e cozinheiro, "pizzaria" pega pizza), menos as de 3 letras ou menos ("ti"),
// que só valem inteiras. O título pesa mais que a descrição (só se o título não disser nada a descrição conta).

// as palavras de cada área, separadas por vírgula (sem acento, em minúsculas)
const PALAVRAS: Record<Exclude<Categoria, "outros">, string> = {
  alimentacao:
    "cozinha, cozinheiro, cozinheira, garcom, garcon, padaria, padeiro, confeiteiro, confeiteira, chapeiro, pizzaiolo, churrasqueiro, lanchonete, restaurante, copeiro, copeira, barista, sushiman, acougueiro, acougue, salgadeira, salgadeiro, bartender, barman, pizza, atendente de lanchonete, auxiliar de cozinha",
  comercio:
    "vendedor, vendedora, vendas, caixa, repositor, repositora, operador de caixa, balconista, promotor, promotora, consultor de vendas, consultora de vendas, atendente de loja, loja, comercial, representante comercial, fiscal de loja, embalador, empacotador, atendente",
  administrativo:
    "recepcao, recepcionista, telemarketing, auxiliar administrativo, assistente administrativo, administrativo, secretaria, secretario, departamento pessoal, recursos humanos, atendimento ao cliente, sac, escritorio, jovem aprendiz, aprendiz, auxiliar de escritorio",
  financeiro:
    "financeiro, financeira, auxiliar financeiro, assistente financeiro, faturamento, fiscal, analista fiscal, contabil, contabilidade, auxiliar contabil, contador, contadora, cobranca, tesouraria, contas a pagar, contas a receber",
  logistica:
    "motorista, entregador, entregadora, motoboy, estoque, estoquista, almoxarife, almoxarifado, conferente, carregador, ajudante de carga, logistica, expedicao, inventario, rodotrem, caminhao, carreteiro, operador de empilhadeira, empilhadeira",
  construcao:
    "pedreiro, servente, servente de obras, mestre de obras, pintor, azulejista, gesseiro, carpinteiro, armador, obra, ajudante de obra, reforma, marceneiro, serralheiro, vidraceiro",
  "eletrica-hidraulica": "eletricista, encanador, bombeiro hidraulico, hidraulica, eletrica, instalador eletrico",
  limpeza:
    "faxina, faxineira, faxineiro, diarista, domestica, zelador, zeladora, limpeza, auxiliar de limpeza, passadeira, lavadeira, lavanderia, governanta",
  cuidados: "cuidador, cuidadora, baba, acompanhante de idoso",
  saude:
    "tecnico de enfermagem, auxiliar de enfermagem, enfermagem, enfermeira, enfermeiro, farmacia, farmaceutico, farmaceutica, balconista de farmacia, atendente de farmacia, drogaria, auxiliar de saude bucal, dentista, consultorio, clinica, fisioterapeuta, psicologo, psicologa, nutricionista, tecnico de radiologia, laboratorio, hospital, recepcionista de clinica",
  beleza:
    "cabeleireiro, cabeleireira, manicure, pedicure, barbeiro, esteticista, maquiadora, depiladora, designer de sobrancelha, salao, barbearia",
  educacao: "professor, professora, monitor, monitora, auxiliar de sala, pedagoga, tutor, aulas",
  esporte:
    "personal trainer, educador fisico, professor de educacao fisica, academia, instrutor de musculacao, professor de natacao, natacao, recepcionista de academia, treinador, treinadora",
  tecnologia:
    "programador, desenvolvedor, suporte tecnico, suporte, ti, informatica, software, internet, redes, analista de sistemas, tecnico de informatica",
  marketing:
    "marketing, social media, designer, designer grafico, fotografo, fotografa, videomaker, editor de video, redator, redatora, publicidade, trafego pago, copywriter",
  industria:
    "operador de maquina, producao, auxiliar de producao, torneiro, torneiro mecanico, soldador, metalurgico, fresador, industria, fabrica, montador, operador de producao",
  moda: "costureira, costureiro, costura, modelista, overloquista, bordadeira, alfaiate, confeccao, arremate, cortador de tecido",
  agro: "trabalhador rural, rural, fazenda, tratorista, operador de colheitadeira, colheita, caseiro, retireiro, vaqueiro, agronomo, agricola, agropecuaria, granja, ordenhador",
  eventos: "buffet, eventos, festa, festas, recreador, recreadora, dj",
  hotelaria: "hotel, pousada, motel, camareira, recepcionista de hotel, mensageiro, guia de turismo, turismo",
  jardinagem: "jardineiro, jardinagem, piscineiro, piscina, paisagista, rocador",
  pets: "banho e tosa, tosador, tosadora, banhista, pet shop, petshop, pet, passeador de caes, veterinario, veterinaria, auxiliar veterinario, adestrador",
  auto: "mecanico, mecanico diesel, lavador, lavador de carros, lava jato, funileiro, borracheiro, frentista, auto eletrica, autoeletrica, pintor automotivo, polidor, oficina",
  seguranca: "porteiro, portaria, vigia, vigilante, seguranca, controlador de acesso",
  manutencao:
    "tecnico de manutencao, manutencao, auxiliar de manutencao, montador de moveis, chaveiro, tecnico de refrigeracao, refrigeracao, ar condicionado, conserto, tecnico de celular, assistencia tecnica, marido de aluguel, tecnico de eletrodomesticos",
};

/** "Mecânico — Jardim Goiás" → "mecanico jardim goias": minúsculas, sem acento, só letras e espaço. */
export function normalizarTexto(t: string) {
  return ` ${t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

const LISTA = Object.entries(PALAVRAS)
  .flatMap(([cat, palavras]) => palavras.split(", ").map((p) => ({ cat: cat as Categoria, p: ` ${p} ` })))
  .sort((a, b) => b.p.length - a.p.length);

function doTexto(texto: string): Categoria | null {
  const t = normalizarTexto(texto);
  let melhor: { cat: Categoria; onde: number } | null = null;
  // a LISTA vem da mais longa para a mais curta: no mesmo lugar, fica a primeira (a mais longa)
  for (const { cat, p } of LISTA) {
    const onde = t.indexOf(p.length <= 5 ? p : p.trimEnd());
    if (onde >= 0 && (!melhor || onde < melhor.onde)) melhor = { cat, onde };
  }
  return melhor?.cat ?? null;
}

/** A área sugerida pelo título (e, se ele não disser nada, pela descrição), ou null. */
export function categoriaSugerida(titulo: string, descricao = ""): Categoria | null {
  return doTexto(titulo) ?? (descricao ? doTexto(descricao.slice(0, 1000)) : null);
}
