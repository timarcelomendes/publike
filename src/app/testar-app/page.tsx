import { Globe, Info, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import { ContarVisitaTesteApp, LinkDoTesteApp } from "@/components/numeros-teste-app";
import { PassosDoTesteApp } from "@/components/passos-teste-app";
import { QueroTestar } from "@/components/quero-testar";
import { Container } from "@/components/ui/basicos";
import { BotaoLink, classesBotao } from "@/components/ui/botao";
import { SITE_URL } from "@/lib/config";

export const metadata: Metadata = {
  title: "Teste o app do Publike no Android",
  description:
    "Ajude o Publike a chegar no Google Play: entre no grupo dos testadores, aceite o teste e instale o app. Leva 2 minutos e é de graça.",
  alternates: { canonical: "/testar-app" },
};

// O convite do teste fechado da Play (conta pessoal: 12 testadores por 14 dias seguidos). No alto, por que são
// 3 passos (quem chega pelo "Instalar app" queria só instalar) e "Prefiro usar pelo site"; os passos, em ordem
// (PassosDoTesteApp: o Instalar só abre depois do Aceitar). Página estática: os links ficam em src/lib/android.ts.
// Conta quem abre (e de onde veio, pelo ?de= do link) e os toques em cada passo, sem saber quem (src/lib/teste-app.ts).

const CONVITE = `Me ajuda a colocar o Publike no Google Play? Leva 2 minutos: ${SITE_URL}/testar-app?de=whatsapp`;

export default function TestarApp() {
  return (
    <Container className="max-w-2xl py-10 sm:py-14">
      <ContarVisitaTesteApp />
      <h1 className="text-h1 sm:text-display">Teste o app do Publike no Android</h1>
      <p className="mt-4 text-body-lg text-ink-muted">
        O Publike está chegando ao Google Play. Antes, o Google pede que pelo menos 12 pessoas testem o app por 14 dias
        seguidos. Leva 2 minutos, é de graça e ajuda muita gente a achar trabalho perto de casa.
      </p>

      <div className="mt-6 flex gap-3 rounded-lg bg-surface-300 p-4">
        <Info aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
        <div className="flex flex-col gap-3">
          <p className="text-body">
            <strong>Por que não é só instalar?</strong> Enquanto está em teste, o Google Play só mostra o app para quem
            entrou no grupo e aceitou o teste. Faça os 3 passos em ordem: são 3 toques.
          </p>
          <div>
            <BotaoLink href="/" variante="fantasma" tamanho="sm">
              <Globe aria-hidden />
              Prefiro usar pelo site
            </BotaoLink>
          </div>
        </div>
      </div>

      <PassosDoTesteApp />

      <section id="quero-testar" className="mt-8 scroll-mt-24 rounded-lg border border-line bg-surface-200 p-5">
        <h2 className="text-h3">Prefere receber o link no WhatsApp?</h2>
        <p className="mt-1 mb-4 text-body text-ink-muted">
          Sem entrar em grupo: deixe o e-mail da sua conta Google e a equipe do Publike manda o link do teste no seu
          WhatsApp. Precisa ter conta no Publike.
        </p>
        <QueroTestar />
      </section>

      <section className="mt-8 rounded-lg border border-line bg-surface-200 p-5">
        <h2 className="text-h3">Tem iPhone?</h2>
        <p className="mt-1 text-body text-ink-muted">
          O app é só para Android por enquanto. No iPhone, use o site e ponha o Publike na Tela de Início: no Safari,
          toque em Compartilhar e depois em “Adicionar à Tela de Início”.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-h3">Chame mais gente</h2>
        <p className="mt-1 text-body text-ink-muted">Quanto mais gente testar, mais rápido o app chega para todos.</p>
        <LinkDoTesteApp
          evento="whatsapp"
          href={`https://wa.me/?text=${encodeURIComponent(CONVITE)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={classesBotao("secundario", "md", "mt-4")}
        >
          <MessageCircle aria-hidden />
          Mandar o convite no WhatsApp
        </LinkDoTesteApp>
      </section>
    </Container>
  );
}
