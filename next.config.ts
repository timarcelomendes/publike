import type { NextConfig } from "next";

// Política de conteúdo (CSP): diz ao navegador de onde a página pode carregar scripts, estilos,
// imagens e conexões. Por enquanto só em "Report-Only": o navegador avisa no console o que seria
// bloqueado, sem bloquear nada. Depois de conferir o site publicado sem avisos, troque a chave para
// "Content-Security-Policy". Os scripts precisam de 'unsafe-inline' (o Next põe scripts na página).
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// o Google Ads (só carrega depois do aceite dos cookies, google-ads.tsx): imagens e conexões das conversões
const GOOGLE_ADS =
  "https://www.googletagmanager.com https://www.google.com https://www.google.com.br https://googleads.g.doubleclick.net https://www.googleadservices.com";
// a entrevista ao vivo (Daily): a chamada abre num iframe da conta da Daily
const DAILY = "https://*.daily.co";
const POLITICA_DE_CONTEUDO = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://accounts.google.com https://challenges.cloudflare.com https://www.googletagmanager.com https://www.googleadservices.com https://googleads.g.doubleclick.net",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com",
  `img-src 'self' data: blob: ${SUPABASE} https://tiles.openfreemap.org https://*.googleusercontent.com https://live.staticflickr.com https://*.staticflickr.com https://upload.wikimedia.org https://pixabay.com https://cdn.pixabay.com ${GOOGLE_ADS}`,
  "font-src 'self'",
  `connect-src 'self' ${SUPABASE} ${SUPABASE.replace(/^http/, "ws")} https://tiles.openfreemap.org https://accounts.google.com https://challenges.cloudflare.com ${GOOGLE_ADS}`,
  `frame-src https://accounts.google.com https://challenges.cloudflare.com https://td.doubleclick.net https://www.googletagmanager.com ${DAILY}`,
  // os vídeos da entrevista gravada (a gravação na hora e o link assinado do Storage)
  `media-src 'self' blob: ${SUPABASE}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // os avisos do que seria bloqueado vão para /api/csp e aparecem em Admin › Falhas (claude/plano-seguranca.md, item 1)
  "report-uri /api/csp",
  "report-to csp",
].join("; ");

// Versão desta publicação: muda a cada deploy na Vercel. A página guarda a dela e /versao diz a
// do servidor; quando ficam diferentes, aparece o aviso "Tem uma versão nova" (aviso-atualizacao.tsx).
const VERSAO = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || `local-${Date.now()}`;

const nextConfig: NextConfig = {
  // não conta para quem visita qual é o servidor
  poweredByHeader: false,
  env: { NEXT_PUBLIC_VERSAO: VERSAO },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    qualities: [75],
  },
  // A tela de entrar procura os logos das redes no disco (login-social-servidor.ts).
  // Na Vercel, a pasta public não vai junto com o servidor; isto leva os logos.
  outputFileTracingIncludes: {
    "/entrar": ["./public/marcas/**/*"],
  },
  async redirects() {
    return [
      // a moderação agora fica dentro do admin
      { source: "/moderacao", destination: "/admin/denuncias", permanent: true },
      // endereço curto das instruções para apagar os dados (pedido no app do Facebook)
      { source: "/apagar-dados", destination: "/privacidade#apagar-dados", permanent: false },
      // endereços curtos das páginas de busca
      { source: "/vagas", destination: "/vagas/goiania", permanent: false },
      { source: "/servicos", destination: "/servicos/goiania", permanent: false },
      // a conversa era uma por vaga (anúncio + pessoa); agora é uma por pessoa (links antigos e e-mails)
      { source: "/painel/conversas/:anuncio/:outro", destination: "/painel/conversas/:outro", permanent: false },
      // os Talentos do painel agora são o "Para a sua vaga" da aba Talentos (o ?vaga= vai junto)
      { source: "/painel/talentos", destination: "/talentos", permanent: false },
      // "Avisos e notificações" virou Preferências (os links dos e-mails já enviados)
      { source: "/perfil/avisos", destination: "/perfil/preferencias", permanent: true },
      // o recado da linha do tempo virou post (09/11/2026): os links já mandados no WhatsApp continuam abrindo
      { source: "/recado/:id", destination: "/post/:id", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        // tudo, menos o quadro de vagas que as empresas colocam no site delas (/embed/vagas/<id>):
        // ele manda os próprios cabeçalhos e pode ficar dentro de um iframe em outro site
        source: "/((?!embed/).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          // a câmera e o microfone só para o próprio site (o currículo falado e a entrevista gravada) e para a chamada
          // da Daily (a entrevista ao vivo abre num iframe de <conta>.daily.co, sala-da-entrevista.tsx)
          {
            key: "Permissions-Policy",
            value: `camera=(self "${DAILY}"), microphone=(self "${DAILY}"), display-capture=(self "${DAILY}"), geolocation=(self)`,
          },
          ...(process.env.NODE_ENV === "production"
            ? [
                { key: "Content-Security-Policy-Report-Only", value: POLITICA_DE_CONTEUDO },
                { key: "Reporting-Endpoints", value: 'csp="/api/csp"' },
              ]
            : []),
        ],
      },
      // links com segredo (claude/plano-seguranca.md, item 6): nada do endereço sai para outro site nem para a próxima
      // página (vem depois da regra geral, que também manda Referrer-Policy: esta vence)
      {
        source: "/:rota(acesso|cliente|candidatura|convite|equipe|finalistas|relatorio)/:segredo*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      {
        // o script que as empresas colam no site: muda pouco, mas não fica preso por dias
        source: "/embed.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        // o navegador sempre confere se há versão nova do service worker
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
