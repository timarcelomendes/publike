import type { Metadata } from "next";
import { Suspense } from "react";
import { AbasBase, AbasPainel } from "@/components/painel/abas";
import { Container } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil } from "@/lib/dados";

export const metadata: Metadata = {
  title: "Meu painel",
  robots: { index: false },
};

export default function LayoutPainel({ children }: LayoutProps<"/painel">) {
  return (
    <Container className="py-8">
      <h1 className="text-h2 sm:text-h1">Meu painel</h1>
      <Suspense fallback={<AbasBase ativa={null} />}>
        <AbasDaConta />
      </Suspense>
      <div className="mt-6">{children}</div>
    </Container>
  );
}

/** A aba "Candidatos" aparece para quem contrata: comércio, empresa e agência. */
async function AbasDaConta() {
  const perfil = MODO_DEMO ? null : await obterMeuPerfil();
  return <AbasPainel candidatos={Boolean(perfil && perfil.tipo !== "pessoa")} />;
}
