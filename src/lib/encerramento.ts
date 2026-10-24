/**
 * Por que a vaga ou o serviço foi encerrado (a pergunta, opcional, dentro da confirmação do "Encerrar").
 * O banco guarda em `privado.encerramentos` (migração 20261109120000_motivo_do_encerramento.sql), com a
 * mesma lista de valores.
 */
export const MOTIVOS_ENCERRAMENTO = {
  contratei_publike: "Contratei alguém pelo Publike",
  contratei_fora: "Contratei por outro lugar",
  poucos_candidatos: "Recebi poucos candidatos",
  desisti: "Desisti da vaga",
  nao_atendo: "Não faço mais esse serviço",
  sem_agenda: "Estou sem agenda agora",
  outro: "Outro motivo",
} as const;

export type MotivoEncerramento = keyof typeof MOTIVOS_ENCERRAMENTO;

/** As opções de cada tipo, na ordem da tela. */
export const MOTIVOS_DO_TIPO: Record<"vaga" | "servico", MotivoEncerramento[]> = {
  vaga: ["contratei_publike", "contratei_fora", "poucos_candidatos", "desisti", "outro"],
  servico: ["nao_atendo", "sem_agenda", "outro"],
};
