import { NextResponse, type NextRequest } from "next/server";
import { MODO_DEMO } from "@/lib/config";
import { caminhoSeguro } from "@/lib/formato";
import { ehRedeSocial } from "@/lib/login-social";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// Volta do login com Google, Facebook, LinkedIn e do link mágico por e-mail.
// Troca o código pela sessão (cookies) e segue para /auth/continuar.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const proximo = caminhoSeguro(url.searchParams.get("next"), "/");
  const codigo = url.searchParams.get("code");
  const viaRede = ehRedeSocial(url.searchParams.get("via"));
  const base = process.env.NEXT_PUBLIC_SITE_URL ? process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "") : url.origin;
  const voltarComErro = (erro: string) =>
    NextResponse.redirect(`${base}/entrar?erro=${erro}&next=${encodeURIComponent(proximo)}`);

  // A rede social devolveu um erro: a pessoa cancelou, a conta não tem e-mail confirmado etc.
  const erroDaRede = url.searchParams.get("error");
  if (erroDaRede) {
    const detalhe = `${url.searchParams.get("error_code") ?? ""} ${url.searchParams.get("error_description") ?? ""}`.toLowerCase();
    if (detalhe.includes("banned")) return voltarComErro("suspensa");
    if (erroDaRede === "access_denied" && !detalhe.includes("email")) return voltarComErro("cancelado");
    if (detalhe.includes("email")) return voltarComErro("sem-email");
    return voltarComErro(viaRede ? "social" : "link");
  }

  if (codigo && !MODO_DEMO) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.exchangeCodeForSession(codigo);
    if (!error) {
      return NextResponse.redirect(`${base}/auth/continuar?next=${encodeURIComponent(proximo)}`);
    }
    if (error.code === "user_banned" || error.message.toLowerCase().includes("banned")) return voltarComErro("suspensa");
  }
  return voltarComErro(viaRede ? "social" : "link");
}
