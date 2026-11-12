// O título e a descrição da vaga no Google (claude/plano-alcance-e-cadastros.md). As buscas que trazem gente são
// "vaga de frentista", "frentista vagas", "operador de empilhadeira goiania": o título leva a função com "Vaga de", o
// lugar e o salário, que é o que faz clicar no meio das outras. Cabe em 60 letras (o resto o Google corta), antes do
// " · Publike" do modelo. O título da página (o h1) e o do Google Vagas (JobPosting) continuam o da própria vaga.

import { REGIMES } from "./constantes";
import { nomeDoBairro } from "./formato";
import { funcaoCurta, funcaoDoTitulo, salarioDaVaga } from "./impulso";
import type { Regime } from "./tipos";

const MAX_TITULO = 60;
const MAX_DESCRICAO = 158;

/** Os campos da vaga que o título e a descrição usam (os do anúncio completo servem). */
export type VagaNaBusca = {
  tipo: string;
  titulo: string;
  descricao: string;
  bairro: string;
  cidade: string;
  regime?: string | null;
  pagamento_valor?: number | null;
  pagamento_ate?: number | null;
  pagamento_unidade?: string | null;
};

const POR: Record<string, string> = { hora: "/hora", dia: "/dia", semana: "/semana" };

/** "vaga de auxiliar de cozinha": a primeira letra minúscula, menos nas siglas ("TI", "RH"). */
function minusculaNoComeco(funcao: string) {
  return /^\p{Lu}\p{Lu}/u.test(funcao) ? funcao : funcao.charAt(0).toLocaleLowerCase("pt-BR") + funcao.slice(1);
}

/** "R$ 2.300", "R$ 120/dia" (o mês fica sem a unidade: é o que se espera de um salário). */
function salarioCurto(v: VagaNaBusca) {
  const valor = salarioDaVaga({ ...v, id: "", pagamento_valor: v.pagamento_valor ?? null });
  if (!valor) return null;
  return `${valor}${(v.pagamento_unidade && POR[v.pagamento_unidade]) || ""}`;
}

/** Só o piso da faixa ("R$ 2.600"), para o título curto quando a faixa inteira não cabe. */
function pisoCurto(v: VagaNaBusca) {
  if (!v.pagamento_ate || !v.pagamento_valor || v.pagamento_ate <= v.pagamento_valor) return null;
  return salarioCurto({ ...v, pagamento_ate: null });
}

function primeiroQueCabe(opcoes: (string | null)[], max: number) {
  return opcoes.find((o): o is string => Boolean(o) && (o as string).length <= max) ?? null;
}

/**
 * O título da vaga no Google: "Vaga de frentista em Setor Bueno, Goiânia · R$ 2.300", encurtando até caber
 * (sem o bairro, sem o salário). Serviço: "Pintor em Setor Bueno, Goiânia".
 */
export function tituloNaBusca(v: VagaNaBusca): string {
  const bairro = nomeDoBairro(v.bairro.trim());
  const cidade = v.cidade.trim();
  const lugar = bairro && bairro !== cidade ? `${bairro}, ${cidade}` : cidade;
  if (v.tipo !== "vaga") {
    return primeiroQueCabe([`${v.titulo} em ${lugar}`, `${v.titulo} em ${cidade}`], MAX_TITULO) ?? v.titulo;
  }
  // "Operador de empilhadeira e movimentação de cargas" → "Operador de empilhadeira": cabe com o lugar
  const funcao = funcaoCurta(funcaoDoTitulo(v.titulo));
  const vagaDe = `Vaga de ${minusculaNoComeco(funcao)}`;
  const sal = salarioCurto(v);
  const piso = pisoCurto(v);
  return (
    primeiroQueCabe(
      [
        sal ? `${vagaDe} em ${lugar} · ${sal}` : null,
        sal ? `${vagaDe} em ${cidade} · ${sal}` : null,
        piso ? `${vagaDe} em ${lugar} · ${piso}` : null,
        piso ? `${vagaDe} em ${cidade} · ${piso}` : null,
        `${vagaDe} em ${lugar}`,
        `${vagaDe} em ${cidade}`,
        `${funcao} em ${cidade}`,
      ],
      MAX_TITULO,
    ) ?? funcao
  );
}

/**
 * A descrição da vaga no Google: o regime, o lugar e o salário, o começo da vaga e o convite ("Candidate-se grátis…"),
 * em até 158 letras.
 */
export function descricaoNaBusca(v: VagaNaBusca): string {
  const bairro = nomeDoBairro(v.bairro.trim());
  const cidade = v.cidade.trim();
  const lugar = bairro && bairro !== cidade ? `${bairro}, ${cidade}` : cidade;
  const regime = v.tipo === "vaga" && v.regime && v.regime in REGIMES ? REGIMES[v.regime as Regime].selo : null;
  const sal = v.tipo === "vaga" ? salarioCurto(v) : null;
  const comeco =
    v.tipo === "vaga" ? `${[regime, `em ${lugar}`].filter(Boolean).join(" ")}${sal ? `, ${sal}` : ""}.` : `em ${lugar}.`;
  const abertura = comeco.charAt(0).toLocaleUpperCase("pt-BR") + comeco.slice(1);
  const convite =
    v.tipo === "vaga"
      ? "Candidate-se grátis: curta a vaga e fale direto com quem contrata."
      : "Peça o orçamento grátis pelo Publike.";
  const texto = v.descricao.replace(/\s+/g, " ").trim();
  const sobra = MAX_DESCRICAO - abertura.length - convite.length - 2;
  let meio = "";
  if (sobra >= 30 && texto) {
    if (texto.length <= sobra) meio = /[.!?]$/.test(texto) ? texto : `${texto}.`;
    else {
      const corte = texto.slice(0, sobra - 1);
      meio = `${corte.slice(0, Math.max(corte.lastIndexOf(" "), 20)).replace(/[,;:\s-]+$/, "")}…`;
    }
  }
  return [abertura, meio, convite].filter(Boolean).join(" ").slice(0, 200);
}
