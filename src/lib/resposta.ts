// Quanto quem publica responde as curtidas das vagas (aceitar, dispensar ou aceitar
// esperando o currículo). Vem do banco (resposta_de_quem_publica): a parte das curtidas
// respondidas e a mediana do tempo, só para quem tem 5 curtidas ou mais.

export type Resposta = { taxa: number; horas: number | null };

function quantas(taxa: number) {
  const dez = Math.round(taxa * 10);
  if (dez >= 10) return "todas as curtidas";
  if (dez <= 0) return "quase nenhuma curtida";
  return `${dez} de cada 10 curtidas`;
}

function prazo(horas: number) {
  if (horas < 24) return "no mesmo dia";
  if (horas < 48) return "em 1 dia";
  return `em ${Math.round(horas / 24)} dias`;
}

/**
 * No cartão: "Costuma responder em 2 dias" (quem responde 7 de cada 10 ou mais) ou
 * "Responde 4 de cada 10 curtidas". `longo`, na página da vaga: as duas coisas.
 */
export function comoResponde(r: Resposta, longo = false): { texto: string; bom: boolean } {
  const bom = r.taxa >= 0.7;
  if (longo) {
    return { texto: `Responde ${quantas(r.taxa)}${r.horas !== null ? `, em geral ${prazo(r.horas)}` : ""}`, bom };
  }
  if (bom && r.horas !== null) return { texto: `Costuma responder ${prazo(r.horas)}`, bom };
  return { texto: `Responde ${quantas(r.taxa)}`, bom };
}
