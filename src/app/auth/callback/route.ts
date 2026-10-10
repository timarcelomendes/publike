import { NextResponse, type NextRequest } from "next/server";
import { MODO_DEMO } from "@/lib/config";
import { caminhoSeguro } from "@/lib/formato";
import { linkDeEntradaValido } from "@/lib/link-entrada";
import { ehRedeSocial } from "@/lib/login-social";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// Volta do login com Google, Facebook, LinkedIn e do link de entrar por e-mail.
//
// Link do e-mail (modelos em supabase/emails/): chega aqui com token_hash e
// vai para /auth/confirmar, que entra com um toque (ou sozinha, no navegador).
// A sessão nasce no navegador que abriu o link, seja qual for: celular,
// computador ou o navegador de dentro do app de e-mail. Quem só lê o link
// (antivírus do e-mail, prévia de mensagem) não gasta a entrada.
//
// Links antigos do Supabase e as redes sociais chegam com ?code=: troca o
// código pela sessão (cookies) e segue para /auth/continuar.

function enderecoBase(request: NextRequest) {
  return process.env.NEXT_PUBLIC_SITE_URL
    ? process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "")
    : request.nextUrl.origin;
}

function ehSuspensa(erro: { code?: string; message: string }) {
  return erro.code === "user_banned" || erro.message.toLowerCase().includes("banned");
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const proximo = caminhoSeguro(url.searchParams.get("next"), "/");
  const codigo = url.searchParams.get("code");
  const viaRede = ehRedeSocial(url.searchParams.get("via"));
  const base = enderecoBase(request);
  const voltarComErro = (erro: string) =>
    NextResponse.redirect(`${base}/entrar?erro=${erro}&next=${encodeURIComponent(proximo)}`);

  // A rede social devolveu um erro: a pessoa cancelou, a conta não tem e-mail confirmado etc.
  const erroDaRede = url.searchParams.get("error");
  if (erroDaRede) {
    const detalhe =
      `${url.searchParams.get("error_code") ?? ""} ${url.searchParams.get("error_description") ?? ""}`.toLowerCase();
    if (detalhe.includes("banned")) return voltarComErro("suspensa");
    if (erroDaRede === "access_denied" && !detalhe.includes("email")) return voltarComErro("cancelado");
    if (detalhe.includes("email")) return voltarComErro("sem-email");
    return voltarComErro(viaRede ? "social" : "link");
  }

  // Link do e-mail: a entrada acontece na página de confirmação.
  const tokenHash = url.searchParams.get("token_hash");
  if (tokenHash) {
    const tipo = url.searchParams.get("type") ?? "email";
    if (!linkDeEntradaValido(tokenHash, tipo)) return voltarComErro("link");
    const params = new URLSearchParams({ token_hash: tokenHash, type: tipo, next: proximo });
    return NextResponse.redirect(`${base}/auth/confirmar?${params}`);
  }

  if (codigo && !MODO_DEMO) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.exchangeCodeForSession(codigo);
    if (!error) {
      return NextResponse.redirect(`${base}/auth/continuar?next=${encodeURIComponent(proximo)}`);
    }
    if (ehSuspensa(error)) return voltarComErro("suspensa");
  }
  return voltarComErro(viaRede ? "social" : "link");
}

// O botão de /auth/confirmar: confere o link no Supabase e abre a sessão aqui.
export async function POST(request: NextRequest) {
  const base = enderecoBase(request);
  const dados = await request.formData().catch(() => null);
  const campo = (nome: string) => {
    const v = dados?.get(nome);
    return typeof v === "string" ? v : null;
  };
  const proximo = caminhoSeguro(campo("next"), "/");
  const tokenHash = campo("token_hash") ?? "";
  const tipo = campo("type") ?? "";
  // 303: depois do envio do formulário, o navegador segue com GET.
  const ir = (destino: string) => NextResponse.redirect(`${base}${destino}`, 303);
  const voltarComErro = (erro: string) => ir(`/entrar?erro=${erro}&next=${encodeURIComponent(proximo)}`);
  const continuar = () => ir(`/auth/continuar?next=${encodeURIComponent(proximo)}`);

  // Só vale o envio feito pela página do próprio site (o navegador diz de onde veio).
  const origem = request.headers.get("origin");
  if (origem && origem !== new URL(base).origin && origem !== request.nextUrl.origin) return voltarComErro("link");
  if (MODO_DEMO || !linkDeEntradaValido(tokenHash, tipo)) return voltarComErro("link");

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo as "email" });
  if (!error) return continuar();
  if (ehSuspensa(error)) return voltarComErro("suspensa");
  // Link já usado, mas a pessoa já entrou com ele (tocou duas vezes ou voltou
  // para a página): segue em frente.
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) return continuar();
  return voltarComErro("link");
}
