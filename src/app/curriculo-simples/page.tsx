import type { Metadata } from "next";
import Link from "next/link";
import { CurriculoSimples, ExemplosDeCurriculo, SalvarNoPublike } from "@/components/curriculo-simples";
import { DadosEstruturados } from "@/components/dados-estruturados";
import { CompartilharPagina } from "@/components/compartilhar-pagina";
import { MaisDoPublike } from "@/components/mais-do-publike";
import { Container } from "@/components/ui/basicos";
import { SITE_URL } from "@/lib/config";
import { IMAGEM_DO_SITE } from "@/lib/seo";

// Currículo simples grátis (claude/plano-curriculo-simples-gratis.md): quem busca "currículo simples" no Google quer
// um modelo para preencher e baixar. Aberto, sem conta; o convite para salvar no Publike vem depois de baixar e no fim
// da página. Desde 18/11/2026 (claude/plano-organico.md, item 4), a página é a que disputa a busca: o título com
// "para preencher", os dois exemplos (com experiência e primeiro emprego), os cinco passos e mais perguntas; o artigo
// /conteudos/curriculo-simples-que-funciona ficou com o "como fazer" e aponta para cá.

const TITULO = "Currículo simples para preencher e baixar grátis em PDF";
const DESCRICAO =
  "Modelo de currículo simples para preencher pelo celular ou computador, sem cadastro: cinco partes, exemplo de primeiro emprego e com experiência, pronto em PDF na hora.";

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRICAO,
  alternates: { canonical: "/curriculo-simples" },
  openGraph: {
    images: [IMAGEM_DO_SITE],
    title: `${TITULO} · Publike`,
    description: DESCRICAO,
    url: "/curriculo-simples",
    type: "website",
  },
};

/** Os cinco passos: a mesma ordem do formulário (uma sequência de verdade). */
const PASSOS = [
  {
    titulo: "Contato",
    texto:
      "Nome completo, WhatsApp com DDD, e-mail (se tiver) e o bairro onde mora. Não precisa de endereço completo nem de número de documento.",
  },
  {
    titulo: "Objetivo",
    texto: "Uma linha com a vaga que você quer, como “Atendente ou operadora de caixa”. Sem frase pronta.",
  },
  {
    titulo: "Experiência",
    texto:
      "Do trabalho mais recente para o mais antigo: o lugar, a função, quanto tempo ficou e duas ou três tarefas que você fazia. Bico e diária contam.",
  },
  {
    titulo: "Estudo e cursos",
    texto:
      "Até onde você estudou (ou se está estudando) e os cursos, mesmo os curtos e os grátis: informática, atendimento, manipulação de alimentos.",
  },
  {
    titulo: "O que você sabe fazer",
    texto: "Operar caixa, atender cliente, dirigir, cuidar de idoso, mexer no computador. E a carteira de motorista, se tiver.",
  },
];

const PERGUNTAS = [
  {
    p: "Como fazer um currículo simples pelo celular?",
    r: "Preencha as cinco partes nesta página, veja o currículo pronto embaixo e toque em “Baixar em PDF”. Na tela de impressão, escolha “Salvar como PDF”. O arquivo fica no celular para mandar pelo WhatsApp ou por e-mail.",
  },
  {
    p: "O que colocar no currículo de primeiro emprego?",
    r: "O contato, o objetivo, o estudo (inclusive se ainda está estudando), os cursos e o que você sabe fazer. Bico, ajuda no negócio da família e trabalho voluntário entram como experiência, com o tempo que durou.",
  },
  {
    p: "Currículo simples precisa de foto?",
    r: "Não. Para a maioria das vagas de comércio, serviços, obra e cozinha, quem contrata quer saber o que você faz e como falar com você. Sem foto, o currículo fica mais limpo e cabe em uma página.",
  },
  {
    p: "Preciso colocar CPF, RG, idade ou estado civil?",
    r: "Não. Os documentos são pedidos depois, na contratação. Religião, time e estado de saúde também ficam de fora: não ajudam e não precisam estar no currículo.",
  },
  {
    p: "Uma página basta?",
    r: "Basta. Quem contrata lê rápido, muitas vezes no celular. Uma página com contato, objetivo, experiência, estudo e o que você sabe fazer é o suficiente.",
  },
  {
    p: "Preciso pagar ou criar conta?",
    r: "Não. O currículo é grátis e sem cadastro, e o que você digita fica só no seu aparelho. Se quiser que as empresas de Goiânia e região achem você, aí sim dá para salvar no Publike, também de graça.",
  },
  {
    p: "Qual modelo escolher?",
    r: "O Simples serve para quase toda vaga. O Clássico, com letra de livro, combina com escritório. O Moderno e o Coluna têm uma cor de destaque. Todos saem bem impressos em preto e branco e são lidos pelos sistemas das empresas.",
  },
  {
    p: "Como mandar o currículo pelo WhatsApp?",
    r: "Depois de salvar o PDF, abra a conversa, toque no clipe (ou no +), escolha “Documento” e o arquivo do currículo. Mande junto uma mensagem curta dizendo a vaga que você quer.",
  },
];

export default function PaginaCurriculoSimples() {
  return (
    <Container className="py-8 sm:py-10">
      <DadosEstruturados
        dados={[
          {
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: "Currículo simples do Publike",
            url: `${SITE_URL}/curriculo-simples`,
            applicationCategory: "BusinessApplication",
            operatingSystem: "Qualquer navegador",
            offers: { "@type": "Offer", price: "0", priceCurrency: "BRL" },
            inLanguage: "pt-BR",
          },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: PERGUNTAS.map((q) => ({
              "@type": "Question",
              name: q.p,
              acceptedAnswer: { "@type": "Answer", text: q.r },
            })),
          },
        ]}
      />
      <div className="max-w-3xl print:hidden">
        <h1 className="text-h2 sm:text-h1">Currículo simples para preencher</h1>
        <p className="mt-3 text-body-lg text-ink-muted">
          Preencha as cinco partes, veja o currículo pronto ao lado e baixe em PDF, grátis e sem cadastro. Uma página
          que quem contrata consegue ler em um minuto, no celular ou no papel.
        </p>
        <div className="mt-4">
          <CompartilharPagina
            caminho="/curriculo-simples"
            texto="Monte um currículo simples grátis e baixe em PDF, sem cadastro:"
          />
        </div>
      </div>

      <CurriculoSimples />

      <section aria-labelledby="exemplos" className="mt-14 max-w-3xl print:hidden">
        <h2 id="exemplos" className="text-h3">
          Exemplos de currículo simples
        </h2>
        <p className="mt-2 text-body text-ink-muted">
          Os dois no modelo Simples, de uma página. Troque pelos seus dados no formulário acima.
        </p>
        <ExemplosDeCurriculo />
      </section>

      <section aria-labelledby="passos" className="mt-12 max-w-3xl print:hidden">
        <h2 id="passos" className="text-h3">
          Como fazer um currículo simples em 5 passos
        </h2>
        <ol className="mt-3 flex list-decimal flex-col gap-2.5 pl-5 text-body">
          {PASSOS.map((p) => (
            <li key={p.titulo}>
              <strong className="font-semibold">{p.titulo}:</strong> {p.texto}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-body">
          Pronto: baixe em PDF e mande pelo WhatsApp ou leve impresso. Mais dicas, como contar bico e o que deixar de
          fora, no guia{" "}
          <Link href="/conteudos/curriculo-simples-que-funciona" className="font-semibold underline underline-offset-2">
            como fazer um currículo simples que funciona
          </Link>
          . E as vagas abertas perto de você estão em{" "}
          <Link href="/vagas/goiania" className="font-semibold underline underline-offset-2">
            vagas em Goiânia
          </Link>
          .
        </p>
      </section>

      <section aria-labelledby="perguntas" className="mt-12 max-w-3xl print:hidden">
        <h2 id="perguntas" className="text-h3">
          Perguntas frequentes
        </h2>
        <dl className="mt-3 flex flex-col gap-4">
          {PERGUNTAS.map((q) => (
            <div key={q.p}>
              <dt className="text-label">{q.p}</dt>
              <dd className="mt-1 text-body text-ink-muted">{q.r}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        aria-labelledby="ser-achado"
        className="mt-12 max-w-3xl rounded-lg border border-line bg-surface-200 p-5 sm:p-6 print:hidden"
      >
        <h2 id="ser-achado" className="text-h3">
          Quer que as empresas da região achem você?
        </h2>
        <p className="mt-2 text-body text-ink-muted">
          Salve o currículo no Publike, de graça. Quem tem vaga na sua cidade, em Goiânia e região, vê o seu currículo,
          com o nome encurtado e sem o seu telefone, e pode convidar você. E você se candidata às vagas com um toque, sem
          preencher tudo de novo.
        </p>
        <SalvarNoPublike className="mt-4" />
      </section>

      <MaisDoPublike atual="curriculo" />
    </Container>
  );
}
