import { ACEITAR_TESTE, APP_NA_PLAY } from "@/lib/android";
import { normalizarWhatsapp } from "@/lib/validacao";

// Admin › Testadores do app (migração 20270128120000): o convite para o teste fechado na Play pela lista de e-mails
// (sem o Grupo do Google) e a leitura da lista colada. O admin manda pelo WhatsApp ou pelo e-mail dele.

export type Testador = {
  id: string;
  nome: string;
  email: string;
  whatsapp: string | null;
  whatsapp_em: string | null;
  email_em: string | null;
  criado_em: string;
  /** a conta do Publike com o mesmo e-mail (migração 20270128120000, de novo) */
  conta_id?: string | null;
  conta_nome?: string | null;
  conta_whatsapp?: string | null;
};

/** O WhatsApp para o convite: o da lista ou, sem ele, o da conta do Publike com o mesmo e-mail. */
export const whatsappDoTestador = (t: Testador) => t.whatsapp || t.conta_whatsapp || null;

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome;

export function mensagemWhatsappDoTeste(t: Pick<Testador, "nome" | "email">) {
  return [
    `Oi, ${primeiroNome(t.nome)}! Tudo bem? Coloquei seu e-mail na lista de quem testa o app do Publike no Google Play.`,
    "",
    "São 2 toques, no celular Android:",
    `1. Abra este link e toque em "Quero participar": ${ACEITAR_TESTE}`,
    `2. Depois toque em "Baixar no Google Play" e instale: ${APP_NA_PLAY}`,
    "",
    `Importante: use o celular com a conta Google ${t.email}. E deixe o app instalado por 14 dias, que é o que o Google pede para liberar o app para todo mundo.`,
    "",
    "Obrigado pela força! Qualquer coisa, me chama aqui.",
  ].join("\n");
}

export const ASSUNTO_EMAIL_DO_TESTE = "Seu convite para testar o app do Publike";

export function mensagemEmailDoTeste(t: Pick<Testador, "nome" | "email">) {
  return [
    `Oi, ${primeiroNome(t.nome)}!`,
    "",
    `Obrigado por topar ajudar. Já coloquei o seu e-mail (${t.email}) na lista de testadores do app do Publike no Google Play. Não precisa entrar em grupo nenhum.`,
    "",
    "No celular Android, com essa mesma conta Google:",
    `1. Abra o link: ${ACEITAR_TESTE}`,
    '2. Toque em "Quero participar" (ou "Become a tester").',
    `3. Toque em "Baixar no Google Play" e instale o Publike: ${APP_NA_PLAY}`,
    "",
    `Se aparecer "app não disponível", o celular está com outra conta Google. Troque para ${t.email} na Play Store e abra o link de novo.`,
    "",
    "O Google pede que o app fique instalado por 14 dias seguidos antes de liberar para todo mundo. Se puder, abra o app de vez em quando nesses dias.",
    "",
    "Muito obrigado!",
    "Marcelo, do Publike",
  ].join("\n");
}

export function linkEmailDoTeste(t: Pick<Testador, "nome" | "email">) {
  return `mailto:${encodeURIComponent(t.email)}?subject=${encodeURIComponent(ASSUNTO_EMAIL_DO_TESTE)}&body=${encodeURIComponent(mensagemEmailDoTeste(t))}`;
}

const EMAIL = /[^\s,;<>()"']+@[^\s,;<>()"']+\.[^\s,;<>()"']+/;

/**
 * A lista colada, uma pessoa por linha, em qualquer ordem: o nome, o e-mail e o WhatsApp (opcional), separados por
 * vírgula, ponto e vírgula ou tab ("Ana Souza, ana@gmail.com, (62) 99999-0000"). Sem nome, vale o começo do e-mail.
 */
export function lerListaDeTestadores(texto: string) {
  const lista: { nome: string; email: string; whatsapp: string | null }[] = [];
  const erros: string[] = [];
  for (const [i, bruta] of texto.split(/\r?\n/).entries()) {
    const linha = bruta.trim();
    if (!linha) continue;
    const email = linha.match(EMAIL)?.[0]?.toLowerCase();
    if (!email) {
      erros.push(`Linha ${i + 1}: falta o e-mail.`);
      continue;
    }
    const resto = linha.replace(EMAIL, " ");
    // o número: o trecho com 3 ou mais algarismos (com espaço, ponto, traço ou parênteses no meio)
    const telefone = resto.match(/\+?\(?\d[\d\s().-]*\d/)?.[0] ?? "";
    const whatsapp = telefone ? normalizarWhatsapp(telefone) : "";
    if (telefone.replace(/\D/g, "").length >= 3 && !/^55[1-9]\d{9,10}$/.test(whatsapp))
      erros.push(`Linha ${i + 1}: confira o WhatsApp (DDD + número).`);
    const nome =
      resto
        .replace(telefone, " ")
        .split(/[,;\t]/)
        .map((p) => p.trim())
        .find((p) => /\p{L}/u.test(p))
        ?.slice(0, 80) ?? email.split("@")[0];
    if (lista.some((l) => l.email === email)) continue;
    lista.push({ nome, email, whatsapp: /^55[1-9]\d{9,10}$/.test(whatsapp) ? whatsapp : null });
  }
  return { lista: lista.slice(0, 200), erros };
}
