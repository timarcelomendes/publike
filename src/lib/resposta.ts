// Quanto quem publica responde as curtidas das vagas (aceitar, dispensar ou aceitar
// esperando o currículo). Vem do banco (resposta_de_quem_publica): a parte das curtidas
// respondidas e a mediana do tempo, só para quem tem 5 curtidas ou mais. Com a migração
// 20270302120000, também a parte das respondidas sem ninguém clicar (automáticas) e, delas,
// as do contato direto (aceita na hora): o texto deixa claro quando foi automático. Com a 20270415120000, só os últimos
// 30 dias, e "parado" quando ninguém da conta abre o Publike há mais de 7 dias (aí o texto não promete o prazo).

export type Resposta = {
  taxa: number;
  horas: number | null;
  /** das respondidas, quantas sem ninguém clicar (0 a 1); null: o banco ainda não diz */
  automaticas?: number | null;
  /** das respondidas, quantas pelo contato direto (0 a 1) */
  diretas?: number | null;
  /** a conta (e a equipe) não abre o Publike há mais de 7 dias (migração 20270415120000) */
  parado?: boolean | null;
};

/** Uma linha de resposta_de_quem_publica (sem a migração 20270302120000, sem as automáticas). */
export function lerResposta(r: {
  taxa: number;
  horas: number | null;
  automaticas?: number | null;
  diretas?: number | null;
  parado?: boolean | null;
}): Resposta {
  return {
    taxa: Number(r.taxa),
    horas: r.horas === null ? null : Number(r.horas),
    automaticas: r.automaticas == null ? null : Number(r.automaticas),
    diretas: r.diretas == null ? null : Number(r.diretas),
    parado: r.parado ?? null,
  };
}

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
 * No cartão: "Responde em 2 dias" (quem responde 7 de cada 10 ou mais; curto para caber ao lado do Curtir no celular) ou
 * "Responde 4 de cada 10 curtidas". `longo`, na página da vaga: as duas coisas.
 */
export function comoResponde(r: Resposta, longo = false): { texto: string; bom: boolean } {
  const automaticas = r.automaticas ?? 0;
  const pelaMaquina = automaticas >= 0.9;
  // a maior parte pelo contato direto (7 de cada 10 ou mais): o anúncio aceitou na hora, sem alguém responder
  const peloDireto = (r.diretas ?? 0) >= 0.7;
  // sem abrir o Publike há mais de 7 dias: não promete o prazo ("no mesmo dia") nem conta como bom
  const parado = r.parado === true;
  if (peloDireto) {
    return longo
      ? { texto: `Aceita ${quantas(r.taxa)} na hora, pelo contato direto (automático, sem alguém responder)`, bom: false }
      : { texto: "Aceita na hora (contato direto)", bom: true };
  }
  const bom = r.taxa >= 0.7 && !pelaMaquina && !parado;
  if (longo) {
    const base = parado
      ? `Respondia ${quantas(r.taxa)}, mas não entra no Publike há mais de 7 dias`
      : `Responde ${quantas(r.taxa)}${r.horas !== null ? `, em geral ${prazo(r.horas)}` : ""}`;
    if (pelaMaquina) return { texto: `${base} (automático, sem alguém responder)`, bom };
    if (automaticas >= 0.1) {
      const dez = Math.round(automaticas * 10);
      const como = (r.diretas ?? 0) >= automaticas / 2 ? "pelo contato direto" : "automáticas";
      return { texto: `${base} (${dez} de cada 10 ${como})`, bom };
    }
    return { texto: base, bom };
  }
  // quase tudo sem alguém clicar (automação, regra ou o Publike fechando em 48 h): não diz que "responde"
  if (pelaMaquina) return { texto: "Resposta automática", bom: false };
  if (parado) return { texto: "Sem entrar há mais de 7 dias", bom: false };
  if (bom && r.horas !== null) return { texto: `Responde ${prazo(r.horas)}`, bom };
  return { texto: `Responde ${quantas(r.taxa)}`, bom };
}
