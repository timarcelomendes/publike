import {
  Bus,
  CalendarClock,
  Check,
  HandCoins,
  Heart,
  ListChecks,
  Lock,
  MapPin,
  Megaphone,
  Store,
  UserSearch,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Container, Selo } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { SITE_URL } from "@/lib/config";
import { LIMITES_CONTA, REGIMES } from "@/lib/constantes";
import { CIDADES_ATENDIDAS, ONDE_FUNCIONA } from "@/lib/pracas";

export const metadata: Metadata = {
  title: "Para empresas: publique sua vaga grátis",
  description: `Loja, comércio do bairro ou empresa média: publique a vaga de graça e contrate gente que mora perto, em ${ONDE_FUNCIONA}. Você escolhe com quem conversar.`,
  alternates: { canonical: "/empresas" },
};

type Item = { icone: LucideIcon; titulo: string; texto: string; link?: { href: string; texto: string } };

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
    icone: UserSearch,
    titulo: "Ache gente mesmo sem vaga aberta",
    texto:
      "Na aba Talentos, veja o currículo de quem mora perto e procura trabalho, e convide para a sua vaga. Também é grátis.",
    link: { href: "/talentos", texto: "Ver os talentos" },
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
    titulo: "Grátis, sem limite de candidatos",
    texto: `Publicar, ver todos os candidatos e conversar no WhatsApp não custam nada: sem plano e sem pagar por currículo. Cada conta pode ter até ${LIMITES_CONTA.comum.noAr} vagas no ar.`,
  },
];

// O que os maiores sites de vaga cobram (ou limitam no plano grátis) e no Publike é grátis. Levantamento de
// outubro de 2026 (claude/analise-competitiva.md no projeto). Sem nome de concorrente: o que eles cobram muda.
const PAGO_POR_AI: { o: string; la: string; aqui: string }[] = [
  {
    o: "Ver o contato de todos os candidatos",
    la: "No plano grátis, só de alguns",
    aqui: "Todos, sem limite",
  },
  {
    o: "Falar com o candidato no WhatsApp",
    la: "Complemento pago",
    aqui: "Grátis, quando dá match",
  },
  {
    o: "Achar quem mora perto (bairro e distância)",
    la: "Só nos planos pagos",
    aqui: "Grátis, com o tempo de ônibus",
  },
  {
    o: "Perguntas para o candidato e testes",
    la: "Só nos planos pagos",
    aqui: "Grátis",
  },
  {
    o: "Selo de contratação urgente",
    la: "Pago",
    aqui: "Grátis: “Começa já”",
  },
  {
    o: "Mais de uma vaga no ar",
    la: "Uma vaga grátis por vez",
    aqui: `Até ${LIMITES_CONTA.comum.noAr} vagas no ar`,
  },
  {
    o: "Divulgação da vaga",
    la: "Você paga o impulsionamento",
    aqui: "Anúncios todo dia no Instagram, Facebook e Google, pagos pelo Publike",
  },
  {
    o: "Aparecer para quem procura",
    la: "Destaque pago por clique",
    aqui: "Quem mora perto vê primeiro, sem pagar",
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
    p: "Tem limite de candidatos?",
    r: "Não. Todo mundo que curtir a vaga aparece para você, com o perfil e o currículo de quem tem, e o WhatsApp dos dois aparece quando der match. Ver candidato e conversar não são pagos, nem depois de um número de contatos.",
  },
  {
    p: "Preciso ter CNPJ?",
    r: "Não. Comércio e empresa podem informar o CNPJ, e o Publike puxa o nome da Receita para o seu perfil. Só agência de emprego ou RH precisa do CNPJ para criar a conta.",
  },
  {
    p: "Quantas vagas posso publicar?",
    r: `Cada conta pode ter até ${comum.noAr} vagas no ar ao mesmo tempo e publicar até ${comum.porDia} por dia. Agência de emprego ou RH com o CNPJ conferido pela equipe vai a ${LIMITES_CONTA.agenciaVerificada.noAr} vagas no ar e ${LIMITES_CONTA.agenciaVerificada.porDia} por dia. O limite é contra spam, não é cobrança.`,
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
          <ul className="mt-5 flex flex-wrap gap-2" aria-label="O que é grátis">
            {["Sem plano", "Sem limite de candidatos", "WhatsApp sem pagar"].map((t) => (
              <li
                key={t}
                className="inline-flex items-center gap-1.5 rounded-pill bg-surface-300 px-3 py-1.5 text-label"
              >
                <Check aria-hidden className="size-4 text-cerrado-text" />
                {t}
              </li>
            ))}
          </ul>
          <p className="mt-4 flex max-w-2xl items-start gap-2 rounded-md border-l-4 border-terra bg-terra-soft px-3 py-2 text-body">
            <Megaphone aria-hidden className="mt-0.5 size-5 shrink-0 text-terra-text" />
            <span>
              <strong>Sua vaga chega a mais gente:</strong> o Publike faz anúncios pagos todos os dias no Instagram, no
              Facebook e no Google, por nossa conta, para levar quem procura emprego até as vagas.
            </span>
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <BotaoLink href="/publicar" variante="primario">
              Publicar vaga grátis
            </BotaoLink>
            <BotaoLink href="#como">Ver como funciona</BotaoLink>
          </div>
          <p className="mt-6 flex max-w-2xl items-start gap-2 text-body-sm text-ink-muted">
            <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0 text-terra-text" />
            <span>
              <Selo variante="novo" className="mr-2 align-middle">
                Novo
              </Selo>
              O fim da escala 6x1 foi promulgado: a partir de dezembro, a jornada máxima cai para 42 horas por semana.{" "}
              <Link href="/empresas/fim-da-6x1" className="text-ink underline underline-offset-2 hover:text-terra-text">
                Veja o que muda e como cobrir a semana
              </Link>
              .
            </span>
          </p>
        </Container>
      </section>

      <Container className="py-10">
        <section aria-labelledby="gratis-aqui" className="mb-12">
          <h2 id="gratis-aqui" className="text-h2">
            O que costuma ser pago por aí, aqui é grátis
          </h2>
          <p className="mt-2 max-w-2xl text-body text-ink-muted">
            Nos maiores sites de vaga, o plano grátis limita ou cobra à parte o que mais ajuda a contratar. No Publike,
            nada disso é pago.
          </p>
          <div className="mt-5 overflow-hidden rounded-lg border border-line">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">O que outros sites de vaga cobram e como é no Publike</caption>
              <thead className="hidden bg-surface-300 text-label sm:table-header-group">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Para contratar
                  </th>
                  <th scope="col" className="px-4 py-3 text-ink-muted">
                    Em outros sites
                  </th>
                  <th scope="col" className="px-4 py-3">
                    No Publike
                  </th>
                </tr>
              </thead>
              <tbody>
                {PAGO_POR_AI.map(({ o, la, aqui }) => (
                  <tr
                    key={o}
                    className="grid grid-cols-1 gap-1 border-t border-line bg-surface-200 px-4 py-3 first:border-t-0 sm:table-row sm:p-0"
                  >
                    <th scope="row" className="text-label sm:px-4 sm:py-3">
                      {o}
                    </th>
                    <td className="flex items-center gap-1.5 text-body-sm text-ink-muted sm:table-cell sm:px-4 sm:py-3">
                      <X aria-hidden className="size-4 shrink-0 text-danger sm:hidden" />
                      <span className="sm:hidden">Em outros sites:</span>
                      {la}
                    </td>
                    <td className="flex items-center gap-1.5 text-body-sm font-semibold text-cerrado-text sm:table-cell sm:px-4 sm:py-3">
                      <Check aria-hidden className="size-4 shrink-0 sm:mr-1.5 sm:inline" />
                      {aqui}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-caption text-ink-muted">
            Levantamento do Publike nos planos grátis dos maiores sites de vaga do Brasil, em outubro de 2026.
          </p>
        </section>

        <section aria-labelledby="por-que">
          <h2 id="por-que" className="text-h2">
            Por que publicar no Publike
          </h2>
          <ul className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {MOTIVOS.map(({ icone: Icone, titulo, texto, link }) => (
              <li key={titulo} className="flex gap-4 rounded-lg border border-line bg-surface-200 p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-surface-300">
                  <Icone aria-hidden className="size-5 text-terra-text" />
                </span>
                <div>
                  <h3 className="text-label">{titulo}</h3>
                  <p className="mt-1 text-body-sm text-ink-muted">{texto}</p>
                  {link && (
                    <Link
                      href={link.href}
                      className="mt-2 inline-block text-label text-ink underline underline-offset-2 hover:text-terra-text"
                    >
                      {link.texto}
                    </Link>
                  )}
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
