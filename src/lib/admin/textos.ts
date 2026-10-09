// Textos do admin que aparecem em mais de uma tela.

const ACOES: Record<string, string> = {
  salvar_config: "salvou as configurações de",
  remover_anuncio: "removeu o anúncio",
  liberar_anuncio: "liberou o anúncio",
  editar_anuncio: "corrigiu o anúncio",
  excluir_anuncio: "apagou de vez o anúncio",
  suspender: "suspendeu a conta de",
  banir: "baniu a conta de",
  reativar: "reativou a conta de",
  verificar: "deu o selo de verificado para",
  tirar_verificado: "tirou o selo de verificado de",
  excluir_conta: "apagou a conta de",
  adicionar_moderador: "pôs na moderação",
  remover_moderador: "tirou da moderação",
  salvar_modelo: "mudou o texto do e-mail",
  restaurar_modelo: "voltou ao original o texto do e-mail",
  criar_chave: "criou a chave do servidor",
  apagar_chave: "apagou a chave do servidor",
};

// Na ficha da própria conta ou do próprio anúncio, o alvo já está na tela.
const ACOES_SEM_ALVO: Record<string, string> = {
  remover_anuncio: "removeu o anúncio",
  liberar_anuncio: "liberou o anúncio",
  editar_anuncio: "corrigiu o anúncio",
  excluir_anuncio: "apagou o anúncio de vez",
  suspender: "suspendeu a conta",
  banir: "baniu a conta",
  reativar: "reativou a conta",
  verificar: "deu o selo de verificado",
  tirar_verificado: "tirou o selo de verificado",
  excluir_conta: "apagou a conta",
  adicionar_moderador: "pôs na moderação",
  remover_moderador: "tirou da moderação",
};

export function descreverAcao(acao: string, semAlvo = false) {
  if (semAlvo) return ACOES_SEM_ALVO[acao] ?? ACOES[acao] ?? acao.replace(/_/g, " ");
  return ACOES[acao] ?? acao.replace(/_/g, " ");
}

/** Motivos que a IA usa para reter um anúncio. */
export const CATEGORIAS_IA: Record<string, string> = {
  cobranca: "Cobra para contratar",
  golpe: "Parece golpe",
  discriminacao: "Discriminação",
  trabalho_infantil: "Trabalho infantil",
  trabalho_degradante: "Trabalho degradante",
  conteudo_improprio: "Conteúdo impróprio",
  spam: "Spam ou propaganda",
  contato: "Contato à mostra",
  outro: "Outro",
};

export const NOMES_MODELOS_EMAIL: Record<string, string> = {
  curtida: "Curtida",
  match: "Match",
  em_analise: "Anúncio em análise",
  removido: "Anúncio removido",
  liberado: "Anúncio liberado",
  conta_suspensa: "Conta suspensa",
  conta_banida: "Conta banida",
  conta_reativada: "Conta reativada",
  aviso_denuncia: "Nova denúncia",
  aviso_cadastro: "Novo cadastro",
  aviso_retirado: "Anúncio tirado do ar",
  teste: "Teste",
};

export const STATUS_EMAIL: Record<string, string> = {
  pendente: "Na fila",
  enviando: "Enviando",
  enviado: "Enviado",
  falhou: "Falhou",
  cancelado: "Cancelado",
};
