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

// Os domínios digitados errado mais comuns (26/11/2026, Marcelo: "varandas360@gamil.com... dar opção de ajuste"): o
// certo de cada um. Só o domínio inteiro; o resto do endereço fica como está.
const DOMINIOS_CERTOS: Record<string, string> = {
  "gamil.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.om": "gmail.com",
  "gmail.com.br": "gmail.com",
  "gnail.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gmail.coom": "gmail.com",
  "hotmal.com": "hotmail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "hotmil.com": "hotmail.com",
  "homail.com": "hotmail.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "outlook.con": "outlook.com",
  "yahooo.com": "yahoo.com",
  "yaho.com": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "yahoo.com.b": "yahoo.com.br",
  "bol.com": "bol.com.br",
  "uol.com": "uol.com.br",
  "icloud.con": "icloud.com",
  "iclod.com": "icloud.com",
};

/** O endereço com o domínio certo, quando o digitado é um erro comum ("x@gamil.com" → "x@gmail.com"); senão, null. */
export function emailCorrigido(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const v = valor.trim().toLowerCase();
  const arroba = v.lastIndexOf("@");
  if (arroba < 1) return null;
  const certo = DOMINIOS_CERTOS[v.slice(arroba + 1)];
  return certo ? `${v.slice(0, arroba)}@${certo}` : null;
}
