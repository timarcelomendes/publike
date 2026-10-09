import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Cabecalho } from "@/components/cabecalho";
import { AvisoDemo, BarraInferior, Rodape } from "@/components/navegacao";
import { MODO_DEMO, SITE_URL } from "@/lib/config";
import "./globals.css";

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
    default: "Publike · Vagas, freelances e serviços perto de você",
    template: "%s · Publike",
  },
  description:
    "Ferramenta gratuita para gerar emprego em Goiânia e região: vagas, diárias e freelances perto de casa, com a distância e o tempo de ônibus, e empresas de todos os tamanhos achando profissionais do bairro.",
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf7ef" },
    { media: "(prefers-color-scheme: dark)", color: "#17130f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${figtree.variable} ${bricolage.variable}`}>
      <body className="flex min-h-dvh flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface-200 focus:px-4 focus:py-2 focus:shadow-raised"
        >
          Pular para o conteúdo
        </a>
        <Cabecalho />
        {MODO_DEMO && <AvisoDemo />}
        <main id="conteudo" className="flex-1">
          {children}
        </main>
        <Rodape />
        <BarraInferior />
      </body>
    </html>
  );
}
