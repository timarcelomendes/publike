import { Bus, HandCoins, Heart, ListChecks, Lock, MapPin, Store, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { SITE_URL } from "@/lib/config";
import { LIMITES_CONTA, REGIMES } from "@/lib/constantes";
import { CIDADES_ATENDIDAS, ONDE_FUNCIONA } from "@/lib/pracas";

export const metadata: Metadata = {
  title: "Para empresas: publique sua vaga grátis",
  description: `Loja, comércio do bairro ou empresa média: publique a vaga de graça e contrate gente que mora perto, em ${ONDE_FUNCIONA}. Você escolhe com quem conversar.`,
  alternates: { canonical: "/empresas" },
};

type Item = { icone: LucideIcon; titulo: string; texto: string };

const MOTIVOS: Item[] = [
  {
    icone: MapPin,
    titulo: "Quem mora perto vê primeiro",
    texto:
      "Com o CEP e o número, o pino fica na porta da sua loja. Cada pessoa vê a distância e o tempo de ônibus até aí.",
  },
  {
    icone: Bus,
    titulo: "Equipe que chega rápido",
    texto:
      "Quem mora perto gasta menos tempo e dinheiro com condução. Isso ajuda a oferecer melhores condições e a manter a equipe.",
  },
  {
    icone: Heart,
    titulo: "Você escolhe com quem conversar",
    texto:
      "Quem tem interesse curte a vaga. Você vê o perfil, o que a pessoa faz e o currículo, e curte de volta quem combina.",
  },
  {
    icone: Lock,
    titulo: "Seu WhatsApp não fica exposto",
    texto: "O contato só aparece quando dá match, e só para as duas pessoas. Nada de mensagem de quem nem leu a vaga.",
  },
  {
    icone: ListChecks,
    titulo: "Candidatos organizados",
    texto: "Acompanhe cada pessoa por etapa: novo, em análise, entrevista e contratado. A anotação fica só com você.",
  },
  {
    icone: HandCoins,
    titulo: "Grátis, sem plano",
    texto: `Publicar, ver candidatos e conversar não custam nada. Cada conta pode ter até ${LIMITES_CONTA.comum.noAr} vagas no ar.`,
  },
];

const PASSOS = [
  {
    titulo: "Publique a vaga",
    texto: "O que a pessoa vai fazer, quanto paga, o horário e o endereço. Leva uns dois minutos.",
  },
  {
    titulo: "Receba curtidas de quem mora perto",
    texto: "Quem se interessa curte a vaga, e você recebe um aviso no site e por e-mail.",
  },
  {
    titulo: "Curta de volta e converse",
    texto: "Deu match, o WhatsApp dos dois aparece. Marque a entrevista e acompanhe tudo pelo painel.",
  },
];

// os tipos de vaga que dá para publicar (menos "outro")
const TIPOS_DE_VAGA = Object.entries(REGIMES)
  .filter(([chave]) => chave !== "outro")
  .map(([, r]) => r.nome);

const { comum } = LIMITES_CONTA;

// perguntas e respostas da página, também para o Google (as mesmas que aparecem na tela)
const PERGUNTAS = [
  {
    p: "Quanto custa publicar uma vaga?",
    r: "Nada. Publicar, ver quem curtiu, dar match e conversar são grátis para empresas de qualquer tamanho, do MEI e do comércio do bairro à indústria.",
  },
  {
    p: "Preciso ter CNPJ?",
    r: "Não. Comércio e empresa podem informar o CNPJ, e o Publike puxa o nome da Receita para o seu perfil. Só agência de emprego ou RH precisa do CNPJ para criar a conta.",
  },
  {
    p: "Quantas vagas posso publicar?",
    r: `Cada conta pode ter até ${comum.noAr} vagas no ar ao mesmo tempo e publicar até ${comum.porDia} por dia. O limite é contra spam, não é cobrança.`,
  },
  {
    p: "Quanto tempo a vaga fica no ar?",
    r: "Você escolhe ao publicar: 15, 30, 60, 90 dias, outro prazo ou sem prazo (fica até você encerrar). Contratou? Marque “Vaga preenchida”: a vaga continua no site com a marcação e quem curtiu recebe o aviso.",
  },
  {
    p: "Onde o Publike funciona?",
    r: CIDADES_ATENDIDAS,
  },
];

export default function Empresas() {
  const dadosEstruturados = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: `${SITE_URL}/empresas`,
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
          <p className="flex items-center gap-2 text-caption text-ink-muted uppercase">
            <Store aria-hidden className="size-4 text-terra-text" />
            Para empresas
          </p>
          <h1 className="mt-2 max-w-3xl text-h1 sm:text-display">Contrate gente que mora perto do seu negócio.</h1>
          <p className="mt-4 max-w-2xl text-body-lg text-ink-muted">
            Da loja do bairro à empresa média: publique a vaga de graça em uns dois minutos. Quem mora perto vê
            primeiro, com o tempo de ônibus até aí, e você escolhe com quem conversar.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <BotaoLink href="/publicar" variante="primario">
              Publicar vaga grátis
            </BotaoLink>
            <BotaoLink href="#como">Ver como funciona</BotaoLink>
          </div>
        </Container>
      </section>

      <Container className="py-10">
        <section aria-labelledby="por-que">
          <h2 id="por-que" className="text-h2">
            Por que publicar no Publike
          </h2>
          <ul className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {MOTIVOS.map(({ icone: Icone, titulo, texto }) => (
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
        </section>

        <section aria-labelledby="como-titulo" id="como" className="mt-12 scroll-mt-24">
          <h2 id="como-titulo" className="text-h2">
            Como funciona
          </h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {PASSOS.map(({ titulo, texto }, i) => (
              <li key={titulo} className="rounded-lg border border-line bg-surface-200 p-5">
                <span className="flex size-8 items-center justify-center rounded-pill bg-terra-soft text-label text-terra-text">
                  {i + 1}
                </span>
                <h3 className="mt-3 text-h3">{titulo}</h3>
                <p className="mt-1 text-body-sm text-ink-muted">{texto}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="tipos" className="mt-12 max-w-3xl">
          <h2 id="tipos" className="text-h2">
            Que vaga dá para publicar
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {TIPOS_DE_VAGA.map((nome) => (
              <li key={nome} className="rounded-pill bg-surface-300 px-3 py-1.5 text-label">
                {nome}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-body text-ink-muted">
            De atendente, vendedor e auxiliar de cozinha a pedreiro para um reboco ou uma diária de faxina. É agência de
            emprego ou RH? Crie a conta como “Agência / RH”, com o CNPJ, e publique as vagas das empresas que você
            atende.
          </p>
        </section>

        <section aria-labelledby="perguntas" className="mt-12 max-w-3xl">
          <h2 id="perguntas" className="text-h2">
            Perguntas de quem contrata
          </h2>
          <dl className="mt-4 flex flex-col gap-5">
            {PERGUNTAS.map(({ p, r }) => (
              <div key={p}>
                <dt className="text-label">{p}</dt>
                <dd className="mt-1 text-body text-ink-muted">{r}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-body-sm text-ink-muted">
            Veja também o que mais é{" "}
            <Link href="/gratis" className="underline underline-offset-2 hover:text-ink">
              grátis no Publike
            </Link>
            .
          </p>
        </section>

        <section className="mt-12 rounded-lg border border-line bg-surface-200 p-6 sm:p-8">
          <h2 className="text-h2">Publique sua vaga hoje</h2>
          <p className="mt-2 max-w-2xl text-body">
            Sem senha: você recebe um link no e-mail. Na primeira vez a conta é criada na hora, e a vaga já aparece para
            quem mora perto.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <BotaoLink href="/publicar">Publicar vaga grátis</BotaoLink>
          </div>
        </section>
      </Container>
    </>
  );
}
