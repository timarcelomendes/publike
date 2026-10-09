import "server-only";
import type { Filtros } from "./filtros";
import { chaveBairro, chavesDaRegiao, type Local } from "./regioes";
import type { AnuncioCompleto, AnuncioDoPerfil, AnuncioResumo, AvaliacaoPublica, Perfil } from "./tipos";

// Dados de exemplo para o modo demonstração (sem Supabase configurado).
// Pessoas e empresas fictícias, só para ver o site funcionando.

const HORA = 3600 * 1000;
const DIA = 24 * HORA;

type AutorDemo = Omit<Perfil, "criado_em"> & { diasNoPublike: number };

const AUTORES: AutorDemo[] = [
  { id: "demo-cozinha-da-vila", nome: "Cozinha da Vila", tipo: "comercio", verificado: true, cidade: "Goiânia", bairro: "Setor Bueno", sobre: "Restaurante de comida caseira, almoço e jantar.", servicos: [], foto: null, diasNoPublike: 120 },
  { id: "demo-buffet-ipe", nome: "Buffet Ipê Amarelo", tipo: "empresa", verificado: true, cidade: "Goiânia", bairro: "Jardim Goiás", sobre: "Casamentos, formaturas e aniversários.", servicos: [], foto: null, diasNoPublike: 300 },
  { id: "demo-luciana", nome: "Luciana M.", tipo: "pessoa", verificado: false, cidade: "Goiânia", bairro: "Setor Oeste", sobre: null, servicos: [], foto: null, diasNoPublike: 20 },
  { id: "demo-calcados-centro", nome: "Calçados do Centro", tipo: "comercio", verificado: false, cidade: "Goiânia", bairro: "Setor Central", sobre: "Loja de calçados na Avenida Goiás.", servicos: [], foto: null, diasNoPublike: 60 },
  { id: "demo-maria", nome: "Maria Aparecida", tipo: "pessoa", verificado: false, cidade: "Goiânia", bairro: "Jardim América", sobre: null, servicos: [], foto: null, diasNoPublike: 5 },
  { id: "demo-distribuidora", nome: "Distribuidora Cerrado", tipo: "empresa", verificado: true, cidade: "Goiânia", bairro: "Campinas", sobre: "Distribuição de bebidas e alimentos.", servicos: [], foto: null, diasNoPublike: 400 },
  { id: "demo-clinica", nome: "Clínica Bem Cuidar", tipo: "empresa", verificado: true, cidade: "Goiânia", bairro: "Setor Marista", sobre: "Clínica de odontologia e fisioterapia.", servicos: [], foto: null, diasNoPublike: 90 },
  { id: "demo-antonio", nome: "Antônio R.", tipo: "pessoa", verificado: false, cidade: "Goiânia", bairro: "Parque Amazônia", sobre: null, servicos: [], foto: null, diasNoPublike: 3 },
  { id: "demo-padaria", nome: "Padaria Pão Quente", tipo: "comercio", verificado: false, cidade: "Goiânia", bairro: "Setor Pedro Ludovico", sobre: "Padaria e confeitaria do bairro.", servicos: [], foto: null, diasNoPublike: 45 },
  { id: "demo-rita", nome: "Rita S.", tipo: "pessoa", verificado: false, cidade: "Goiânia", bairro: "Setor Sul", sobre: null, servicos: [], foto: null, diasNoPublike: 12 },
  { id: "demo-construtora", nome: "Construtora Morada", tipo: "empresa", verificado: true, cidade: "Aparecida de Goiânia", bairro: "Setor Garavelo", sobre: "Obras residenciais em Aparecida e Goiânia.", servicos: [], foto: null, diasNoPublike: 200 },
  { id: "demo-ricardo", nome: "Ricardo P.", tipo: "pessoa", verificado: false, cidade: "Senador Canedo", bairro: "Centro", sobre: null, servicos: [], foto: null, diasNoPublike: 30 },
  { id: "demo-salao", nome: "Salão Flor do Cerrado", tipo: "comercio", verificado: false, cidade: "Goiânia", bairro: "Setor Universitário", sobre: "Cabelo, unhas e sobrancelha.", servicos: [], foto: null, diasNoPublike: 70 },
  { id: "demo-diego", nome: "Diego F.", tipo: "pessoa", verificado: false, cidade: "Goiânia", bairro: "Jardim Novo Mundo", sobre: null, servicos: [], foto: null, diasNoPublike: 8 },
  { id: "demo-condominio", nome: "Condomínio Parque das Flores", tipo: "empresa", verificado: false, cidade: "Goiânia", bairro: "Setor Bueno", sobre: null, servicos: [], foto: null, diasNoPublike: 150 },
  { id: "demo-patricia", nome: "Patrícia L.", tipo: "pessoa", verificado: false, cidade: "Trindade", bairro: "Centro", sobre: "DJ há 8 anos em festas de 15 anos, casamentos e formaturas.", servicos: [], foto: null, diasNoPublike: 15 },
  { id: "demo-joana", nome: "Joana S.", tipo: "pessoa", verificado: true, cidade: "Goiânia", bairro: "Setor Bela Vista", sobre: "Diarista há 12 anos. Caprichosa e pontual.", servicos: [], foto: null, diasNoPublike: 40 },
  { id: "demo-marcos", nome: "Marcos Eletricista", tipo: "pessoa", verificado: false, cidade: "Goiânia", bairro: "Jardim América", sobre: null, servicos: [], foto: null, diasNoPublike: 25 },
];

type Base = {
  id: string;
  autor: string;
  tipo: "vaga" | "servico";
  titulo: string;
  descricao: string;
  categoria: string;
  regime: string | null;
  valor: number | null;
  unidade: string | null;
  beneficios?: string;
  horario?: string;
  vagas?: number;
  /** serviço */
  oficio?: string;
  atende?: string[];
  cidade: string;
  bairro: string;
  lat: number;
  lng: number;
  horasAtras: number;
};

const BASE: Base[] = [
  {
    id: "demo-01", autor: "demo-cozinha-da-vila", tipo: "vaga", categoria: "alimentacao", regime: "clt",
    titulo: "Auxiliar de cozinha para o turno da noite",
    descricao: "Procuramos auxiliar de cozinha para ajudar no preparo e na organização da cozinha no jantar.\n\nNão precisa ter experiência em restaurante, mas é importante gostar de cozinhar e ser caprichoso com a limpeza. Ensinamos tudo por aqui.\n\nOferecemos refeição no local, vale-transporte e folga semanal.",
    valor: 1900, unidade: "mes", beneficios: "vale-transporte", horario: "Ter a dom, das 16h à meia-noite", vagas: 2,
    cidade: "Goiânia", bairro: "Setor Bueno", lat: -16.7075, lng: -49.27, horasAtras: 2,
  },
  {
    id: "demo-02", autor: "demo-buffet-ipe", tipo: "vaga", categoria: "eventos", regime: "diaria",
    titulo: "Garçom para casamento no sábado",
    descricao: "Precisamos de garçons para um casamento com 250 convidados. Roupa social preta; o buffet fornece o avental.\n\nÉ bom ter experiência com bandeja e serviço à francesa.",
    valor: 180, unidade: "dia", beneficios: "jantar e transporte na volta", horario: "Sábado, das 17h às 2h", vagas: 8,
    cidade: "Goiânia", bairro: "Jardim Goiás", lat: -16.705, lng: -49.237, horasAtras: 5,
  },
  {
    id: "demo-03", autor: "demo-luciana", tipo: "vaga", categoria: "limpeza", regime: "freelance",
    titulo: "Faxina em apartamento de 2 quartos",
    descricao: "Preciso de faxina completa no apartamento: cozinha, dois banheiros, janelas e área de serviço. O material de limpeza fica por minha conta.",
    valor: 200, unidade: "servico", horario: "Qualquer dia desta semana, de manhã",
    cidade: "Goiânia", bairro: "Setor Oeste", lat: -16.68, lng: -49.27, horasAtras: 26,
  },
  {
    id: "demo-04", autor: "demo-calcados-centro", tipo: "vaga", categoria: "comercio", regime: "clt",
    titulo: "Vendedor ou vendedora de loja de calçados",
    descricao: "Vaga para atendimento no balcão e no estoque da loja. Buscamos alguém comunicativo, que goste de vender e tenha disponibilidade aos sábados.",
    valor: 1750, unidade: "mes", beneficios: "comissão", horario: "Seg a sáb, horário comercial", vagas: 1,
    cidade: "Goiânia", bairro: "Setor Central", lat: -16.675, lng: -49.255, horasAtras: 30,
  },
  {
    id: "demo-05", autor: "demo-maria", tipo: "vaga", categoria: "eletrica-hidraulica", regime: "freelance",
    titulo: "Eletricista para trocar a fiação da cozinha",
    descricao: "A tomada da cozinha esquenta e o disjuntor cai quando ligo o micro-ondas. Preciso de alguém para olhar, trocar a fiação e instalar mais duas tomadas.",
    valor: null, unidade: null, horario: "Pode ser no fim de semana",
    cidade: "Goiânia", bairro: "Jardim América", lat: -16.715, lng: -49.285, horasAtras: 3,
  },
  {
    id: "demo-06", autor: "demo-distribuidora", tipo: "vaga", categoria: "logistica", regime: "temporario",
    titulo: "Ajudante de entregas para o fim de ano",
    descricao: "Contrato temporário de dezembro a fevereiro para ajudar o motorista nas entregas em mercados e bares. Carregar e descarregar caixas, conferir notas.\n\nPrecisa ter mais de 18 anos.",
    valor: 1600, unidade: "mes", beneficios: "café da manhã", horario: "Seg a sáb, das 6h às 14h", vagas: 4,
    cidade: "Goiânia", bairro: "Campinas", lat: -16.67, lng: -49.29, horasAtras: 50,
  },
  {
    id: "demo-07", autor: "demo-clinica", tipo: "vaga", categoria: "administrativo", regime: "estagio",
    titulo: "Estágio em recepção de clínica",
    descricao: "Para estudantes de administração, secretariado ou cursos da saúde. Atendimento ao paciente, agenda e organização da recepção.",
    valor: 900, unidade: "mes", beneficios: "vale-transporte", horario: "Seg a sex, das 7h às 13h", vagas: 1,
    cidade: "Goiânia", bairro: "Setor Marista", lat: -16.695, lng: -49.26, horasAtras: 75,
  },
  {
    id: "demo-08", autor: "demo-antonio", tipo: "servico", categoria: "construcao", regime: null, oficio: "pedreiro",
    titulo: "Pedreiro: reboco, contrapiso e muro",
    descricao: "Faço reboco, contrapiso, assentamento de piso e muro. Trabalho há 15 anos com obra e reforma pequena.\n\nVou até o local para ver o serviço e passar o orçamento sem compromisso. Levo as minhas ferramentas.",
    valor: 180, unidade: "dia", horario: "Seg a sáb, das 7h às 17h",
    atende: ["Goiânia: Sul", "Goiânia: Sudoeste", "Aparecida de Goiânia"],
    cidade: "Goiânia", bairro: "Parque Amazônia", lat: -16.74, lng: -49.28, horasAtras: 6,
  },
  {
    id: "demo-09", autor: "demo-padaria", tipo: "vaga", categoria: "tecnologia", regime: "freelance",
    titulo: "Montar cardápio digital e página da padaria",
    descricao: "Queremos um cardápio digital com QR code nas mesas e uma página simples com nossos produtos e horários. Trabalho pontual; combinamos o prazo.",
    valor: 800, unidade: "servico",
    cidade: "Goiânia", bairro: "Setor Pedro Ludovico", lat: -16.715, lng: -49.25, horasAtras: 98,
  },
  {
    id: "demo-10", autor: "demo-rita", tipo: "vaga", categoria: "cuidados", regime: "diaria",
    titulo: "Cuidadora para idosa, três noites por semana",
    descricao: "Minha mãe tem 84 anos e precisa de companhia à noite, ajuda para ir ao banheiro e para tomar os remédios. Ela é tranquila e dorme bem.",
    valor: 150, unidade: "dia", horario: "Seg, qua e sex, das 20h às 7h",
    cidade: "Goiânia", bairro: "Setor Sul", lat: -16.69, lng: -49.255, horasAtras: 20,
  },
  {
    id: "demo-11", autor: "demo-construtora", tipo: "vaga", categoria: "construcao", regime: "diaria",
    titulo: "Servente de obra",
    descricao: "Diárias em obra residencial. Ajudar o pedreiro, preparar massa e organizar o canteiro. Equipamento de proteção por nossa conta.",
    valor: 120, unidade: "dia", beneficios: "almoço", horario: "Seg a sex, das 7h às 17h", vagas: 3,
    cidade: "Aparecida de Goiânia", bairro: "Setor Garavelo", lat: -16.79, lng: -49.3, horasAtras: 8,
  },
  {
    id: "demo-12", autor: "demo-ricardo", tipo: "servico", categoria: "jardinagem", regime: null, oficio: "piscineiro",
    titulo: "Limpeza de piscina e jardim",
    descricao: "Limpo e trato piscina, corto grama e faço a manutenção do jardim em casas e chácaras. Atendo por visita ou com contrato mensal (a cada 15 dias).",
    valor: 120, unidade: "visita", horario: "Seg a sáb",
    atende: ["Senador Canedo", "Goiânia: Leste"],
    cidade: "Senador Canedo", bairro: "Centro", lat: -16.705, lng: -49.095, horasAtras: 52,
  },
  {
    id: "demo-13", autor: "demo-salao", tipo: "vaga", categoria: "beleza", regime: "pj",
    titulo: "Manicure para salão no Setor Universitário",
    descricao: "Salão com clientela fixa procura manicure. Ambiente tranquilo e agenda cheia de quinta a sábado. Trabalhamos com porcentagem.",
    valor: null, unidade: null, beneficios: "50% de comissão", horario: "Ter a sáb", vagas: 1,
    cidade: "Goiânia", bairro: "Setor Universitário", lat: -16.68, lng: -49.24, horasAtras: 31,
  },
  {
    id: "demo-14", autor: "demo-diego", tipo: "servico", categoria: "auto", regime: null, oficio: "mecanico",
    titulo: "Mecânico de motos, vou até você",
    descricao: "Freio, embreagem, troca de óleo, corrente e revisão de moto. Atendo em casa ou no trabalho, com as ferramentas. Peças com nota.",
    valor: 80, unidade: "visita",
    atende: ["Goiânia: Leste", "Goiânia: Centro"],
    cidade: "Goiânia", bairro: "Jardim Novo Mundo", lat: -16.675, lng: -49.205, horasAtras: 12,
  },
  {
    id: "demo-15", autor: "demo-condominio", tipo: "vaga", categoria: "seguranca", regime: "clt",
    titulo: "Porteiro noturno 12x36",
    descricao: "Condomínio residencial procura porteiro para a escala noturna. Precisa ter curso de porteiro ou experiência comprovada.",
    valor: 1850, unidade: "mes", beneficios: "vale-alimentação", horario: "Escala 12x36, das 19h às 7h", vagas: 1,
    cidade: "Goiânia", bairro: "Setor Bueno", lat: -16.71, lng: -49.265, horasAtras: 100,
  },
  {
    id: "demo-16", autor: "demo-patricia", tipo: "servico", categoria: "eventos", regime: null, oficio: "dj",
    titulo: "DJ com som e iluminação",
    descricao: "Som, iluminação e playlist do jeito da festa: 15 anos, casamento, formatura e aniversário. Levo todo o equipamento e monto antes dos convidados chegarem.",
    valor: 600, unidade: "servico", horario: "Sexta, sábado e domingo",
    atende: ["Trindade", "Goiânia"],
    cidade: "Trindade", bairro: "Centro", lat: -16.65, lng: -49.49, horasAtras: 120,
  },
  {
    id: "demo-17", autor: "demo-joana", tipo: "servico", categoria: "limpeza", regime: null, oficio: "diarista",
    titulo: "Diarista: faxina completa",
    descricao: "Faxina completa em casa e apartamento: cozinha, banheiros, janelas e passar roupa. Levo os produtos se você preferir (combinamos antes).",
    valor: 160, unidade: "dia", horario: "Seg a sex, das 8h às 17h",
    atende: ["Goiânia: Sul", "Goiânia: Centro"],
    cidade: "Goiânia", bairro: "Setor Bela Vista", lat: -16.714, lng: -49.262, horasAtras: 4,
  },
  {
    id: "demo-18", autor: "demo-marcos", tipo: "servico", categoria: "eletrica-hidraulica", regime: null, oficio: "eletricista",
    titulo: "Eletricista residencial",
    descricao: "Troca de fiação, tomadas, disjuntores, chuveiro e instalação de ventilador de teto. Vejo o problema e passo o orçamento na hora.",
    valor: 100, unidade: "visita",
    atende: ["Goiânia: Sul", "Goiânia: Oeste"],
    cidade: "Goiânia", bairro: "Jardim América", lat: -16.712, lng: -49.287, horasAtras: 9,
  },
  {
    id: "demo-19", autor: "demo-antonio", tipo: "servico", categoria: "construcao", regime: null, oficio: "pintor",
    titulo: "Pintura de casas e muros",
    descricao: "Pinto paredes internas e externas, muros, grades e portões. Faço a massa corrida e deixo tudo limpo no fim do serviço.",
    valor: 25, unidade: "m2", horario: "Seg a sáb, das 7h às 17h",
    atende: ["Goiânia: Sul", "Goiânia: Sudoeste", "Aparecida de Goiânia"],
    cidade: "Goiânia", bairro: "Parque Amazônia", lat: -16.74, lng: -49.28, horasAtras: 6,
  },
];

/** Avaliações de exemplo (só de serviços). */
const AVALIACOES: { profissional: string; anuncio: string; nota: number; quem: string; dias: number; comentario?: string; resposta?: string }[] = [
  { profissional: "demo-antonio", anuncio: "demo-08", nota: 5, quem: "Rita", dias: 3, comentario: "Rebocou o muro em dois dias e deixou tudo limpo. Recomendo.", resposta: "Obrigado, Rita! Foi um prazer." },
  { profissional: "demo-antonio", anuncio: "demo-19", nota: 5, quem: "Maria", dias: 12, comentario: "Pintura caprichada, cumpriu o prazo." },
  { profissional: "demo-antonio", anuncio: "demo-08", nota: 4, quem: "Diego", dias: 30, comentario: "Bom serviço. Atrasou meio dia, mas avisou antes." },
  { profissional: "demo-joana", anuncio: "demo-17", nota: 5, quem: "Luciana", dias: 2, comentario: "A casa ficou brilhando. Já marquei de novo." },
  { profissional: "demo-joana", anuncio: "demo-17", nota: 5, quem: "Patrícia", dias: 9 },
  { profissional: "demo-joana", anuncio: "demo-17", nota: 4, quem: "Ricardo", dias: 20, comentario: "Muito educada e rápida." },
  { profissional: "demo-joana", anuncio: "demo-17", nota: 5, quem: "Antônio", dias: 41, comentario: "Pontual e de confiança." },
  { profissional: "demo-marcos", anuncio: "demo-18", nota: 5, quem: "Joana", dias: 6, comentario: "Resolveu o chuveiro em meia hora." },
];

export function notaDemo(profissional: string) {
  const lista = AVALIACOES.filter((a) => a.profissional === profissional);
  if (!lista.length) return { media: null, total: 0 };
  const media = Math.round((lista.reduce((t, a) => t + a.nota, 0) / lista.length) * 10) / 10;
  return { media, total: lista.length };
}

export function avaliacoesDemo(profissional: string, agora: number): AvaliacaoPublica[] {
  return AVALIACOES.map((a, i) => ({ ...a, i }))
    .filter((a) => a.profissional === profissional)
    .map((a) => ({
      id: a.i + 1,
      nota: a.nota,
      comentario: a.comentario ?? null,
      titulo_servico: BASE.find((b) => b.id === a.anuncio)?.titulo ?? "",
      anuncio_id: a.anuncio,
      criado_em: new Date(agora - a.dias * DIA).toISOString(),
      autor_nome: a.quem,
      autor_foto: null,
      resposta: a.resposta ?? null,
      respondida_em: a.resposta ? new Date(agora - (a.dias - 1) * DIA).toISOString() : null,
    }));
}

function aproximar(n: number) {
  return Math.round(n / 0.005) * 0.005;
}

function distanciaKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

function semAcento(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function autor(id: string) {
  return AUTORES.find((a) => a.id === id) ?? AUTORES[0];
}

function completo(b: Base, agora: number): AnuncioCompleto {
  const a = autor(b.autor);
  const criado = new Date(agora - b.horasAtras * HORA).toISOString();
  return {
    id: b.id,
    autor_id: a.id,
    tipo: b.tipo,
    titulo: b.titulo,
    descricao: b.descricao,
    categoria: b.categoria,
    regime: b.regime,
    pagamento_valor: b.valor,
    pagamento_unidade: b.unidade,
    beneficios: b.beneficios ?? null,
    horario: b.horario ?? null,
    vagas: b.vagas ?? 1,
    cidade: b.cidade,
    bairro: b.bairro,
    lat: aproximar(b.lat),
    lng: aproximar(b.lng),
    status: "ativo",
    criado_em: criado,
    atualizado_em: criado,
    expira_em: new Date(agora - b.horasAtras * HORA + (b.tipo === "servico" ? 90 : 30) * DIA).toISOString(),
    autor_nome: a.nome,
    autor_tipo: a.tipo,
    autor_foto: a.foto,
    autor_verificado: a.verificado,
    autor_desde: new Date(agora - a.diasNoPublike * DIA).toISOString(),
    minha_curtida: null,
    minha_mensagem: null,
    oficio: b.oficio ?? null,
    fotos: [],
    atende: b.atende ?? [],
    // na demonstração, CLT e estágio pedem currículo
    pede_curriculo: b.tipo === "vaga" && (b.regime === "clt" || b.regime === "estagio"),
  };
}

function resumo(c: AnuncioCompleto, lat: number, lng: number): AnuncioResumo {
  return {
    id: c.id,
    tipo: c.tipo,
    titulo: c.titulo,
    categoria: c.categoria,
    regime: c.regime,
    pagamento_valor: c.pagamento_valor,
    pagamento_unidade: c.pagamento_unidade,
    beneficios: c.beneficios,
    cidade: c.cidade,
    bairro: c.bairro,
    lat: c.lat,
    lng: c.lng,
    distancia_km: Math.round(distanciaKm(lat, lng, c.lat, c.lng) * 10) / 10,
    criado_em: c.criado_em,
    autor_id: c.autor_id,
    autor_nome: c.autor_nome,
    autor_tipo: c.autor_tipo,
    autor_verificado: c.autor_verificado,
    minha_curtida: null,
    prioridade: 3,
    oficio: c.oficio,
    foto: c.fotos[0] ?? null,
    autor_nota: c.tipo === "servico" ? notaDemo(c.autor_id).media : null,
    autor_avaliacoes: c.tipo === "servico" ? notaDemo(c.autor_id).total : 0,
  };
}

/** A mesma regra do banco: 0 no bairro, 1 na região, 2 na cidade, 3 o resto. */
/** Serviço que atende onde a pessoa mora: a região ("Goiânia: Sul") ou a cidade inteira. */
function atendeOnde(atende: readonly string[], local: Local) {
  const area = local.regiao ? `Goiânia: ${local.regiao}` : null;
  return { regiao: area !== null && atende.includes(area), cidade: atende.includes(local.cidade) };
}

function prioridade(a: AnuncioResumo, local: Local | null) {
  if (!local) return 3;
  const atende = atendeOnde(BASE.find((x) => x.id === a.id)?.atende ?? [], local);
  const mesmaCidade = a.cidade === local.cidade;
  const chave = chaveBairro(a.bairro);
  if (mesmaCidade && local.bairro && chave === chaveBairro(local.bairro)) return 0;
  if (mesmaCidade && local.regiao && chavesDaRegiao(local.regiao).includes(chave)) return 1;
  if (a.tipo === "servico" && atende.regiao) return 1;
  if (mesmaCidade || (a.tipo === "servico" && atende.cidade)) return 2;
  return 3;
}

function atendeQuemMora(a: AnuncioResumo, local: Local | null) {
  if (!local || a.tipo !== "servico") return false;
  const atende = atendeOnde(BASE.find((x) => x.id === a.id)?.atende ?? [], local);
  return atende.regiao || atende.cidade;
}

export function buscarDemo(f: Filtros, agora: number, local: Local | null = null): AnuncioResumo[] {
  const termo = semAcento(f.q.trim());
  const lista = BASE.map((b) => resumo(completo(b, agora), f.lat, f.lng))
    .map((a) => ({ ...a, prioridade: prioridade(a, local) }))
    .filter((a) => a.distancia_km <= f.raio || atendeQuemMora(a, local))
    .filter((a) => !f.tipo || a.tipo === f.tipo)
    .filter((a) => !f.categoria || a.categoria === f.categoria)
    .filter((a) => !f.regime || a.regime === f.regime)
    .filter((a) => {
      if (!termo) return true;
      const b = BASE.find((x) => x.id === a.id);
      return semAcento(`${a.titulo} ${b?.descricao ?? ""} ${a.bairro}`).includes(termo);
    });
  lista.sort((x, y) =>
    x.prioridade - y.prioridade ||
    (f.ordem === "recentes"
      ? y.criado_em.localeCompare(x.criado_em)
      : x.distancia_km - y.distancia_km || y.criado_em.localeCompare(x.criado_em)),
  );
  return lista.slice(0, 60);
}

export function obterAnuncioDemo(id: string, agora: number): AnuncioCompleto | null {
  const b = BASE.find((x) => x.id === id);
  return b ? completo(b, agora) : null;
}

export function perfilDemo(id: string, agora: number): Perfil | null {
  const a = AUTORES.find((x) => x.id === id);
  if (!a) return null;
  const { diasNoPublike, ...perfil } = a;
  return { ...perfil, criado_em: new Date(agora - diasNoPublike * DIA).toISOString() };
}

export function anunciosDoPerfilDemo(id: string, agora: number): AnuncioDoPerfil[] {
  return BASE.filter((b) => b.autor === id).map((b) => {
    const c = completo(b, agora);
    return { ...resumo(c, 0, 0), distancia_km: null, fotos: c.fotos, atende: c.atende };
  });
}

export function idsDemo() {
  return BASE.map((b) => b.id);
}
