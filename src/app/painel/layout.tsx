import type { Metadata } from "next";
import { Suspense } from "react";
import { ContarContato } from "@/components/contar-contato";
import { MenuDaConta } from "@/components/painel/menu-da-conta";
import { MenuPainelEsqueleto } from "@/components/painel/menu-painel";
import { Container } from "@/components/ui/basicos";

export const metadata: Metadata = { title: "Meu painel", robots: { index: false } };

// O painel: o menu do modo (Contratar, Trabalhar ou Serviços) na coluna da esquerda e a
// página ao lado. No celular, o menu vira uma linha em cima da página (menos nas Mensagens).
export default function LayoutPainel({ children }: LayoutProps<"/painel">) {
  return (
    <Container className="py-6 sm:py-8">
      <h1 className="sr-only">Meu painel</h1>
      <div
        data-painel-grade
        className="flex flex-col gap-6 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-10"
      >
        {/* o "‹ Painel" do celular agora faz parte do "Voltar" do site (src/components/voltar.tsx) */}
        {/* nas Mensagens, o celular fica sem a linha do menu (elas marcam o html: SemLinhaDoPainel) */}
        <div className="lg:sticky lg:top-20 [html[data-sem-linha-painel]_&]:max-lg:hidden">
          <Suspense fallback={<MenuPainelEsqueleto />}>
            <MenuDaConta />
          </Suspense>
        </div>
        <div className="min-w-0">
          {children}
        </div>
        {/* o toque no WhatsApp, telefone ou e-mail de um candidato (Admin › Retorno) */}
        <ContarContato />
      </div>
    </Container>
  );
}
