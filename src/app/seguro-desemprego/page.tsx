import type { Metadata } from "next";
import Link from "next/link";
import { DadosEstruturados } from "@/components/dados-estruturados";
import { SeguroDesemprego } from "@/components/seguro-desemprego";
import { CompartilharPagina } from "@/components/compartilhar-pagina";
import { MaisDoPublike } from "@/components/mais-do-publike";
import { Container } from "@/components/ui/basicos";
import { SITE_URL } from "@/lib/config";
import { formatarMoeda } from "@/lib/formato";
import { ANO_DA_TABELA, FAIXAS, SALARIO_MINIMO, VIGENCIA } from "@/lib/seguro-desemprego";
import { IMAGEM_DO_SITE } from "@/lib/seo";

// "Tenho direito ao seguro-desemprego?" (claude/plano-seguro-desemprego.md): quem busca as regras no Google quer a
// resposta para o seu caso. Aberta, sem conta; no fim, as vagas e o currículo grátis.

const TITULO = `Seguro-desemprego: tenho direito? Veja parcelas e valor (${ANO_DA_TABELA})`;
const DESCRICAO = `Responda algumas perguntas e veja se tem direito ao seguro-desemprego, quantas parcelas e o valor pela tabela de ${ANO_DA_TABELA}. Grátis e sem cadastro.`;

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRICAO,
  alternates: { canonical: "/seguro-desemprego" },
  openGraph: {
    images: [IMAGEM_DO_SITE],
    title: `${TITULO} · Publike`,
    description: DESCRICAO,
    url: "/seguro-desemprego",
    type: "website",
  },
};

const m = formatarMoeda;
const PERGUNTAS = [
  {
    p: "Quem tem direito ao seguro-desemprego?",
    r: "Quem trabalhava com carteira assinada e foi demitido sem justa causa (ou teve a rescisão indireta reconhecida), cumpriu o tempo mínimo de trabalho, não tem outra renda própria e não recebe benefício contínuo do INSS, com exceção da pensão por morte e do auxílio-acidente.",
  },
  {
    p: "Quanto tempo preciso ter trabalhado?",
    r: "No 1º pedido, pelo menos 12 meses nos últimos 18. No 2º, pelo menos 9 meses nos últimos 12. A partir do 3º, os 6 meses seguidos antes da demissão. Para o empregado doméstico, 15 meses nos últimos 24.",
  },
  {
    p: "Quantas parcelas eu recebo?",
    r: "De 3 a 5. Com 24 meses ou mais de carteira nos últimos 3 anos, são 5; de 12 a 23 meses, 4; e no 2º pedido (de 9 a 11 meses) ou a partir do 3º (de 6 a 11 meses), 3. O doméstico recebe 3 parcelas.",
  },
  {
    p: `Qual o valor do seguro-desemprego em ${ANO_DA_TABELA}?`,
    r: `Sai da média dos 3 últimos salários. Até ${m(FAIXAS.ate)}, é 80% da média. De ${m(FAIXAS.ate + 0.01)} a ${m(FAIXAS.segunda)}, é ${m(FAIXAS.fixo)} mais 50% do que passar de ${m(FAIXAS.ate)}. Acima disso, é o teto de ${m(FAIXAS.teto)}. Nenhuma parcela fica abaixo do salário mínimo, de ${m(SALARIO_MINIMO)}. Tabela válida desde ${VIGENCIA}.`,
  },
  {
    p: "Qual o prazo para pedir?",
    r: "Do 7º ao 120º dia depois da demissão. Para o empregado doméstico, do 7º ao 90º dia. O pedido é pelo gov.br, pelo app Carteira de Trabalho Digital ou no Sine.",
  },
  {
    p: "Pedi demissão. Tenho direito?",
    r: "Não. Quem pede demissão, é demitido por justa causa ou sai por acordo com a empresa (o artigo 484-A da CLT) não tem direito ao seguro-desemprego.",
  },
  {
    p: "E no fim do contrato de experiência?",
    r: "Se o contrato acabou no prazo combinado, não dá direito. Se a empresa encerrou antes do prazo, sem justa causa, pode dar, desde que você cumpra o tempo mínimo de trabalho.",
  },
];

export default function PaginaSeguroDesemprego() {
  return (
    <Container className="py-8 sm:py-10">
      <DadosEstruturados
        dados={[
          {
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: "Tenho direito ao seguro-desemprego? (Publike)",
            url: `${SITE_URL}/seguro-desemprego`,
            applicationCategory: "FinanceApplication",
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
      <div className="max-w-3xl">
        <h1 className="text-h2 sm:text-h1">Tenho direito ao seguro-desemprego?</h1>
        <p className="mt-3 text-body-lg text-ink-muted">
          Responda algumas perguntas e veja se tem direito, quantas parcelas e o valor pela tabela de {ANO_DA_TABELA}.
          Leva um minuto.
        </p>
        <div className="mt-4">
          <CompartilharPagina
            caminho="/seguro-desemprego"
            texto="Veja se você tem direito ao seguro-desemprego, quantas parcelas e de quanto:"
          />
        </div>
      </div>

      <SeguroDesemprego />

      <section aria-labelledby="perguntas" className="mt-14 max-w-3xl">
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
        <p className="mt-6 text-body">
          Enquanto o seguro não vem, procure a próxima vaga perto de casa em{" "}
          <Link href="/vagas/goiania" className="font-semibold underline underline-offset-2">
            vagas em Goiânia
          </Link>{" "}
          e veja ideias de{" "}
          <Link href="/conteudos/renda-extra-bicos-goiania" className="font-semibold underline underline-offset-2">
            renda extra
          </Link>
          . Cuidado: ter outra renda pode afetar o seguro.
        </p>
        <p className="mt-4 text-body-sm text-ink-muted">
          Fontes: Lei 7.998/1990, Lei 13.134/2015 e a tabela do Ministério do Trabalho e Emprego válida desde {VIGENCIA}
          .
        </p>
      </section>

      <MaisDoPublike atual="seguro" />
    </Container>
  );
}
