import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Roda antes de cada página: renova a sessão do Supabase (cookies) e
// manda para /entrar quem tenta abrir uma página que exige login.
// As permissões de verdade ficam no banco (RLS) e nas ações do servidor.

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const CHAVE =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const SO_COM_LOGIN = [/^\/publicar/, /^\/painel/, /^\/perfil$/, /^\/admin/, /^\/anuncio\/[^/]+\/denunciar$/];

// O admin abre sem login no computador do dono (npm run dev com PUBLIKE_ADMIN=1
// e a chave secreta). A página confere tudo de novo; aqui só não pedimos login.
const ADMIN_LOCAL =
  process.env.NODE_ENV === "development" && process.env.PUBLIKE_ADMIN === "1" && Boolean(process.env.SUPABASE_SECRET_KEY);
const ENDERECO_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d{2,5})?$/i;

export async function proxy(request: NextRequest) {
  if (!URL_SUPABASE || !CHAVE) return NextResponse.next(); // modo demonstração

  let resposta = NextResponse.next({ request });

  const supabase = createServerClient(URL_SUPABASE, CHAVE, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(lista, cabecalhos) {
        for (const { name, value } of lista) request.cookies.set(name, value);
        resposta = NextResponse.next({ request });
        for (const { name, value, options } of lista) resposta.cookies.set(name, value, options);
        for (const [chave, valor] of Object.entries(cabecalhos ?? {})) resposta.headers.set(chave, valor);
      },
    },
  });

  // Não coloque código entre createServerClient e getClaims (recomendação do Supabase).
  const { data } = await supabase.auth.getClaims();
  const logado = Boolean(data?.claims?.sub);

  const { pathname, search } = request.nextUrl;
  const adminLocal =
    ADMIN_LOCAL && pathname.startsWith("/admin") && ENDERECO_LOCAL.test(request.headers.get("host") ?? "");
  if (!logado && !adminLocal && request.method === "GET" && SO_COM_LOGIN.some((r) => r.test(pathname))) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/entrar";
    destino.search = `?next=${encodeURIComponent(pathname + search)}`;
    const redirecionar = NextResponse.redirect(destino);
    for (const cookie of resposta.cookies.getAll()) redirecionar.cookies.set(cookie);
    return redirecionar;
  }

  return resposta;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|opengraph-image|manifest.webmanifest|robots.txt|sitemap.xml|logo/|icons/|vendor/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mjs|woff2)$).*)",
  ],
};
