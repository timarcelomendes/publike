import {
  BadgeCheck,
  Bell,
  FileText,
  HandHeart,
  Heart,
  Megaphone,
  Search,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { CONTATO_EMAIL, SITE_URL } from "@/lib/config";
import { LIMITES_CONTA } from "@/lib/constantes";

export const metadata: Metadata = {
  title: "O Publike é grátis",
  description:
    "Procurar trabalho, publicar vaga ou serviço, curtir e conversar não custam nada no Publike. Veja o que é grátis, os limites contra spam e como o Publike se mantém.",
  alternates: { canonical: "/gratis" },
};

type Item = { icone: LucideIcon; titulo: string; texto: string };

const GRATIS: Item[] = [
  {
    icone: Search,
    titulo: "Procurar vagas e serviços",
    texto: "Pela distância e pelo tempo de ônibus da sua casa. Dá para olhar sem nem criar conta.",
  },
  {
    icone: Megaphone,
    titulo: "Publicar vagas e serviços",
    texto:
      "Com carteira, diária, freelance ou serviço. A vaga fica no ar pelo prazo que você escolher (ou sem prazo), e dá para renovar.",
  },
  {
    icone: Heart,
    titulo: "Curtir, dar match e conversar",
    texto: "Deu match, o WhatsApp aparece para os dois. Ninguém paga para ver contato.",
  },
  {
    icone: FileText,
    titulo: "Currículo",
    texto: "Monte o seu aqui ou anexe o PDF. Quem anunciou a vaga que você curtiu vê.",
  },
  {
    icone: BadgeCheck,
    titulo: "Vitrine de serviços",
    texto: "Fotos dos trabalhos, recomendações de quem conhece você e avaliações de quem contratou.",
  },
  {
    icone: Bell,
    titulo: "Avisos",
    texto: "No site e por e-mail: curtida, match, mensagem nova e vaga nova onde você segue.",
  },
];

const NUNCA = [
  "Ninguém paga para se candidatar nem para ver uma vaga.",
  "Ninguém paga para ver o contato: o WhatsApp aparece no match.",
  "Não vendemos seus dados.",
  "Agência de emprego e RH publicam de graça e não podem cobrar nada de quem se candidata: nem cadastro, nem entrevista, nem curso, nem exame.",
  "Se alguém pedir dinheiro para você conseguir uma vaga, é golpe. Denuncie o anúncio.",
];

const PROMESSA =
  "O básico do Publike vai continuar grátis, sempre: procurar, publicar, curtir, dar match e conversar. Se um dia existir alguma coisa paga, ela vai ser opcional, vamos avisar antes e ela nunca vai ser cobrada de quem procura trabalho.";

const { comum, agenciaVerificada, recadosPorDia } = LIMITES_CONTA;
const LIMITE =
  `Tem, mas não é cobrança: é contra spam, para as vagas de verdade não sumirem no meio de anúncio repetido. ` +
  `Cada conta pode ter até ${comum.noAr} anúncios no ar ao mesmo tempo e publicar até ${comum.porDia} por dia. ` +
  `Agência de emprego ou RH com o CNPJ conferido pela equipe pode ter até ${agenciaVerificada.noAr} vagas no ar e publicar ${agenciaVerificada.porDia} por dia. ` +
  `Na linha do tempo, cada conta escreve até ${recadosPorDia} recados por dia.`;

const SUSTENTO =
  "Hoje o Publike é mantido pelo fundador, com o apoio de parceiros que acreditam em emprego perto de casa. Os gastos são com servidores, mapas, envio dos e-mails de aviso e a IA que revisa os anúncios. Parceiros não recebem seus dados e não escolhem quais vagas aparecem primeiro: a ordem é pela distância e pelo que combina com você.";

// perguntas e respostas da página, também para o Google (as mesmas que aparecem na tela)
const PERGUNTAS = [
  {
    p: "O Publike é grátis mesmo?",
    r: "Sim. Procurar, publicar vaga ou serviço, curtir, dar match e conversar não custam nada, para quem procura trabalho, para quem presta serviço e para empresas de qualquer tamanho.",
  },
  { p: "Vai continuar grátis?", r: PROMESSA },
  { p: "Tem limite de vagas?", r: LIMITE },
  { p: "Como o Publike se mantém?", r: SUSTENTO },
];

function Cartoes({ itens }: { itens: Item[] }) {
  return (
    <ul className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {itens.map(({ icone: Icone, titulo, texto }) => (
        <li key={titulo} className="flex gap-4 rounded-lg border border-line bg-surface-200 p-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-surface-300">
            <Icone aria-hidden className="size-5 text-terra-text" />
          </span>
          <div>
            <h3 className="text-label">{titulo}</h3>
            <p className="mt-1 text-body-sm text-ink-muted">{texto}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

const linkTexto = "underline underline-offset-2 hover:text-ink";

export default function Gratis() {
  const dadosEstruturados = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: `${SITE_URL}/gratis`,
    mainEntity: PERGUNTAS.map(({ p, r }) => ({
      "@type": "Question",
      name: p,
      acceptedAnswer: { "@type": "Answer", text: r },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // sem "<" no JSON: nada fecha a tag de script antes da hora
        dangerouslySetInnerHTML={{ __html: JSON.stringify(dadosEstruturados).replace(/</g, "\\u003c") }}
      />
      <section className="border-b border-line">
        <Container className="py-10 sm:py-14">
          <p className="text-caption text-ink-muted uppercase">É grátis</p>
          <h1 className="mt-2 max-w-3xl text-h1 sm:text-display">
            No Publike, ninguém paga para trabalhar nem para contratar.
          </h1>
          <p className="mt-4 max-w-2xl text-body-lg text-ink-muted">
            Procurar vaga, oferecer serviço, publicar, curtir, dar match e conversar não custam nada. Para quem procura
            trabalho, para quem presta serviço e para empresas de qualquer tamanho, do MEI à indústria.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <BotaoLink href="/publicar" variante="primario">
              Publicar vaga grátis
            </BotaoLink>
            <BotaoLink href="/#busca">Ver vagas perto de mim</BotaoLink>
          </div>
        </Container>
      </section>

      <Container className="py-10">
        <section aria-labelledby="o-que-e-gratis">
          <h2 id="o-que-e-gratis" className="text-h2">
            O que é grátis
          </h2>
          <p className="mt-2 max-w-2xl text-body text-ink-muted">Tudo o que o Publike faz hoje:</p>
          <Cartoes itens={GRATIS} />
        </section>

        <section aria-labelledby="promessa" className="mt-12 rounded-lg bg-surface-300 p-6 sm:p-8">
          <h2 id="promessa" className="flex items-center gap-2 text-h2">
            <HandHeart aria-hidden className="size-7 shrink-0 text-terra-text" />
            Vai continuar grátis?
          </h2>
          <p className="mt-3 max-w-3xl text-body-lg">{PROMESSA}</p>
        </section>

        <section aria-labelledby="nunca" className="mt-12 max-w-3xl">
          <h2 id="nunca" className="text-h2">
            O que nunca acontece aqui
          </h2>
          <ul className="mt-4 flex flex-col gap-2 text-body">
            {NUNCA.map((frase) => (
              <li key={frase} className="flex gap-3">
                <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-pill bg-ink" />
                <span>{frase}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-body-sm text-ink-muted">
            As regras completas estão em{" "}
            <Link href="/privacidade#regras" className={linkTexto}>
              Privacidade e regras
            </Link>
            .
          </p>
        </section>

        <section aria-labelledby="limite" className="mt-12 max-w-3xl">
          <h2 id="limite" className="text-h2">
            Tem limite de vagas?
          </h2>
          <p className="mt-3 text-body">{LIMITE}</p>
          <p className="mt-3 text-body-sm text-ink-muted">
            Precisa de mais?{" "}
            {CONTATO_EMAIL ? (
              <a href={`mailto:${CONTATO_EMAIL}`} className={linkTexto}>
                Fale com a gente
              </a>
            ) : (
              <Link href="/sugerir" className={linkTexto}>
                Fale com a gente
              </Link>
            )}{" "}
            e conte o seu caso.
          </p>
        </section>

        <section aria-labelledby="sustento" className="mt-12 max-w-3xl">
          <h2 id="sustento" className="text-h2">
            Como o Publike se mantém?
          </h2>
          <p className="mt-3 text-body">{SUSTENTO}</p>
          <p className="mt-3 text-body-sm text-ink-muted">
            Sua empresa ou instituição quer apoiar?{" "}
            {CONTATO_EMAIL ? (
              <a href={`mailto:${CONTATO_EMAIL}`} className={linkTexto}>
                Escreva para a gente
              </a>
            ) : (
              <Link href="/sugerir" className={linkTexto}>
                Escreva para a gente
              </Link>
            )}
            .
          </p>
        </section>

        <section className="mt-12 rounded-lg border border-line bg-surface-200 p-6 sm:p-8">
          <h2 className="text-h2">Comece agora</h2>
          <p className="mt-2 max-w-2xl text-body">
            Publique a vaga com o endereço certo e quem mora perto vê primeiro. Procura trabalho ou clientes? Diga o
            CEP de casa e veja o que está a poucos minutos de você.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <BotaoLink href="/publicar">Publicar grátis</BotaoLink>
            <BotaoLink href="/?casa=1#busca">Informar meu CEP</BotaoLink>
          </div>
        </section>
      </Container>
    </>
  );
}
