import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { COOKIES_DA_SESSAO } from "@/lib/config";
import { COOKIE_ORIGEM, DURACAO_ORIGEM, origemDoLink } from "@/lib/origem";
import { areaDoSlug, cidadeDoSlug } from "@/lib/paginas-busca";

// Roda antes de cada página: renova a sessão do Supabase (cookies) e
// manda para /entrar quem tenta abrir uma página que exige login.
// As permissões de verdade ficam no banco (RLS) e nas ações do servidor.

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const CHAVE =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// /publicar abre sem conta: a vaga é preenchida antes e publicada depois de entrar
const SO_COM_LOGIN = [/^\/painel/, /^\/perfil$/, /^\/admin/, /^\/anuncio\/[^/]+\/denunciar$/];

// O admin abre sem login no computador do dono (npm run dev com PUBLIKE_ADMIN=1
// e a chave secreta). A página confere tudo de novo; aqui só não pedimos login.
const ADMIN_LOCAL =
  process.env.NODE_ENV === "development" && process.env.PUBLIKE_ADMIN === "1" && Boolean(process.env.SUPABASE_SECRET_KEY);
const ENDERECO_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d{2,5})?$/i;

// Páginas de busca (/vagas/goiania/limpeza): cidade ou área que não existe responde 404
// de verdade (a página lê o endereço dentro de um Suspense e não consegue mudar o status).
const BUSCA = /^\/(?:vagas|servicos)\/([^/]+)(?:\/([^/]+))?\/?$/;
function buscaInexistente(pathname: string) {
  const m = BUSCA.exec(pathname);
  if (!m) return false;
  const area = m[2] ? areaDoSlug(m[2]) : null;
  return !cidadeDoSlug(m[1]) || (m[2] !== undefined && (!area || area.slug === "outros"));
}

// Chegou pelo link de uma campanha (?utm_source=google&utm_campaign=servicos): guarda só
// "google:servicos" por 7 dias; vale a primeira. /auth/continuar grava quando a conta é nova.
function marcarOrigem(request: NextRequest, resposta: NextResponse) {
  if (request.method !== "GET" || request.cookies.has(COOKIE_ORIGEM)) return;
  const origem = origemDoLink(request.nextUrl.searchParams);
  if (!origem) return;
  resposta.cookies.set(COOKIE_ORIGEM, origem, {
    maxAge: DURACAO_ORIGEM,
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIES_DA_SESSAO.secure,
    path: "/",
  });
}

// Quantas pessoas abrem o site (o painel do admin mostra). Só página aberta por gente:
// sem robô, sem pré-carregamento, sem admin e sem as rotas internas. O banco não guarda o IP.
const ROBO =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|lighthouse|headless|curl|wget|python|axios|node-fetch|go-http|java\/|okhttp/i;
const FORA_DA_CONTA = /^\/(admin|api|auth|embed|email|versao|pagina-que-nao-existe)(\/|$)/;

function abriuPagina(request: NextRequest) {
  if (request.method !== "GET" || FORA_DA_CONTA.test(request.nextUrl.pathname)) return false;
  const h = request.headers;
  if (h.get("next-router-prefetch") || /prefetch/i.test(`${h.get("purpose") ?? ""}${h.get("sec-purpose") ?? ""}`))
    return false;
  // só a página aberta inteira (link, endereço digitado, recarregar). A navegação dentro do site
  // não passa: ela não se separa do pré-carregamento, e a pessoa já foi contada na entrada.
  const pagina = h.get("sec-fetch-mode") === "navigate" || (h.get("accept") ?? "").includes("text/html");
  return pagina && !ROBO.test(h.get("user-agent") ?? "");
}

function ipDe(request: NextRequest) {
  const h = request.headers;
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
}

export async function proxy(request: NextRequest, evento: NextFetchEvent) {
  if (buscaInexistente(request.nextUrl.pathname)) {
    return NextResponse.rewrite(new URL("/pagina-que-nao-existe", request.url), { status: 404 });
  }
  if (!URL_SUPABASE || !CHAVE) return NextResponse.next(); // modo demonstração

  let resposta = NextResponse.next({ request });

  const supabase = createServerClient(URL_SUPABASE, CHAVE, {
    cookieOptions: COOKIES_DA_SESSAO,
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

  marcarOrigem(request, resposta);

  const ip = ipDe(request);
  if (ip && abriuPagina(request)) {
    // depois da resposta: a página não espera a conta
    evento.waitUntil(
      Promise.resolve(
        supabase.rpc("contar_acesso", { p_ip: ip, p_navegador: request.headers.get("user-agent") ?? "" }),
      ).then(({ error }) => {
        if (error) console.warn(`Publike: não deu para contar o acesso: ${error.message}`);
      }),
    );
  }

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
    "/((?!_next/static|_next/image|versao$|favicon.ico|icon.svg|apple-icon.png|opengraph-image|manifest.webmanifest|sw.js|offline.html|googleb0f816f2a734c818.html|robots.txt|sitemap.xml|logo/|icons/|vendor/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mjs|woff2)$).*)",
  ],
};
