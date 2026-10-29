// Publicar vaga em passos (plano em claude/plano-publicar-em-passos.md): os 5 passos, os campos de cada um
// (para levar ao passo do erro que o servidor devolveu) e o que o "Continuar" confere antes de seguir.
// As regras são as obrigatórias de `lerAnuncio` (validacao.ts): o servidor confere tudo de novo ao publicar.

import { lerNumeroBR } from "./numero";
import { conferirFaixa, faltamLetras, SEM_CONTRATANTE, SEM_REGIME, SEM_VALOR } from "./validacao";

export const PASSOS_PUBLICAR = [
  { numero: 1, nome: "A vaga" },
  { numero: 2, nome: "Pagamento e horário" },
  { numero: 3, nome: "Onde" },
  { numero: 4, nome: "Mais detalhes", opcional: true },
  { numero: 5, nome: "Publicar" },
] as const;

export const TOTAL_PASSOS = PASSOS_PUBLICAR.length;

/** Os campos de cada passo (os nomes do formulário e as chaves dos erros do servidor). */
const CAMPOS_DO_PASSO: Record<number, string[]> = {
  1: ["titulo", "contratante", "cliente_id", "regime", "vagas", "categoria"],
  2: [
    "pagamento_valor",
    "pagamento_ate",
    "pagamento_unidade",
    "ganhos_extras",
    "beneficios_lista",
    "beneficios_extras",
    "beneficios",
    "horario",
    "jornada",
  ],
  3: ["cidade", "bairro", "cep", "endereco", "lat", "lng", "modelo"],
  4: ["descricao", "escolaridade_minima", "experiencia", "cnh", "pcd", "perguntas", "pede_curriculo"],
  5: ["prazo_dias", "comeca_ja", "contato_direto"],
};

/** O passo de um campo (o erro que não é de campo nenhum fica no último, perto do botão). */
export function passoDoCampo(campo: string): number {
  for (const [passo, campos] of Object.entries(CAMPOS_DO_PASSO)) if (campos.includes(campo)) return Number(passo);
  return TOTAL_PASSOS;
}

/** O primeiro passo com erro (null: nenhum). */
export function primeiroPassoComErro(erros: Record<string, string>): number | null {
  const passos = Object.keys(erros).map(passoDoCampo);
  return passos.length ? Math.min(...passos) : null;
}

/**
 * O que falta no passo para seguir (campo → mensagem, como os erros do servidor). Só o obrigatório:
 * título e tipo (e, na agência, a empresa), o valor (ou "a combinar") e o bairro.
 */
export function faltaNoPasso(
  passo: number,
  dados: FormData,
  { vaga, agencia }: { vaga: boolean; agencia: boolean },
): Record<string, string> {
  const t = (k: string) => {
    const v = dados.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const erros: Record<string, string> = {};
  if (passo === 1) {
    const titulo = t("titulo");
    if (!titulo) erros.titulo = "Escreva o título.";
    else if (titulo.length < (vaga ? 5 : 2)) erros.titulo = faltamLetras(vaga ? 5 : 2, titulo.length);
    if (vaga && !t("regime")) erros.regime = SEM_REGIME;
    if (vaga && agencia && t("contratante_confidencial") !== "on" && !t("cliente_id") && t("contratante").length < 2)
      erros.contratante = SEM_CONTRATANTE;
    if (vaga) {
      const n = Number(t("vagas") || "1");
      if (!Number.isInteger(n) || n < 1 || n > 999) erros.vagas = "Escreva quantas pessoas, de 1 a 999.";
    }
  }
  if (passo === 2 && t("combinar") !== "on") {
    const valor = lerNumeroBR(t("pagamento_valor"));
    if (valor == null || Number.isNaN(valor)) erros.pagamento_valor = SEM_VALOR;
    else if (valor <= 0 || valor > 1_000_000) erros.pagamento_valor = "Confira o valor.";
    if (!t("pagamento_unidade")) erros.pagamento_unidade = "Diga se é por hora, dia, mês…";
    const ateTexto = t("pagamento_ate");
    const ate = ateTexto ? lerNumeroBR(ateTexto) : null;
    const faixa = conferirFaixa(valor, ate == null ? null : ate);
    if (faixa) erros.pagamento_ate = faixa;
  }
  if (passo === 3 && t("contratante_confidencial") !== "on" && t("bairro").length < 2)
    erros.bairro = "Escreva o bairro ou setor do trabalho.";
  return erros;
}
