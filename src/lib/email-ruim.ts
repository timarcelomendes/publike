import { emailValido } from "./email-valido";

// O endereço de e-mail que com certeza não é de ninguém (20/11/2026; Marcelo: "os e-mails estão vindo muitos ruins", com
// o aviso de 123@gmail.com que não existe). A base da Receita traz o que o contador digitou: 123@gmail.com,
// teste@hotmail.com, nao@tem.com, o domínio com erro (gmial.com). Sem pergunta à internet: o DNS fica em
// src/lib/servidor/email-empresas.ts.

const LOCAIS_DE_MENTIRA = new Set(
  (
    "teste test testes email e-mail mail naotem nao-tem nao_tem naopossui nao sem semEmail sememail nenhum nada xxx " +
    "xxxx xx x aaa aaaa abc abcd asd asdf qwe qwerty exemplo example fulano usuario user null none naoinformado " +
    "nao.informado nao-informado nt na sn"
  )
    .toLowerCase()
    .split(" "),
);

/** Os domínios de exemplo e os erros de digitação dos grandes, que não recebem e-mail. */
const DOMINIOS_RUINS = new Set(
  (
    "example.com exemplo.com exemplo.com.br teste.com teste.com.br test.com email.com.br naotem.com nao.com " +
    "tem.com xxx.com gmial.com gamil.com gmal.com gmai.com gmail.co gmail.con gmail.cm gmail.om gnail.com " +
    "gmail.com.br hotmial.com hotmal.com hotmai.com hotmail.co hotmail.con homail.com hotamil.com " +
    "outlok.com outloo.com outlook.co yahoo.co yaho.com.br yahooo.com.br yaoo.com.br bol.com bol.co"
  ).split(" "),
);

/** Por que o endereço é de mentira ("123@gmail.com": só números curtos), ou null se pode ser de alguém. */
export function motivoDeEmailRuim(email: string): string | null {
  const e = email.trim().toLowerCase();
  const arroba = e.lastIndexOf("@");
  if (arroba < 1) return "sem o @";
  const local = e.slice(0, arroba);
  const dominio = e.slice(arroba + 1);
  if (DOMINIOS_RUINS.has(dominio)) return `o domínio ${dominio} não recebe e-mail (erro de digitação ou de exemplo)`;
  if (/^\d{1,6}$/.test(local)) return "endereço de mentira (só números)";
  if (/^(.)\1+$/.test(local)) return "endereço de mentira (a mesma letra repetida)";
  if (LOCAIS_DE_MENTIRA.has(local)) return `endereço de mentira (${local}@)`;
  // o nome do domínio repetido antes do @ num domínio de e-mail grátis ("gmail@gmail.com")
  if (/^(gmail|hotmail|outlook|yahoo|bol|uol|terra|live|icloud)$/.test(local)) return `endereço de mentira (${local}@)`;
  return null;
}

/**
 * Os avisos de "não entregue" na caixa (do mailer-daemon ou do postmaster, dos últimos 7 dias): os endereços com erro
 * permanente (5.x.x), com o motivo. Só lê (sem marcar como lido): a caixa fica como o Marcelo deixou.
 */
export function enderecosQueVoltaram(texto: string): { email: string; motivo: string }[] {
  const t = texto.replace(/=\r?\n/g, "");
  // erro permanente: o código 5.x.x ou a frase do aviso
  const permanente = /\b5\.\d{1,3}\.\d{1,3}\b|failed permanently|does not exist|user unknown|no such user|mailbox unavailable|não existe/i;
  if (!permanente.test(t)) return [];
  const codigo = t.match(/\b(5\d\d)[ -](5\.\d{1,3}\.\d{1,3})\b/);
  const motivo = codigo ? `voltou: ${codigo[1]} ${codigo[2]} (o endereço não existe ou não recebe)` : "voltou: não entregue";
  const achados = new Set<string>();
  // o relatório padrão (Final-Recipient) e o do Titan/GoDaddy ("* fulano@site.com")
  for (const m of t.matchAll(/Final-Recipient:\s*rfc822;\s*<?([^\s<>;]+@[^\s<>;]+)>?/gi)) achados.add(m[1].toLowerCase());
  for (const m of t.matchAll(/^\s*\*\s*<?([^\s<>@]+@[^\s<>]+?)>?\s*$/gm)) achados.add(m[1].toLowerCase());
  return [...achados].filter((e) => emailValido(e)).map((email) => ({ email, motivo }));
}

