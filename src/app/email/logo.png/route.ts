import { NextResponse, type NextRequest } from "next/server";
import { MODO_DEMO } from "@/lib/config";
import { LOGO_EMAIL } from "@/lib/email/montar";
import { criarClientePublico } from "@/lib/supabase/servidor";

// Endereço fixo da logo dos e-mails (publike.org/email/logo.png), para os
// modelos que ficam no Supabase: entrar e confirmar o cadastro. Leva para a
// imagem escolhida no admin ou para a logo do Publike. Os e-mails do site já
// saem com o endereço da imagem e não passam por aqui.
export async function GET(request: NextRequest) {
  let destino = new URL(LOGO_EMAIL.caminhoPadrao, request.url).toString();
  if (!MODO_DEMO) {
    try {
      const { data } = await criarClientePublico().rpc("logo_emails");
      const propria = data?.[0]?.url;
      if (propria && /^https?:\/\/[^\s"'<>\\]+$/.test(propria)) destino = propria;
    } catch {
      // sem o banco: vai a logo do Publike
    }
  }
  return NextResponse.redirect(destino, {
    status: 302,
    headers: { "Cache-Control": "public, max-age=600, s-maxage=600" },
  });
}
