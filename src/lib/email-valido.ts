// O endereço de e-mail que o Publike aceita para mandar mensagem (claude/plano-seguranca.md, item 3): letras, números
// e . _ % + - antes do @, e um domínio com ponto. Sem aspas, ";", "(", "<", "," nem espaço: o leitor de endereços do
// envio (nodemailer) transforma "vitima;outro@site.com" em "outro@site.com", e o e-mail iria para outra pessoa, sem
// passar pelo limite por destinatário nem pelo "parar de receber". O banco confere o mesmo (privado.email_valido).

const EMAIL_SIMPLES = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$/i;

/** O endereço tem o formato simples que o Publike aceita (até 200 letras). */
export function emailValido(valor: unknown): valor is string {
  if (typeof valor !== "string") return false;
  const v = valor.trim();
  return v.length <= 200 && EMAIL_SIMPLES.test(v);
}

/** O endereço limpo (sem espaço nas pontas e em minúsculas), ou null se não tem o formato aceito. */
export function emailLimpo(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const v = valor.trim().toLowerCase();
  return emailValido(v) ? v : null;
}
