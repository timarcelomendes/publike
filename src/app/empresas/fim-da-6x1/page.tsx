import { CalendarClock, CalendarDays, Clock, MapPin, Store, Users, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { SITE_URL } from "@/lib/config";
import { ONDE_FUNCIONA } from "@/lib/pracas";

// Para comércio, restaurante e salão: o fim da escala 6x1 (Emenda Constitucional 141, de 16/10/2026) e
// o que fazer para cobrir a semana. Entrada dos anúncios para quem contrata. Os prazos vêm das notícias
// do Senado e da Agência Brasil (links no fim da página); confira de novo se a regra mudar.

export const metadata: Metadata = {
  title: "Fim da escala 6x1: o que muda e como contratar",
  description: `A Emenda Constitucional 141 acaba com a 6x1: 42 horas por semana em 60 dias e 40 horas depois, sem reduzir salário. Veja o que muda e publique sua vaga grátis em ${ONDE_FUNCIONA}.`,
  alternates: { canonical: "/empresas/fim-da-6x1" },
};

// as datas da mudança (uma sequência de verdade: vai numerada)
const QUANDO = [
  {
    quando: "16 de outubro de 2026",
    texto: "O Congresso promulgou a Emenda Constitucional 141, que acaba com a escala 6x1.",
  },
  {
    quando: "60 dias depois da publicação (meados de dezembro de 2026)",
    texto:
      "A jornada máxima cai de 44 para 42 horas por semana, com cinco dias de trabalho e dois de descanso (5x2), sem redução de salário.",
  },
  {
    quando: "14 meses depois da publicação (por volta de dezembro de 2027)",
    texto: "A jornada máxima chega a 40 horas por semana, sem redução de salário.",
  },
];

type Dica = { icone: LucideIcon; titulo: string; texto: string };

const DICAS: Dica[] = [
  {
    icone: Clock,
    titulo: "Faça a conta das horas",
    texto:
      "Some as horas que a loja fica aberta na semana e veja quantas pessoas cobrem tudo com duas folgas para cada uma.",
  },
  {
    icone: Users,
    titulo: "Pense em quem completa a escala",
    texto:
      "Meio período, alguém só para o fim de semana, uma folguista ou um temporário para o fim de ano: tudo isso dá para publicar.",
  },
  {
    icone: MapPin,
    titulo: "Contrate quem mora perto",
    texto:
      "Quem mora perto chega no horário e gasta menos com condução. No Publike, cada pessoa vê o tempo de ônibus até a sua porta.",
  },
  {
    icone: CalendarClock,
    titulo: "Marque “Começa já”",
    texto:
      "Precisa de alguém logo? Marque “Começa já” ao publicar: a vaga ganha a etiqueta, e quem pode começar na hora acha pelo filtro.",
  },
];

const FONTES = [
  {
    nome: "Agência Senado: Congresso promulga o fim da escala 6x1 (16/10/2026)",
    href: "https://www12.senado.leg.br/noticias/materias/2026/10/16/congresso-promulga-o-fim-da-escala-6x1-e-aposentadoria-de-agentes-de-saude",
  },
  {
    nome: "Agência Brasil: escala 5x2 começa em 60 dias (16/10/2026)",
    href: "https://agenciabrasil.ebc.com.br/politica/noticia/2026-10/congresso-promulga-emenda-do-fim-da-6x1-escala-5x2-comeca-em-60-dias",
  },
];

export default function FimDa6x1() {
  const dados = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    url: `${SITE_URL}/empresas/fim-da-6x1`,
    name: "Fim da escala 6x1: o que muda e como contratar",
    datePublished: "2026-10-29",
    inLanguage: "pt-BR",
  };
  return (
    <>
      <script
        type="application/ld+json"
        // sem "<" no JSON: nada fecha a tag de script antes da hora
        dangerouslySetInnerHTML={{ __html: JSON.stringify(dados).replace(/</g, "\\u003c") }}
      />
      <section className="border-b border-line">
        <Container className="py-10 sm:py-14">
          <p className="flex items-center gap-2 text-caption text-ink-muted uppercase">
            <Store aria-hidden className="size-4 text-terra-text" />
            <Link href="/empresas" className="hover:text-ink hover:underline">
              Para empresas
            </Link>
          </p>
          <h1 className="mt-2 max-w-3xl text-h1 sm:text-display">
            Fim da escala 6x1: vai precisar de mais gente na equipe?
          </h1>
          <p className="mt-4 max-w-2xl text-body-lg text-ink-muted">
            Para quem abre seis ou sete dias por semana, cobrir os mesmos horários com duas folgas para cada pessoa pode
            pedir um turno a mais, alguém para o fim de semana ou uma folguista. No Publike, publicar a vaga é grátis, e
            quem mora perto vê primeiro.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <BotaoLink href="/publicar" variante="primario">
              Publicar vaga grátis
            </BotaoLink>
            <BotaoLink href="#o-que-muda">Ver o que muda</BotaoLink>
          </div>
        </Container>
      </section>

      <Container className="py-10">
        <section aria-labelledby="o-que-muda-titulo" id="o-que-muda" className="max-w-3xl scroll-mt-24">
          <h2 id="o-que-muda-titulo" className="text-h2">
            O que muda e quando
          </h2>
          <ol className="mt-6 flex flex-col gap-4">
            {QUANDO.map(({ quando, texto }, i) => (
              <li key={quando} className="flex gap-4 rounded-lg border border-line bg-surface-200 p-5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-terra-soft text-label text-terra-text">
                  {i + 1}
                </span>
                <div>
                  <h3 className="flex items-center gap-2 text-label">
                    <CalendarDays aria-hidden className="size-4 text-ink-muted" />
                    {quando}
                  </h3>
                  <p className="mt-1 text-body text-ink-muted">{texto}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-body-sm text-ink-muted">
            Acordo ou convenção coletiva pode ajustar como as horas se distribuem na semana, e algumas categorias têm
            regra própria. Confira com o seu contador ou o sindicato da categoria.
          </p>
        </section>

        <section aria-labelledby="o-que-fazer" className="mt-12">
          <h2 id="o-que-fazer" className="text-h2">
            O que fazer agora
          </h2>
          <ul className="mt-6 grid gap-4 md:grid-cols-2">
            {DICAS.map(({ icone: Icone, titulo, texto }) => (
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

        <section className="mt-12 rounded-lg border border-line bg-surface-200 p-6 sm:p-8">
          <h2 className="text-h2">Publique a vaga hoje, grátis</h2>
          <p className="mt-2 max-w-2xl text-body">
            Publicar, ver quem curtiu, dar match e conversar não custam nada, sem limite de candidatos por vaga. Leva
            uns dois minutos, e a vaga já aparece para quem mora perto.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <BotaoLink href="/publicar" variante="primario">
              Publicar vaga grátis
            </BotaoLink>
            <BotaoLink href="/empresas">Como funciona para empresas</BotaoLink>
          </div>
        </section>

        <section aria-labelledby="fontes" className="mt-10 max-w-3xl">
          <h2 id="fontes" className="text-label">
            De onde vêm as datas
          </h2>
          <ul className="mt-2 flex flex-col gap-1 text-body-sm">
            {FONTES.map((f) => (
              <li key={f.href}>
                <a
                  href={f.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink underline underline-offset-2 hover:text-terra-text"
                >
                  {f.nome}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-body-sm text-ink-muted">
            Este resumo é para ajudar a planejar a equipe; não é orientação jurídica.
          </p>
        </section>
      </Container>
    </>
  );
}
