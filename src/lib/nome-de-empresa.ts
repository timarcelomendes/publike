import type { TipoConta } from "./tipos";

/**
 * O nome parece de empresa? No perfil, quem marca "Pessoa" com um nome como "AJON Consultoria de Trânsito"
 * vê a pergunta "Você está publicando como empresa?" (a foto redonda, o filtro "Quem publicou" e o
 * selo dependem do tipo da conta). Só sugere: a pessoa decide. Devolve o tipo mais provável ou null.
 */
const AGENCIA = ["rh", "recrutamento", "selecao", "headhunter", "terceirizacao"];
const COMERCIO = [
  "loja",
  "lojas",
  "salao",
  "barbearia",
  "oficina",
  "padaria",
  "panificadora",
  "restaurante",
  "lanchonete",
  "bar",
  "mercado",
  "supermercado",
  "mercearia",
  "acougue",
  "farmacia",
  "drogaria",
  "pizzaria",
  "sorveteria",
  "hamburgueria",
  "cafeteria",
  "confeitaria",
  "boutique",
  "pet",
  "petshop",
  "papelaria",
  "otica",
  "autopecas",
  "distribuidora",
  "atacadao",
  "atacado",
  "variedades",
  "emporio",
  "conveniencia",
  "lavajato",
  "borracharia",
];
const EMPRESA = [
  "ltda",
  "me",
  "mei",
  "epp",
  "eireli",
  "sa",
  "cia",
  "consultoria",
  "assessoria",
  "contabilidade",
  "advocacia",
  "advogados",
  "associados",
  "engenharia",
  "construtora",
  "construcoes",
  "incorporadora",
  "imobiliaria",
  "transportes",
  "transportadora",
  "logistica",
  "industria",
  "industrias",
  "comercio",
  "servicos",
  "solucoes",
  "tecnologia",
  "sistemas",
  "grupo",
  "holding",
  "clinica",
  "hospital",
  "laboratorio",
  "odontologia",
  "escola",
  "colegio",
  "faculdade",
  "academia",
  "hotel",
  "pousada",
  "buffet",
  "eventos",
  "condominio",
  "instituto",
  "fundacao",
  "associacao",
  "igreja",
  "cooperativa",
  "agencia",
  "studio",
  "estudio",
  "escritorio",
  "marketing",
  "seguranca",
  "limpeza",
  "manutencao",
  "representacoes",
  "importadora",
  "exportadora",
  "franquia",
  "rede",
];

function palavras(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/s\s*\/\s*a\b/g, " sa ")
    .replace(/auto\s*pecas/g, " autopecas ")
    .replace(/lava\s*jato/g, " lavajato ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function tipoPeloNome(nome: string): Exclude<TipoConta, "pessoa"> | null {
  const p = palavras(nome);
  if (!p.length) return null;
  // "Me" sozinho no meio do nome é de pessoa ("Me chama"): só vale no fim, como sufixo de empresa
  const tem = (lista: string[]) => p.some((w, i) => lista.includes(w) && (w !== "me" || i === p.length - 1));
  if (tem(AGENCIA) || (p.includes("agencia") && p.includes("emprego"))) return "agencia";
  if (tem(COMERCIO)) return "comercio";
  if (tem(EMPRESA) || /&|\bcnpj\b/i.test(nome)) return "empresa";
  return null;
}
