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
  servico: { nome: "Serviço", selo: "Serviço", publicar: "Publicar serviço" },
};

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
};
export const LISTA_UNIDADES = Object.keys(UNIDADES) as [Unidade, ...Unidade[]];

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
  expirado: { nome: "Expirado", ajuda: "Passou dos 30 dias; renove para voltar" },
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

/** Sugestões no campo "bairro" (a pessoa pode digitar qualquer outro). */
export const BAIRROS_SUGERIDOS = [
  "Alto da Glória",
  "Bairro Feliz",
  "Campinas",
  "Cidade Jardim",
  "Conjunto Vera Cruz",
  "Jardim América",
  "Jardim Atlântico",
  "Jardim Balneário Meia Ponte",
  "Jardim Curitiba",
  "Jardim Europa",
  "Jardim Goiás",
  "Jardim Guanabara",
  "Jardim Novo Mundo",
  "Jardim Planalto",
  "Nova Suíça",
  "Parque Amazônia",
  "Parque Anhanguera",
  "Parque Atheneu",
  "Parque Oeste Industrial",
  "Residencial Eldorado",
  "Setor Aeroporto",
  "Setor Bela Vista",
  "Setor Bueno",
  "Setor Castelo Branco",
  "Setor Central",
  "Setor Coimbra",
  "Setor Crimeia Leste",
  "Setor Crimeia Oeste",
  "Setor dos Funcionários",
  "Setor Faiçalville",
  "Setor Garavelo",
  "Setor Jaó",
  "Setor Leste Universitário",
  "Setor Leste Vila Nova",
  "Setor Marista",
  "Setor Negrão de Lima",
  "Setor Norte Ferroviário",
  "Setor Oeste",
  "Setor Pedro Ludovico",
  "Setor Perim",
  "Setor Santa Genoveva",
  "Setor Sudoeste",
  "Setor Sul",
  "Setor Universitário",
  "Setor Urias Magalhães",
  "Vila Abajá",
  "Vila Brasília",
  "Vila Canaã",
  "Vila Itatiaia",
  "Vila Jaraguá",
  "Vila Mutirão",
  "Vila Nova",
  "Vila Redenção",
  "Vila Rosa",
] as const;
