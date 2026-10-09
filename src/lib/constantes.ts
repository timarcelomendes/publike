import {
  Car,
  ClipboardList,
  Ellipsis,
  Factory,
  GraduationCap,
  HandHeart,
  HardHat,
  Laptop,
  Leaf,
  PartyPopper,
  Scissors,
  Shield,
  Sparkles,
  Store,
  Truck,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Regime, StatusAnuncio, TipoAnuncio, TipoConta, Unidade } from "./tipos";

export const CATEGORIAS = [
  { slug: "comercio", nome: "Comércio e vendas", icone: Store },
  { slug: "alimentacao", nome: "Alimentação", icone: UtensilsCrossed },
  { slug: "administrativo", nome: "Escritório e atendimento", icone: ClipboardList },
  { slug: "logistica", nome: "Entregas e transporte", icone: Truck },
  { slug: "construcao", nome: "Obras e reformas", icone: HardHat },
  { slug: "eletrica-hidraulica", nome: "Elétrica e hidráulica", icone: Zap },
  { slug: "limpeza", nome: "Limpeza e diaristas", icone: Sparkles },
  { slug: "cuidados", nome: "Cuidados com pessoas", icone: HandHeart },
  { slug: "beleza", nome: "Beleza e estética", icone: Scissors },
  { slug: "educacao", nome: "Aulas e educação", icone: GraduationCap },
  { slug: "tecnologia", nome: "Tecnologia", icone: Laptop },
  { slug: "industria", nome: "Indústria e produção", icone: Factory },
  { slug: "eventos", nome: "Eventos e festas", icone: PartyPopper },
  { slug: "jardinagem", nome: "Jardim e piscina", icone: Leaf },
  { slug: "auto", nome: "Carros e motos", icone: Car },
  { slug: "seguranca", nome: "Segurança e portaria", icone: Shield },
  { slug: "outros", nome: "Outros", icone: Ellipsis },
] as const satisfies readonly { slug: string; nome: string; icone: LucideIcon }[];

export type Categoria = (typeof CATEGORIAS)[number]["slug"];
export const SLUGS_CATEGORIAS = CATEGORIAS.map((c) => c.slug) as [Categoria, ...Categoria[]];

export function categoria(slug: string) {
  return CATEGORIAS.find((c) => c.slug === slug) ?? CATEGORIAS[CATEGORIAS.length - 1];
}

export const TIPOS_ANUNCIO: Record<TipoAnuncio, { nome: string; selo: string; publicar: string }> = {
  vaga: { nome: "Vaga", selo: "Vaga", publicar: "Publicar vaga" },
  servico: { nome: "Serviço", selo: "Serviço", publicar: "Oferecer meus serviços" },
};

/**
 * O que um profissional pode oferecer. Cada um cai numa categoria da busca;
 * quem faz algo fora da lista escolhe "Outro serviço" e a categoria.
 */
export const OFICIOS = [
  { slug: "pedreiro", nome: "Pedreiro", categoria: "construcao" },
  { slug: "pintor", nome: "Pintor", categoria: "construcao" },
  { slug: "gesseiro", nome: "Gesseiro", categoria: "construcao" },
  { slug: "azulejista", nome: "Azulejista", categoria: "construcao" },
  { slug: "marceneiro", nome: "Marceneiro", categoria: "construcao" },
  { slug: "serralheiro", nome: "Serralheiro", categoria: "construcao" },
  { slug: "vidraceiro", nome: "Vidraceiro", categoria: "construcao" },
  { slug: "marido-de-aluguel", nome: "Marido de aluguel", categoria: "construcao" },
  { slug: "montador-de-moveis", nome: "Montador de móveis", categoria: "construcao" },
  { slug: "eletricista", nome: "Eletricista", categoria: "eletrica-hidraulica" },
  { slug: "encanador", nome: "Encanador", categoria: "eletrica-hidraulica" },
  { slug: "ar-condicionado", nome: "Ar-condicionado", categoria: "eletrica-hidraulica" },
  { slug: "eletrodomesticos", nome: "Conserto de eletrodomésticos", categoria: "eletrica-hidraulica" },
  { slug: "diarista", nome: "Diarista", categoria: "limpeza" },
  { slug: "passadeira", nome: "Passadeira", categoria: "limpeza" },
  { slug: "limpeza-pos-obra", nome: "Limpeza pós-obra", categoria: "limpeza" },
  { slug: "estofados", nome: "Limpeza de sofá e estofados", categoria: "limpeza" },
  { slug: "dedetizacao", nome: "Dedetização", categoria: "limpeza" },
  { slug: "baba", nome: "Babá", categoria: "cuidados" },
  { slug: "cuidador", nome: "Cuidador de idosos", categoria: "cuidados" },
  { slug: "pets", nome: "Banho e passeio de pets", categoria: "cuidados" },
  { slug: "cabeleireiro", nome: "Cabeleireiro", categoria: "beleza" },
  { slug: "barbeiro", nome: "Barbeiro", categoria: "beleza" },
  { slug: "manicure", nome: "Manicure e pedicure", categoria: "beleza" },
  { slug: "maquiagem", nome: "Maquiagem", categoria: "beleza" },
  { slug: "sobrancelha", nome: "Sobrancelha e depilação", categoria: "beleza" },
  { slug: "aulas", nome: "Aulas particulares", categoria: "educacao" },
  { slug: "aulas-musica", nome: "Aulas de música", categoria: "educacao" },
  { slug: "personal", nome: "Personal trainer", categoria: "educacao" },
  { slug: "informatica", nome: "Técnico de informática", categoria: "tecnologia" },
  { slug: "celular", nome: "Conserto de celular", categoria: "tecnologia" },
  { slug: "sites", nome: "Sites e redes sociais", categoria: "tecnologia" },
  { slug: "frete", nome: "Frete e mudança", categoria: "logistica" },
  { slug: "motorista", nome: "Motorista", categoria: "logistica" },
  { slug: "motoboy", nome: "Motoboy", categoria: "logistica" },
  { slug: "cozinheira", nome: "Cozinheira", categoria: "alimentacao" },
  { slug: "salgados", nome: "Salgados, bolos e doces", categoria: "alimentacao" },
  { slug: "garcom", nome: "Garçom", categoria: "eventos" },
  { slug: "churrasqueiro", nome: "Churrasqueiro", categoria: "eventos" },
  { slug: "dj", nome: "DJ e som", categoria: "eventos" },
  { slug: "fotografo", nome: "Fotógrafo", categoria: "eventos" },
  { slug: "decoracao", nome: "Decoração de festas", categoria: "eventos" },
  { slug: "jardineiro", nome: "Jardineiro", categoria: "jardinagem" },
  { slug: "piscineiro", nome: "Piscineiro", categoria: "jardinagem" },
  { slug: "rocagem", nome: "Roçagem e limpeza de lote", categoria: "jardinagem" },
  { slug: "mecanico", nome: "Mecânico", categoria: "auto" },
  { slug: "lava-jato", nome: "Lavagem de carros", categoria: "auto" },
  { slug: "funilaria", nome: "Funilaria e pintura", categoria: "auto" },
  { slug: "costureira", nome: "Costureira", categoria: "outros" },
  { slug: "chaveiro", nome: "Chaveiro", categoria: "outros" },
] as const satisfies readonly { slug: string; nome: string; categoria: Categoria }[];

export type Oficio = (typeof OFICIOS)[number]["slug"];
export const SLUGS_OFICIOS = OFICIOS.map((o) => o.slug) as [Oficio, ...Oficio[]];

export function oficio(slug: string | null | undefined) {
  return OFICIOS.find((o) => o.slug === slug) ?? null;
}

/** No máximo 8 serviços por pessoa (o banco confere de novo). */
export const MAX_SERVICOS = 8;
/** Fotos de trabalhos por serviço. */
export const MAX_FOTOS = 6;

export const REGIMES: Record<Regime, { nome: string; selo: string; ajuda: string }> = {
  clt: { nome: "Com carteira (CLT)", selo: "CLT", ajuda: "Emprego com carteira assinada" },
  temporario: { nome: "Temporário", selo: "Temporário", ajuda: "Contrato por um período" },
  diaria: { nome: "Diária", selo: "Diária", ajuda: "Paga por dia de trabalho" },
  freelance: { nome: "Bico / freelance", selo: "Bico", ajuda: "Trabalho pontual, por tarefa" },
  estagio: { nome: "Estágio", selo: "Estágio", ajuda: "Para estudantes" },
  pj: { nome: "PJ / MEI", selo: "PJ", ajuda: "Contrato com CNPJ ou MEI" },
  outro: { nome: "Outro", selo: "Outro", ajuda: "Outra forma de contratação" },
};
export const LISTA_REGIMES = Object.keys(REGIMES) as [Regime, ...Regime[]];

export const UNIDADES: Record<Unidade, string> = {
  hora: "por hora",
  dia: "por dia (diária)",
  semana: "por semana",
  mes: "por mês",
  servico: "pelo serviço",
  m2: "por m²",
  visita: "por visita",
};
export const LISTA_UNIDADES = Object.keys(UNIDADES) as [Unidade, ...Unidade[]];
/** Como um profissional cobra. */
export const UNIDADES_SERVICO = ["hora", "dia", "servico", "m2", "visita"] as const satisfies readonly Unidade[];

export const TIPOS_CONTA: Record<TipoConta, { nome: string; minusculo: string; ajuda: string }> = {
  pessoa: { nome: "Pessoa", minusculo: "pessoa", ajuda: "Procuro trabalho ou contrato para casa" },
  comercio: { nome: "Comércio", minusculo: "comércio", ajuda: "Loja, bar, salão, oficina, padaria…" },
  empresa: { nome: "Empresa", minusculo: "empresa", ajuda: "Empresa, indústria, condomínio, ONG…" },
};
export const LISTA_TIPOS_CONTA = Object.keys(TIPOS_CONTA) as [TipoConta, ...TipoConta[]];

export const STATUS_ANUNCIO: Record<StatusAnuncio, { nome: string; ajuda: string }> = {
  ativo: { nome: "No ar", ajuda: "Aparece nas buscas" },
  pausado: { nome: "Pausado", ajuda: "Escondido até você reativar" },
  encerrado: { nome: "Encerrado", ajuda: "Você encerrou este anúncio" },
  expirado: { nome: "Expirado", ajuda: "Passou do prazo; renove para voltar" },
  em_analise: { nome: "Em análise", ajuda: "Recebeu denúncias; a moderação vai olhar" },
  removido: { nome: "Removido", ajuda: "Removido pela moderação" },
};

export const MOTIVOS_DENUNCIA = [
  { valor: "cobra_taxa", nome: "Cobra para contratar", ajuda: "Pede dinheiro para curso, uniforme, exame ou cadastro." },
  { valor: "golpe", nome: "Parece golpe", ajuda: "Pede Pix adiantado, senha, dados do banco ou documentos sem motivo." },
  { valor: "enganoso", nome: "Informação falsa", ajuda: "A vaga ou o serviço não existe, ou o valor é enganoso." },
  { valor: "discriminacao", nome: "Discriminação", ajuda: "Exclui pessoas por cor, gênero, idade, religião, deficiência…" },
  { valor: "ofensivo", nome: "Conteúdo ofensivo", ajuda: "Palavrões, assédio ou conteúdo impróprio." },
  { valor: "spam", nome: "Spam ou repetido", ajuda: "O mesmo anúncio publicado várias vezes, propaganda." },
  { valor: "outro", nome: "Outro motivo", ajuda: "Conte nos detalhes o que aconteceu." },
] as const;
export type MotivoDenuncia = (typeof MOTIVOS_DENUNCIA)[number]["valor"];

/** Região metropolitana de Goiânia. */
export const CIDADES = [
  "Goiânia",
  "Aparecida de Goiânia",
  "Senador Canedo",
  "Trindade",
  "Goianira",
  "Nerópolis",
  "Hidrolândia",
  "Bela Vista de Goiás",
  "Abadia de Goiás",
  "Aragoiânia",
  "Bonfinópolis",
  "Brazabrantes",
  "Caldazinha",
  "Caturaí",
  "Goianápolis",
  "Guapó",
  "Inhumas",
  "Nova Veneza",
  "Santo Antônio de Goiás",
  "Terezópolis de Goiás",
] as const;
export type Cidade = (typeof CIDADES)[number];

/** Regiões de Goiânia (os bairros de cada uma ficam em regioes.ts). */
export const REGIOES = ["Centro", "Norte", "Sul", "Leste", "Oeste", "Noroeste", "Sudoeste"] as const;
export type Regiao = (typeof REGIOES)[number];

/**
 * Onde um profissional atende: uma região de Goiânia ("Goiânia: Sul"),
 * Goiânia inteira ("Goiânia") ou outra cidade da região metropolitana.
 */
export const AREAS_GOIANIA = REGIOES.map((r) => `Goiânia: ${r}`);
export const AREAS_ATENDIMENTO = ["Goiânia", ...AREAS_GOIANIA, ...CIDADES.filter((c) => c !== "Goiânia")];

/** "Goiânia: Sul" → "Região Sul"; cidade fica igual. */
export function nomeDaAreaAtendida(area: string) {
  return area.startsWith("Goiânia: ") ? `Região ${area.slice(9)}` : area;
}

/** Junta as regiões de Goiânia ("Região Sul e Sudoeste de Goiânia") e lista as cidades. */
export function descreverAtendimento(areas: readonly string[]) {
  const regioes = areas.filter((a) => a.startsWith("Goiânia: ")).map((a) => a.slice(9));
  const cidades = areas.filter((a) => !a.startsWith("Goiânia: "));
  const partes: string[] = [];
  if (regioes.length) {
    const lista = regioes.length === 1 ? regioes[0] : `${regioes.slice(0, -1).join(", ")} e ${regioes[regioes.length - 1]}`;
    partes.push(`${regioes.length === 1 ? "Região" : "Regiões"} ${lista} de Goiânia`);
  }
  partes.push(...cidades);
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}
