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
const COOKIE_APARELHO = "publike_aparelho";
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

// A troca de página dentro do site: o roteador do Next pede a página com o cabeçalho next-url (o proxy não
// vê o "rsc"). O pré-carregamento dos links também passa: ele só acontece com a página aberta, então a
// pessoa está on-line do mesmo jeito.
function trocouDePagina(request: NextRequest) {
  if (request.method !== "GET" || FORA_DA_CONTA.test(request.nextUrl.pathname)) return false;
  const h = request.headers;
  if (!h.has("next-url")) return false;
  return !ROBO.test(h.get("user-agent") ?? "");
}

// quem está on-line: o cookie segura a marcação por 2 minutos (o admin conta os últimos 5)
const COOKIE_ONLINE = "publike_online";
function marcarCookieOnline(resposta: NextResponse) {
  resposta.cookies.set(COOKIE_ONLINE, "1", {
    maxAge: 120,
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIES_DA_SESSAO.secure,
    path: "/",
  });
}

// A conta do dia: o primeiro pedido de cada dia com a conta (a página, a troca de página ou a ação que vem logo
// depois de entrar) marca a conta em contas_ativas, mesmo com a marcação de on-line (2 minutos) ainda valendo.
// Sem isso, quem criava a conta e saía em 2 ou 3 minutos não contava: depois do login, o site leva à página
// seguinte pela própria ação (sem pedir a página), e o /entrar já tinha marcado o on-line (30/10/2026).
const COOKIE_CONTA_DIA = "publike_conta_dia";
const DIA_EM_BRASILIA = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
function marcaDaConta(conta: string) {
  return `${conta.slice(0, 8)}.${DIA_EM_BRASILIA.format(new Date())}`;
}
function marcarContaDoDia(resposta: NextResponse, marca: string) {
  resposta.cookies.set(COOKIE_CONTA_DIA, marca, {
    maxAge: 24 * 3600,
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIES_DA_SESSAO.secure,
    path: "/",
  });
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
  const conta = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  const marca = conta ? marcaDaConta(conta) : null;
  const contaJaContada = !marca || request.cookies.get(COOKIE_CONTA_DIA)?.value === marca;
  if (ip && abriuPagina(request)) {
    // depois da resposta: a página não espera a conta (contar_acesso também marca quem está on-line)
    marcarCookieOnline(resposta);
    if (marca) marcarContaDoDia(resposta, marca);
    evento.waitUntil(
      Promise.resolve(
        supabase.rpc("contar_acesso", { p_ip: ip, p_navegador: request.headers.get("user-agent") ?? "" }),
      ).then(({ error }) => {
        if (error) console.warn(`Publike: não deu para contar o acesso: ${error.message}`);
      }),
    );
  } else if (
    ip &&
    ((trocouDePagina(request) && !request.cookies.has(COOKIE_ONLINE)) ||
      // a conta que ainda não contou hoje (a ação logo depois do login, a aba aberta da véspera)
      (!contaJaContada &&
        !FORA_DA_CONTA.test(request.nextUrl.pathname) &&
        !ROBO.test(request.headers.get("user-agent") ?? "")))
  ) {
    // a troca de página dentro do site: só "está on-line" (no máximo a cada 2 minutos por pessoa)
    marcarCookieOnline(resposta);
    if (marca) marcarContaDoDia(resposta, marca);
    evento.waitUntil(
      Promise.resolve(
        supabase.rpc("marcar_online", { p_ip: ip, p_navegador: request.headers.get("user-agent") ?? "" }),
      ).then(({ error }) => {
        if (error) console.warn(`Publike: não deu para marcar quem está on-line: ${error.message}`);
      }),
    );
  }

  // quem entrou: o navegador deste acesso, para o admin ver o aparelho (no máximo a cada 6 horas por
  // aparelho; aberto pelo app Android, sempre). O app abre o site com o referer android-app://.
  const doApp = (request.headers.get("referer") ?? "").startsWith("android-app://");
  if (logado && abriuPagina(request) && (doApp || !request.cookies.has(COOKIE_APARELHO))) {
    resposta.cookies.set(COOKIE_APARELHO, doApp ? "app" : "1", {
      maxAge: 6 * 3600,
      httpOnly: true,
      sameSite: "lax",
      secure: COOKIES_DA_SESSAO.secure,
      path: "/",
    });
    evento.waitUntil(
      Promise.resolve(
        supabase.rpc("marcar_aparelho", { p_navegador: request.headers.get("user-agent") ?? "", p_app: doApp }),
      ).then(({ error }) => {
        if (error) console.warn(`Publike: não deu para guardar o aparelho: ${error.message}`);
      }),
    );
  }

  const { pathname, search } = request.nextUrl;
  const adminLocal =
    ADMIN_LOCAL && pathname.startsWith("/admin") && ENDERECO_LOCAL.test(request.headers.get("host") ?? "");
  // a vitrine sem conta: dá para preencher antes de entrar (o convite pede conta, e segue para o /entrar)
  if (
    !logado &&
    request.method === "GET" &&
    pathname === "/painel/servicos" &&
    !request.nextUrl.searchParams.has("convite")
  ) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/vitrine";
    destino.search = "";
    const redirecionar = NextResponse.redirect(destino);
    for (const cookie of resposta.cookies.getAll()) redirecionar.cookies.set(cookie);
    return redirecionar;
  }
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
