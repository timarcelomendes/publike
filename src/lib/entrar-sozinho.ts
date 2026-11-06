// O login automático do Google (claude/plano-visitante-que-entra.md): quem já entrou no Publike com o Google entra
// sozinho na volta. Quem tocou em "Sair" (ou excluiu a conta) não entra sozinho de novo neste navegador: este cookie
// segura até a pessoa entrar outra vez, por qualquer jeito (o proxy apaga o cookie quando vê a conta aberta).

export const COOKIE_SAIU = "publike_saiu";
/** Um ano: o tempo do Google lembrar a conta. */
export const DURACAO_SAIU = 365 * 24 * 3600;
