// O celular do login (20/11/2026; migração 20270818120000, privado.telefone_do_login faz o mesmo no banco).
//
// O Supabase Auth guarda só os dígitos, sem o "+", e acha a conta por eles. O WhatsApp guarda o celular sem o 9
// (556282028335) e as pessoas digitam com ou sem: sem um formato só, a mesma pessoa viraria duas contas. Por isso o
// login usa sempre o 55 e, no celular do Brasil (começa de 6 a 9), o 9. O fixo (começa de 2 a 5, como o WhatsApp
// Business em linha fixa) fica como está.

/** "(62) 8202-8335", "62982028335", "+55 62 98202-8335" → "5562982028335". Inválido: null. */
export function telefoneDoLogin(valor: string): string | null {
  let d = valor.replace(/\D/g, "");
  if (/^55\d{10,11}$/.test(d)) d = d.slice(2);
  if (/^[1-9][1-9]9\d{8}$/.test(d)) return `55${d}`;
  if (/^[1-9][1-9][6-9]\d{7}$/.test(d)) return `55${d.slice(0, 2)}9${d.slice(2)}`;
  if (/^[1-9][1-9][2-5]\d{7}$/.test(d)) return `55${d}`;
  return null;
}

/** Os jeitos de escrever o mesmo número: o do login e, no celular, o sem o 9 (o do WhatsApp). */
export function numerosDoWhatsapp(valor: string): string[] {
  const t = telefoneDoLogin(valor);
  if (!t) return [];
  return /^55[1-9][1-9]9\d{8}$/.test(t) ? [t, `${t.slice(0, 4)}${t.slice(5)}`] : [t];
}
