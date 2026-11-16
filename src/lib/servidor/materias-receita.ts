import "server-only";
import { randomBytes } from "node:crypto";
import { ocupacao } from "@/lib/cbo";
import { chamarIA, iaConfigurada, lerJson } from "@/lib/ia/openai";
import { slugDaNoticia } from "@/lib/noticias";
import type { ClienteBanco } from "@/lib/supabase/admin";
import { acessoFila } from "./filas";

// As matérias do mês (claude/plano-base-de-empresas-da-receita.md, parte 6; migração 20270606120000): "Os negócios que
// abriram em <cidade> em <mês>" (base da Receita) e "O que mais contratou em Goiânia e região" (Caged). A IA escreve a
// partir dos números e as duas entram como rascunho em Admin › Notícias: uma pessoa revisa e aprova. Sem página por
// empresa nem por bairro: uma matéria por mês, com números de verdade.

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

type NumerosDoMes = {
  mes: string;
  mais_contratadas: { cbo: string; contratacoes: number; p25: number; p50: number; p75: number; de: string; ate: string }[];
  por_cidade: {
    cidade: string;
    empresas: number;
    meis: number;
    bairros: { bairro: string; quantas: number }[] | null;
    ramos: { ramo: string; quantas: number }[] | null;
    destaques: { nome: string; ramo: string | null; bairro: string | null }[] | null;
  }[];
};

type Materia = { titulo: string; resumo: string; corpo: string; pratico: string };

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["titulo", "resumo", "corpo", "pratico"],
  properties: {
    titulo: { type: "string" },
    resumo: { type: "string" },
    corpo: { type: "string" },
    pratico: { type: "string" },
  },
};

const REGRAS = `Você escreve para o Publike, um site grátis de vagas e serviços de Goiânia e região, para quem procura trabalho.
Escreva com as suas palavras, em linguagem simples, frases curtas, para quem lê no celular. Use só os números que vierem; não invente nenhum número, nome, data ou endereço.
Nunca diga que um negócio está contratando ou tem vaga aberta: diga que lugar novo costuma contratar e que vale levar o currículo.
"titulo": até 100 caracteres. "resumo": uma ou duas frases (até 250 caracteres). "corpo": de três a cinco parágrafos curtos, separados por uma linha em branco. "pratico": uma frase com o que a pessoa faz com isso.`;

function reais(v: number) {
  return `R$ ${(Math.round(v / 10) * 10).toLocaleString("pt-BR")}`;
}

type Resultado = { ok: true; novas: number } | { ok: false; erro: string };

/** Pelo Admin (o botão): os números e os rascunhos pelas funções do admin. */
export async function prepararMateriasDoMes(c: ClienteBanco, mes?: string | null): Promise<Resultado> {
  const { data, error } = await c.rpc("admin_numeros_do_mes_receita", { p_mes: mes ?? null });
  if (error || !data) return { ok: false, erro: "Não deu para ler os números do mês. As migrações da base da Receita já rodaram?" };
  return escrever(data as unknown as NumerosDoMes, async (itens) => {
    const { data: novas, error: e } = await c.rpc("admin_rascunhos_receita", { p_itens: itens as never });
    if (e) throw new Error(e.message);
    return Number(novas ?? 0);
  });
}

/**
 * Sozinho, depois de cada carga mensal (/api/empresas, no "fim"): uma vez por mês, com a chave do servidor
 * (migração 20270608120000). null: já feitas ou sem IA.
 */
export async function materiasDepoisDaCarga(): Promise<Resultado | null> {
  const acesso = acessoFila();
  if (!acesso || !iaConfigurada()) return null;
  const { cliente, chave } = acesso;
  const { data, error } = await cliente.rpc("servidor_numeros_do_mes_receita", { p_chave: chave, p_mes: null });
  if (error || !data) return null;
  const n = data as unknown as NumerosDoMes;
  return escrever(n, async (itens) => {
    const { data: novas, error: e } = await cliente.rpc("servidor_rascunhos_receita", {
      p_chave: chave,
      p_mes: n.mes,
      p_itens: itens as never,
    });
    if (e) throw new Error(e.message);
    return Number(novas ?? 0);
  });
}

async function escrever(n: NumerosDoMes, guardar: (itens: unknown[]) => Promise<number>): Promise<Resultado> {
  if (!iaConfigurada()) return { ok: false, erro: "Falta a chave da IA no servidor." };
  const [ano, m] = n.mes.split("-").map(Number);
  const nomeMes = `${MESES[m - 1]} de ${ano}`;
  const itens = [];

  // 1. Os negócios que abriram (a cidade com mais aberturas e as outras das praças no fim)
  if (n.por_cidade.length) {
    const numeros = n.por_cidade.slice(0, 6).map((x) => ({
      cidade: x.cidade,
      empresas_abertas: x.empresas,
      mei_abertos: x.meis,
      bairros_com_mais_aberturas: x.bairros ?? [],
      ramos_com_mais_aberturas: x.ramos ?? [],
      destaques: (x.destaques ?? []).slice(0, 10),
    }));
    try {
      const r = await chamarIA({
        funcionalidade: "admin",
        modelo: "",
        sistema: `${REGRAS}\nA matéria é "Os negócios que abriram em ${n.por_cidade[0].cidade} e região em ${nomeMes}", a partir dos dados abertos do CNPJ da Receita Federal. Comece pela cidade com mais aberturas; diga o total, os bairros e os ramos que mais abriram; cite até 10 destaques pelo nome (só os da lista, que são empresas, nunca pessoas); e termine convidando quem procura trabalho a levar o currículo, com o Quem contrata perto do Publike (publike.org/quem-contrata-perto), que mostra no mapa os lugares perto de casa.`,
        mensagem: JSON.stringify(numeros),
        maxTokens: 2000,
        esquema: { nome: "materia", schema: ESQUEMA },
      });
      const a = lerJson<Materia>(r.texto);
      itens.push({
        slug: slugDaNoticia(a.titulo, randomBytes(3).toString("hex")),
        titulo: a.titulo.trim().slice(0, 140),
        resumo: a.resumo.trim().slice(0, 300),
        corpo: a.corpo.trim().slice(0, 3000),
        pratico: a.pratico.trim().slice(0, 400),
        tema: "mercado",
        cidade: n.por_cidade[0].cidade,
        fonte_nome: "Receita Federal (dados abertos do CNPJ)",
        fonte_url: `https://dados.gov.br/dados/conjuntos-dados/cadastro-nacional-da-pessoa-juridica---cnpj?publike=abriram-${n.mes.slice(0, 7)}`,
        fonte_data: "",
      });
    } catch (e) {
      console.error("Publike: falha ao escrever a matéria dos negócios que abriram:", e);
    }
  }

  // 2. O que mais contratou (Caged, os 12 meses da tabela do salário do mercado)
  if (n.mais_contratadas.length) {
    const numeros = n.mais_contratadas.map((f) => ({
      funcao: ocupacao(f.cbo)?.nome ?? f.cbo,
      contratacoes_com_carteira_em_12_meses: f.contratacoes,
      salario_mais_comum: `${reais(f.p25)} a ${reais(f.p75)}`,
      meio: reais(f.p50),
    }));
    const de = n.mais_contratadas[0].de;
    const ate = n.mais_contratadas[0].ate;
    try {
      const r = await chamarIA({
        funcionalidade: "admin",
        modelo: "",
        sistema: `${REGRAS}\nA matéria é "As funções que mais contrataram com carteira em Goiânia e região", pelo Novo Caged do Ministério do Trabalho, de ${de.slice(0, 7)} a ${ate.slice(0, 7)} (12 meses, só contratações em jornada integral). Diga as funções da lista, quantas contratações e quanto a maioria ganhou (a faixa e o meio). Termine dizendo que no Publike cada vaga mostra quanto o mercado paga para a função.`,
        mensagem: JSON.stringify(numeros),
        maxTokens: 2000,
        esquema: { nome: "materia", schema: ESQUEMA },
      });
      const a = lerJson<Materia>(r.texto);
      itens.push({
        slug: slugDaNoticia(a.titulo, randomBytes(3).toString("hex")),
        titulo: a.titulo.trim().slice(0, 140),
        resumo: a.resumo.trim().slice(0, 300),
        corpo: a.corpo.trim().slice(0, 3000),
        pratico: a.pratico.trim().slice(0, 400),
        tema: "mercado",
        cidade: "Goiânia",
        fonte_nome: "Novo Caged (Ministério do Trabalho e Emprego)",
        fonte_url: `https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/estatisticas-trabalho/novo-caged?publike=contratou-${n.mes.slice(0, 7)}`,
        fonte_data: "",
      });
    } catch (e) {
      console.error("Publike: falha ao escrever a matéria do que mais contratou:", e);
    }
  }

  if (!itens.length) return { ok: false, erro: "Sem números do mês para escrever (a base ou o Caged ainda não carregou) ou a IA falhou." };
  try {
    return { ok: true, novas: await guardar(itens) };
  } catch {
    return { ok: false, erro: "Não deu para guardar os rascunhos." };
  }
}
