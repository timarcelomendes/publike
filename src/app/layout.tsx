import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";
import { Assistente } from "@/components/assistente/assistente";
import { AvisoCookies } from "@/components/aviso-cookies";
import { AvisoDepois } from "@/components/aviso-depois";
import { BannerDaVisita } from "@/components/banner-da-visita";
import { GoogleAds } from "@/components/google-ads";
import { BoasVindasParceiro } from "@/components/boas-vindas-parceiro";
import { AvisoAtualizacao } from "@/components/aviso-atualizacao";
import { Cabecalho } from "@/components/cabecalho";
import { ContarTempo } from "@/components/contar-tempo";
import { ConviteInstalar } from "@/components/instalar-app";
import { AvisoDemo, BarraInferior, Rodape, RodapeCurto } from "@/components/navegacao";
import { RodapeDaPagina } from "@/components/rodape-da-pagina";
import { SoOlharDaConta } from "@/components/so-olhar-da-conta";
import { MODO_DEMO, SITE_URL } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { SCRIPT_PEDIDO } from "@/lib/instalar";
import { COR_BARRA, SCRIPT_TEMA } from "@/lib/tema";
import { SCRIPT_TOQUE_CEDO } from "@/lib/toque-cedo";
import "./globals.css";
import { CIDADES_DAS_PRACAS, ONDE_FUNCIONA } from "@/lib/pracas";

// Fontes da interface (Design System), servidas pelo próprio site.
const figtree = localFont({
  src: "./fonts/figtree-latin-wght-normal.woff2",
  variable: "--font-figtree",
  weight: "300 900",
  display: "swap",
});

const bricolage = localFont({
  src: "./fonts/bricolage-grotesque-latin-opsz-normal.woff2",
  variable: "--font-bricolage",
  weight: "200 800",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `Publike · Vagas de emprego em ${CIDADES_DAS_PRACAS}, diárias, freelances e serviços perto de você`,
    template: "%s · Publike",
  },
  description: `Ferramenta gratuita para gerar emprego em ${ONDE_FUNCIONA}: vagas, diárias e freelances perto de casa, com a distância e o tempo de ônibus, e empresas de todos os tamanhos achando profissionais do bairro.`,
  applicationName: "Publike",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Publike",
  },
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, title: "Publike", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // claro por padrão; no escuro, o components/tema.tsx troca a cor
  themeColor: COR_BARRA.claro,
};

async function RodapeDaConta() {
  const usuario = MODO_DEMO ? null : await obterUsuario();
  return <RodapeDaPagina completo={<Rodape />} curto={<RodapeCurto />} logado={Boolean(usuario)} />;
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // o SCRIPT_TEMA marca data-tema no <html> antes do React (por isso o suppressHydrationWarning)
    <html
      lang="pt-BR"
      className={`${figtree.variable} ${bricolage.variable}`}
      data-tema="claro"
      suppressHydrationWarning
    >
      <head>
        {/* claro, automático ou escuro: aplica a escolha antes de pintar a página */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
        {/* guarda o "pode instalar" do navegador, que chega antes do React (instalar-app.tsx) */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_PEDIDO }} />
        {/* o toque num botão antes de a página ficar pronta não se perde (lib/toque-cedo.ts) */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TOQUE_CEDO }} />
      </head>
      <body className="flex min-h-dvh flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0 [html[data-sem-barra]_&]:pb-0">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface-200 focus:px-4 focus:py-2 focus:shadow-raised"
        >
          Pular para o conteúdo
        </a>
        <Cabecalho />
        {/* empresa, comércio ou agência vendo como pessoa: a faixa do "só olhar" (lê o cookie e a conta) */}
        <Suspense fallback={null}>
          <SoOlharDaConta />
        </Suspense>
        {MODO_DEMO && <AvisoDemo />}
        <main id="conteudo" className="flex-1">
          {children}
        </main>
        {/* lê o endereço da página e a conta (quem entrou, painel e perfil: rodapé curto; entrar: sem rodapé) */}
        <Suspense fallback={null}>
          <RodapeDaConta />
        </Suspense>
        <BarraInferior />
        <Assistente />
        {/* lê o endereço da página: no build, precisa estar num Suspense */}
        <Suspense fallback={null}>
          <BoasVindasParceiro />
          <AvisoCookies />
          {/* só carrega o Google depois do "Aceitar" no aviso de cookies */}
          <GoogleAds />
        </Suspense>
        <AvisoAtualizacao />
        {/* o "salvo" de uma ação que levou para outra página (lib/aviso-depois.ts); lê o endereço da página */}
        <Suspense fallback={null}>
          <AvisoDepois />
        </Suspense>
        {/* lê o endereço da página: no build, precisa estar num Suspense */}
        <Suspense fallback={null}>
          <ConviteInstalar />
        </Suspense>
        {/* os banners do admin (Admin › Banners), nas páginas que cada um escolheu; lê a conta e o endereço */}
        <Suspense fallback={null}>
          <BannerDaVisita />
        </Suspense>
        {/* o tempo de cada página na tela, sem saber quem (lib/tempo-na-pagina.ts); lê o endereço da página */}
        <Suspense fallback={null}>
          <ContarTempo />
        </Suspense>
      </body>
    </html>
  );
}
