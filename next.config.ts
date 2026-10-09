import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
