import "server-only";
import { cookies } from "next/headers";
import { COOKIE_CONVERSAO, lerConversoes, type Conversao } from "@/lib/google-ads";

/**
 * Marca um momento que vale para a campanha (cadastro, currículo, vaga, candidatura). O navegador
 * avisa o Google só se a pessoa aceitou os cookies de propaganda (google-ads.tsx). Só nas ações.
 */
export async function marcarConversao(nome: Conversao) {
  try {
    const loja = await cookies();
    const atuais = lerConversoes(loja.get(COOKIE_CONVERSAO)?.value);
    const todas = [...new Set([...atuais, nome])];
    loja.set(COOKIE_CONVERSAO, todas.join(","), { path: "/", maxAge: 600, sameSite: "lax", httpOnly: false });
  } catch {
    // fora de uma ação (não dá para gravar cookie): fica sem a conversão
  }
}
