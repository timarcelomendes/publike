// A reputação de quem contrata (claude/plano-reputacao-de-quem-contrata.md): responde, acompanha e dá retorno ao
// candidato, nos últimos 90 dias, comparada com as outras contas do Publike (sem citar ninguém). Os números vêm do
// banco (minha_reputacao no painel, servidor_reputacao no e-mail da semana); aqui ficam só os textos.

export type Reputacao = {
  curtidas: number;
  /** 0 a 1; null: menos de 3 casos na base */
  responde: number | null;
  horas: number | null;
  acompanha: number | null;
  retorno: number | null;
  /** a parte das outras contas que ficou abaixo (0 a 1); null: sem com quem comparar */
  melhorResponde: number | null;
  melhorRapidez: number | null;
  melhorAcompanha: number | null;
  melhorRetorno: number | null;
  /** com quantas outras contas comparou */
  comparadas: number;
};

/** Abaixo disso, nenhum número (o mesmo mínimo do selo do cartão). */
export const MINIMO_DE_CURTIDAS = 5;
/** Abaixo disso, a comparação não diz nada. */
const MINIMO_PARA_COMPARAR = 5;

type Linha = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Uma linha do banco (minha_reputacao ou servidor_reputacao) no formato do site. */
export function lerReputacao(r: Linha): Reputacao {
  return {
    curtidas: Number(r.curtidas ?? 0),
    responde: num(r.responde),
    horas: num(r.horas),
    acompanha: num(r.acompanha),
    retorno: num(r.retorno),
    melhorResponde: num(r.melhor_responde),
    melhorRapidez: num(r.melhor_rapidez),
    melhorAcompanha: num(r.melhor_acompanha),
    melhorRetorno: num(r.melhor_retorno),
    comparadas: Number(r.comparadas ?? 0),
  };
}

/** "Responde 9 de cada 10 curtidas", "Responde todas as curtidas", "Quase não responde as curtidas". */
function deCada10(taxa: number, f: { todos: string; nenhum: string; parte: (dez: number) => string }) {
  const dez = Math.round(taxa * 10);
  return dez >= 10 ? f.todos : dez <= 0 ? f.nenhum : f.parte(dez);
}

function prazo(horas: number) {
  if (horas < 1) return "em menos de 1 hora";
  if (horas < 24) return `em ${Math.round(horas)} ${Math.round(horas) === 1 ? "hora" : "horas"}`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? "em 1 dia" : `em ${dias} dias`;
}

/** "melhor que 7 de cada 10 empresas"; null sem comparação que valha. */
function comparacao(melhor: number | null, comparadas: number) {
  if (melhor === null || comparadas < MINIMO_PARA_COMPARAR) return null;
  const dez = Math.round(melhor * 10);
  if (dez <= 3) return "abaixo da maioria das empresas do Publike";
  if (dez <= 6) return "na média das empresas do Publike";
  return `melhor que ${dez} de cada 10 empresas do Publike`;
}

export type Indicador = {
  chave: "responde" | "acompanha" | "retorno";
  nome: string;
  /** 0 a 1 */
  taxa: number;
  texto: string;
  comparacao: string | null;
  bom: boolean;
  /** o que fazer para melhorar (quando não está bom) */
  dica: string;
};

/** Os três indicadores que já têm base (os outros ficam de fora). */
export function indicadores(r: Reputacao): Indicador[] {
  const lista: Indicador[] = [];
  if (r.responde !== null)
    lista.push({
      chave: "responde",
      nome: "Responde",
      taxa: r.responde,
      texto: `${deCada10(r.responde, {
        todos: "Responde todas as curtidas",
        nenhum: "Quase não responde as curtidas",
        parte: (d) => `Responde ${d} de cada 10 curtidas`,
      })}${r.horas !== null ? `, em geral ${prazo(r.horas)}` : ""}`,
      comparacao: comparacao(r.melhorRapidez ?? r.melhorResponde, r.comparadas),
      bom: r.responde >= 0.7 && (r.horas === null || r.horas < 24),
      dica: "Aceite ou dispense em até 1 dia. Sem resposta em 48 h, o Publike fecha por você e a curtida conta como não respondida.",
    });
  if (r.acompanha !== null)
    lista.push({
      chave: "acompanha",
      nome: "Acompanha",
      taxa: r.acompanha,
      texto: deCada10(r.acompanha, {
        todos: "Acompanha todos os matches depois do aceite",
        nenhum: "Quase não acompanha os matches depois do aceite",
        parte: (d) => `Acompanha ${d} de cada 10 matches depois do aceite`,
      }),
      comparacao: comparacao(r.melhorAcompanha, r.comparadas),
      bom: r.acompanha >= 0.7,
      dica: "Depois do match, chame no WhatsApp, mande uma mensagem ou mude a etapa do candidato (Em análise, Entrevista).",
    });
  if (r.retorno !== null)
    lista.push({
      chave: "retorno",
      nome: "Dá retorno",
      taxa: r.retorno,
      texto: deCada10(r.retorno, {
        todos: "Dá retorno final a todos os candidatos",
        nenhum: "Quase não dá retorno final aos candidatos",
        parte: (d) => `Dá retorno final a ${d} de cada 10 candidatos`,
      }),
      comparacao: comparacao(r.melhorRetorno, r.comparadas),
      bom: r.retorno >= 0.6,
      dica: "Quando a vaga fechar, marque quem foi contratado e dê o “Não foi dessa vez” aos outros: o candidato recebe o aviso e não fica esperando.",
    });
  return lista;
}

/** As linhas do e-mail da semana ("• Responde 9 de cada 10 curtidas, em geral em 3 horas (melhor que…)"). */
export function reputacaoNoEmail(r: Reputacao): string | null {
  if (r.curtidas < MINIMO_DE_CURTIDAS) return null;
  const lista = indicadores(r);
  if (!lista.length) return null;
  const linhas = lista.map((i) => `• ${i.texto}${i.comparacao ? ` (${i.comparacao})` : ""}`);
  const fraco = lista.find((i) => !i.bom);
  return `${linhas.join("\n")}${fraco ? `\n\nPara melhorar: ${fraco.dica}` : ""}`;
}
