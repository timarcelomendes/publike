import type { NextConfig } from "next";

// Política de conteúdo (CSP): diz ao navegador de onde a página pode carregar scripts, estilos,
// imagens e conexões. Por enquanto só em "Report-Only": o navegador avisa no console o que seria
// bloqueado, sem bloquear nada. Depois de conferir o site publicado sem avisos, troque a chave para
// "Content-Security-Policy". Os scripts precisam de 'unsafe-inline' (o Next põe scripts na página).
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const POLITICA_DE_CONTEUDO = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://accounts.google.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com",
  `img-src 'self' data: blob: ${SUPABASE} https://tiles.openfreemap.org https://*.googleusercontent.com https://live.staticflickr.com https://*.staticflickr.com https://upload.wikimedia.org https://pixabay.com https://cdn.pixabay.com`,
  "font-src 'self'",
  `connect-src 'self' ${SUPABASE} ${SUPABASE.replace(/^http/, "ws")} https://tiles.openfreemap.org https://accounts.google.com https://challenges.cloudflare.com`,
  "frame-src https://accounts.google.com https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
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
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Content-Security-Policy-Report-Only", value: POLITICA_DE_CONTEUDO }]
            : []),
        ],
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
