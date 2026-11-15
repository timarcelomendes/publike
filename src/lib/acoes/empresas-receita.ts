"use server";

import { bairroDaReceita, nomeDaReceita } from "@/lib/cnpj";
import { montarEndereco } from "@/lib/cep";
import { obterUsuario } from "@/lib/dados";
import { nomeDaFuncaoComum, tituloDaFuncao } from "@/lib/funcao-cbo";
import { regiaoDaCidade } from "@/lib/salarios";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// Publicar sabendo o que o ramo contrata (claude/plano-base-de-empresas-da-receita.md, parte 3): achar a empresa na
// base da Receita pelo CNPJ ou pelo nome (migrações 20270602120000 e 20270603120000) e as funções que o ramo dela
// contrata em Goiás, com a faixa de salário da praça. Só para quem entrou; nunca telefone nem e-mail.

export type EmpresaAchada = {
  cnpj: string;
  nome: string;
  razaoSocial: string | null;
  cnae: string | null;
  /** o nome do ramo (a atividade principal na Receita) */
  ramo: string | null;
  agencia: boolean;
  matriz: boolean;
  cidade: string;
  bairro: string | null;
  cep: string | null;
  /** "Rua 10, 120" */
  endereco: string | null;
  numero: string | null;
  lat: number | null;
  lng: number | null;
  abertura: string | null;
};

export type FuncaoDoRamo = {
  cbo: string;
  /** o título curto da vaga ("Padeiro") e o nome oficial da CBO */
  titulo: string;
  nome: string;
  contratacoes: number;
  faixa: { p25: number; p75: number } | null;
};

export async function acharEmpresas(texto: string): Promise<EmpresaAchada[]> {
  const t = String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9./ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  if (t.replace(/[^A-Za-z0-9]/g, "").length < 3) return [];
  if (!(await obterUsuario().catch(() => null))) return [];
  const banco = await criarClienteServidor();
  const { data, error } = await banco.rpc("buscar_empresas_receita", { p_texto: t, p_limite: 6 });
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: falha ao buscar a empresa na base da Receita:", error.message);
    return [];
  }
  return (data ?? []).map((e) => ({
    cnpj: e.cnpj,
    nome: e.nome,
    razaoSocial: e.razao_social,
    cnae: e.cnae,
    ramo: e.ramo,
    agencia: e.agencia,
    matriz: e.matriz,
    cidade: e.cidade,
    bairro: e.bairro ? bairroDaReceita(e.bairro).slice(0, 80) : null,
    cep: e.cep,
    endereco: montarEndereco(e.logradouro ? nomeDaReceita(e.logradouro) : null, e.numero),
    numero: e.numero,
    lat: e.lat,
    lng: e.lng,
    abertura: e.data_abertura,
  }));
}

/** As funções que o ramo mais contrata (só as que o Publike conhece pelo nome), com a faixa de salário da cidade. */
export async function funcoesDoRamo(cnae: string, cidade: string): Promise<FuncaoDoRamo[]> {
  if (!/^\d{7}$/.test(String(cnae ?? ""))) return [];
  if (!(await obterUsuario().catch(() => null))) return [];
  const banco = await criarClienteServidor();
  const { data, error } = await banco.rpc("funcoes_do_ramo", {
    p_cnae: cnae,
    p_regiao: regiaoDaCidade(String(cidade ?? "")) ?? "go",
    p_limite: 20,
  });
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: falha ao ler as funções do ramo:", error.message);
    return [];
  }
  const funcoes: FuncaoDoRamo[] = [];
  for (const f of data ?? []) {
    const titulo = tituloDaFuncao(f.cbo);
    const nome = nomeDaFuncaoComum(f.cbo);
    if (!titulo || !nome) continue;
    funcoes.push({
      cbo: f.cbo,
      titulo,
      nome,
      contratacoes: f.contratacoes,
      faixa: f.p25 != null && f.p75 != null ? { p25: Number(f.p25), p75: Number(f.p75) } : null,
    });
    if (funcoes.length >= 5) break;
  }
  return funcoes;
}
