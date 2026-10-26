import { Download, MessageCircle, Smartphone, UserPlus, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { Container } from "@/components/ui/basicos";
import { classesBotao } from "@/components/ui/botao";
import { ACEITAR_TESTE, APP_NA_PLAY, GRUPO_TESTADORES } from "@/lib/android";
import { SITE_URL } from "@/lib/config";

export const metadata: Metadata = {
  title: "Teste o app do Publike no Android",
  description:
    "Ajude o Publike a chegar no Google Play: entre no grupo dos testadores, aceite o teste e instale o app. Leva 2 minutos e é de graça.",
  alternates: { canonical: "/testar-app" },
};

// O convite do teste fechado da Play (conta pessoal: 12 testadores por 14 dias seguidos). Três passos,
// cada um com o seu botão. Página estática: os links ficam em src/lib/android.ts.

type Passo = { icone: LucideIcon; titulo: string; texto: string; botao: string; link: string; nota?: string };

const PASSOS: Passo[] = [
  {
    icone: UserPlus,
    titulo: "Entre no grupo dos testadores",
    texto: "Use a mesma conta Google do seu celular Android. No grupo, toque em “Participar do grupo”.",
    botao: "Entrar no grupo",
    link: GRUPO_TESTADORES,
    nota: "Só a equipe do Publike vê quem está no grupo. Ninguém recebe e-mail por causa dele.",
  },
  {
    icone: Smartphone,
    titulo: "Aceite o teste no Google Play",
    texto: "Abra o link e toque em “Tornar-se testador”.",
    botao: "Aceitar o teste",
    link: ACEITAR_TESTE,
    nota: "Apareceu que não está disponível? Espere uns minutos depois de entrar no grupo e abra de novo.",
  },
  {
    icone: Download,
    titulo: "Instale e use por 14 dias",
    texto:
      "Instale o Publike pelo Google Play e fique com ele no celular por 14 dias. Abra de vez em quando: é o mesmo Publike de sempre, com as vagas perto de você.",
    botao: "Instalar no Google Play",
    link: APP_NA_PLAY,
  },
];

const CONVITE = `Me ajuda a colocar o Publike no Google Play? Leva 2 minutos: ${SITE_URL}/testar-app`;

export default function TestarApp() {
  return (
    <Container className="max-w-2xl py-10 sm:py-14">
      <h1 className="text-h1 sm:text-display">Teste o app do Publike no Android</h1>
      <p className="mt-4 text-body-lg text-ink-muted">
        O Publike está chegando ao Google Play. Antes, o Google pede que pelo menos 12 pessoas testem o app por 14 dias
        seguidos. Leva 2 minutos, é de graça e ajuda muita gente a achar trabalho perto de casa.
      </p>

      <ol className="mt-8 flex flex-col gap-4">
        {PASSOS.map(({ icone: Icone, titulo, texto, botao, link, nota }, i) => (
          <li key={titulo} className="flex gap-4 rounded-lg border border-line bg-surface-200 p-5 shadow-card">
            <span
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-surface-300 text-label"
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="flex items-center gap-2 text-h3">
                <Icone aria-hidden className="size-5 shrink-0 text-terra-text" />
                {titulo}
              </h2>
              <p className="mt-1 text-body text-ink-muted">{texto}</p>
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className={classesBotao(i === 0 ? "primario" : "secundario", "md", "mt-4")}
              >
                {botao}
              </a>
              {nota && <p className="mt-3 text-body-sm text-ink-muted">{nota}</p>}
            </div>
          </li>
        ))}
      </ol>

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
        <a
          href={`https://wa.me/?text=${encodeURIComponent(CONVITE)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={classesBotao("secundario", "md", "mt-4")}
        >
          <MessageCircle aria-hidden />
          Mandar o convite no WhatsApp
        </a>
      </section>
    </Container>
  );
}
