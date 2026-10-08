import type { Metadata } from "next";
import { Suspense } from "react";
import { AbasBase, AbasPainel } from "@/components/painel/abas";
import { Container } from "@/components/ui/basicos";

export const metadata: Metadata = {
  title: "Meu painel",
  robots: { index: false },
};

export default function LayoutPainel({ children }: LayoutProps<"/painel">) {
  return (
    <Container className="py-8">
      <h1 className="text-h2 sm:text-h1">Meu painel</h1>
      <Suspense fallback={<AbasBase ativa={null} />}>
        <AbasPainel />
      </Suspense>
      <div className="mt-6">{children}</div>
    </Container>
  );
}
