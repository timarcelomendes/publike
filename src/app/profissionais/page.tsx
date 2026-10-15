import { Bell, Camera, HandCoins, Lock, MapPin, Star, Wrench, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Container, Selo } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { SITE_URL } from "@/lib/config";
import { MAX_FOTOS, MAX_SERVICOS, MIN_AVALIACOES, OFICIOS } from "@/lib/constantes";

export const metadata: Metadata = {
  title: "Para profissionais: sua vitrine de serviços grátis",
  description:
    "Diarista, pedreiro, manicure, eletricista: monte de graça sua vitrine de serviços e seja chamado por quem mora perto, em Goiânia e região. Seu WhatsApp só aparece quando você aceitar.",
  alternates: { canonical: "/profissionais" },
};

type Item = { icone: LucideIcon; titulo: string; texto: string };

const MOTIVOS: Item[] = [
  {
    icone: MapPin,
    titulo: "Quem mora perto encontra você",
    texto: "A busca mostra os profissionais pela distância. Você escolhe os bairros e as cidades onde atende.",
  },
  {
    icone: Camera,
    titulo: "Mostre seu trabalho",
    texto: `Até ${MAX_SERVICOS} serviços, cada um com preço, descrição e até ${MAX_FOTOS} fotos de trabalhos que você já fez.`,
  },
  {
    icone: Bell,
    titulo: "Aviso quando alguém chamar",
    texto: "Quem quiser contratar pede o serviço, e você recebe um aviso no site e por e-mail.",
  },
  {
    icone: Lock,
    titulo: "Seu WhatsApp não fica exposto",
    texto: "O contato só aparece quando você aceita o pedido, e só para aquela pessoa.",
  },
  {
    icone: Star,
    titulo: "Avaliações de quem contratou",
    texto: `Depois do serviço, o cliente avalia. A nota aparece a partir de ${MIN_AVALIACOES} avaliações e você pode responder.`,
  },
  {
    icone: HandCoins,
    titulo: "Grátis, sem comissão",
    texto: "Montar a vitrine, receber pedidos e conversar não custam nada. O valor do serviço é todo seu.",
  },
];

const PASSOS = [
  {
    titulo: "Monte sua vitrine",
    texto: "Escolha o que você faz, o preço e onde atende. Coloque fotos se tiver. Leva uns dois minutos.",
  },
  {
    titulo: "Receba pedidos de quem mora perto",
    texto: "Quem precisa do serviço pede pela sua vitrine, e chega um aviso para você.",
  },
  {
    titulo: "Aceite e combine pelo WhatsApp",
    texto: "Aceitou, deu match: o WhatsApp dos dois aparece. Vocês combinam o dia e o valor direto.",
  },
];

// alguns exemplos do que dá para oferecer (a lista completa aparece ao montar a vitrine)
const EXEMPLOS_DE_OFICIO = [
  "diarista",
  "pedreiro",
  "eletricista",
  "encanador",
  "pintor",
  "manicure",
  "cabeleireiro",
  "baba",
  "cuidador",
  "frete",
  "jardineiro",
  "salgados",
  "aulas",
  "mecanico",
  "costureira",
  "montador-de-moveis",
]
  .map((slug) => OFICIOS.find((o) => o.slug === slug)?.nome)
  .filter((nome): nome is (typeof OFICIOS)[number]["nome"] => Boolean(nome));

// perguntas e respostas da página, também para o Google (as mesmas que aparecem na tela)
const PERGUNTAS = [
  {
    p: "Quanto custa ter a vitrine?",
    r: "Nada. Montar a vitrine, receber pedidos e conversar são grátis, e o Publike não cobra comissão do seu serviço.",
  },
  {
    p: "Preciso ter CNPJ ou ser MEI?",
    r: "Não. Basta criar a conta com o seu e-mail. Quem tem empresa também pode usar.",
  },
  {
    p: "Quantos serviços posso mostrar?",
    r: `Até ${MAX_SERVICOS}, cada um com o seu preço e até ${MAX_FOTOS} fotos. Por exemplo: diarista e passadeira, ou pedreiro e pintor.`,
  },
  { p: "Quanto tempo a vitrine fica no ar?", r: "90 dias. Para renovar, é só abrir e salvar de novo." },
  {
    p: "Onde o Publike funciona?",
    r: "Em Goiânia e região: Aparecida de Goiânia, Senador Canedo, Trindade, Goianira e as cidades vizinhas.",
  },
];

export default function Profissionais() {
  const dadosEstruturados = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: `${SITE_URL}/profissionais`,
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
        <Container className="grid gap-8 py-10 sm:py-14 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <p className="flex items-center gap-2 text-caption text-ink-muted uppercase">
              <Wrench aria-hidden className="size-4 text-terra-text" />
              Para profissionais
            </p>
            <h1 className="mt-2 max-w-3xl text-h1 sm:text-display">Seja chamado por quem mora perto.</h1>
            <p className="mt-4 max-w-2xl text-body-lg text-ink-muted">
              Diarista, pedreiro, manicure, eletricista… Monte sua vitrine de serviços de graça em uns dois minutos. Sem
              comissão, e seu WhatsApp só aparece quando você aceitar.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <BotaoLink href="/painel/servicos" variante="primario">
                Montar minha vitrine grátis
              </BotaoLink>
              <BotaoLink href="#como">Ver como funciona</BotaoLink>
            </div>
          </div>
          <ExemploDeVitrine className="lg:col-span-5" />
        </Container>
      </section>

      <Container className="py-10">
        <section aria-labelledby="por-que">
          <h2 id="por-que" className="text-h2">
            Por que mostrar seu trabalho no Publike
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

        <section aria-labelledby="oficios" className="mt-12 max-w-3xl">
          <h2 id="oficios" className="text-h2">
            Que serviço dá para oferecer
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {EXEMPLOS_DE_OFICIO.map((nome) => (
              <li key={nome} className="rounded-pill bg-surface-300 px-3 py-1.5 text-label">
                {nome}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-body text-ink-muted">
            E muito mais: são mais de {OFICIOS.length} tipos de serviço. Se o seu não estiver na lista, escolha “Outro
            serviço” e escreva o que você faz.
          </p>
        </section>

        <section aria-labelledby="perguntas" className="mt-12 max-w-3xl">
          <h2 id="perguntas" className="text-h2">
            Perguntas de quem presta serviço
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
          <h2 className="text-h2">Monte sua vitrine hoje</h2>
          <p className="mt-2 max-w-2xl text-body">
            Sem senha: você entra com o seu e-mail. Na primeira vez a conta é criada na hora, e a vitrine já aparece
            para quem mora perto.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <BotaoLink href="/painel/servicos">Montar minha vitrine grátis</BotaoLink>
          </div>
        </section>
      </Container>
    </>
  );
}

/** Um cartão ilustrativo de como a vitrine aparece na busca (dados de exemplo, sem avaliações). */
function ExemploDeVitrine({ className = "" }: { className?: string }) {
  const servicos = [
    { nome: "Faxina completa", preco: "R$ 180", unidade: "por dia" },
    { nome: "Passar roupa", preco: "R$ 40", unidade: "por hora" },
  ];
  return (
    <figure className={`rounded-lg border border-line bg-surface-200 p-5 ${className}`}>
      <figcaption className="text-caption text-ink-muted uppercase">Exemplo de vitrine</figcaption>
      <div className="mt-4 flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-12 shrink-0 items-center justify-center rounded-pill bg-terra-soft text-h3 text-terra-text"
        >
          A
        </span>
        <div>
          <p className="text-h3">Ana, diarista</p>
          <p className="text-body-sm text-ink-muted">Setor Bueno, Goiânia · 2,3 km de você</p>
        </div>
      </div>
      <ul className="mt-4 flex flex-col divide-y divide-line rounded-md border border-line bg-surface-100">
        {servicos.map((s) => (
          <li key={s.nome} className="flex items-baseline justify-between gap-3 px-4 py-3">
            <span className="text-label">{s.nome}</span>
            <span className="text-body-sm whitespace-nowrap">
              <strong>{s.preco}</strong> <span className="text-ink-muted">{s.unidade}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <Selo>Atende Goiânia: Sul</Selo>
        <Selo>Seg a sáb</Selo>
      </div>
    </figure>
  );
}
