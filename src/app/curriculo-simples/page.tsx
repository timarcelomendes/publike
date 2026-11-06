import type { Metadata } from "next";
import Link from "next/link";
import { CurriculoSimples } from "@/components/curriculo-simples";
import { DadosEstruturados } from "@/components/dados-estruturados";
import { Container } from "@/components/ui/basicos";
import { SITE_URL } from "@/lib/config";

// Currículo simples grátis (claude/plano-curriculo-simples-gratis.md): quem busca "currículo simples" no Google quer
// um modelo para preencher e baixar. Aberto, sem conta; o convite para salvar no Publike vem depois de baixar.

const TITULO = "Currículo simples grátis: preencha e baixe em PDF";
const DESCRICAO =
  "Monte um currículo simples de uma página, de graça e sem cadastro: preencha os cinco campos, veja pronto na hora e baixe em PDF pelo celular ou computador.";

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRICAO,
  alternates: { canonical: "/curriculo-simples" },
  openGraph: { title: `${TITULO} · Publike`, description: DESCRICAO, url: "/curriculo-simples", type: "website" },
};

const PERGUNTAS = [
  {
    p: "Currículo simples precisa de foto?",
    r: "Não. Para a maioria das vagas de comércio, serviços, obra e cozinha, quem contrata quer saber o que você faz e como falar com você. Sem foto, o currículo fica mais limpo e cabe em uma página.",
  },
  {
    p: "E quem nunca trabalhou com carteira?",
    r: "Coloque o que você já fez: bico, diária, ajuda no negócio da família, trabalho voluntário. Conta como experiência, e mostra que você sabe trabalhar.",
  },
  {
    p: "Uma página basta?",
    r: "Basta. Quem contrata lê rápido, muitas vezes no celular. Uma página com contato, objetivo, experiência, estudo e o que você sabe fazer é o suficiente.",
  },
  {
    p: "Como baixo em PDF pelo celular?",
    r: "Toque em “Baixar em PDF” e, na tela de impressão, escolha “Salvar como PDF”. O arquivo fica no celular para mandar pelo WhatsApp ou e-mail.",
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
        <h1 className="text-h2 sm:text-h1">Currículo simples grátis</h1>
        <p className="mt-3 text-body-lg text-ink-muted">
          Preencha, veja pronto ao lado e baixe em PDF. Uma página, sem cadastro e sem pagar nada: é o currículo que
          quem contrata em Goiânia consegue ler em um minuto.
        </p>
      </div>

      <CurriculoSimples />

      <section aria-labelledby="dicas" className="mt-14 max-w-3xl print:hidden">
        <h2 id="dicas" className="text-h3">
          O que faz um currículo simples funcionar
        </h2>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-body">
          <li>
            <strong>Contato que funciona:</strong> o WhatsApp com DDD e o bairro onde mora. Não precisa de endereço
            completo nem de documentos.
          </li>
          <li>
            <strong>Objetivo em uma linha:</strong> a vaga que você quer, sem frase pronta.
          </li>
          <li>
            <strong>Experiência com o que você fazia:</strong> duas ou três tarefas em cada trabalho dizem mais que o
            nome do cargo.
          </li>
          <li>
            <strong>Cursos curtos contam:</strong> manipulação de alimentos, informática, atendimento. Coloque os
            gratuitos também.
          </li>
        </ul>
        <p className="mt-4 text-body">
          Mais dicas no guia{" "}
          <Link href="/conteudos/curriculo-simples-que-funciona" className="font-semibold underline underline-offset-2">
            Currículo simples que funciona
          </Link>
          , e as vagas abertas perto de você em{" "}
          <Link href="/vagas/goiania" className="font-semibold underline underline-offset-2">
            vagas em Goiânia
          </Link>
          .
        </p>
      </section>

      <section aria-labelledby="perguntas" className="mt-10 max-w-3xl print:hidden">
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
    </Container>
  );
}
