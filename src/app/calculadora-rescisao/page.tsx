import type { Metadata } from "next";
import Link from "next/link";
import { CalculadoraRescisao } from "@/components/calculadora-rescisao";
import { DadosEstruturados } from "@/components/dados-estruturados";
import { Container } from "@/components/ui/basicos";
import { SITE_URL } from "@/lib/config";
import { CASOS_RESCISAO } from "@/lib/rescisao-casos";
import { ANO_DAS_TABELAS } from "@/lib/tabelas-trabalhistas";

// A calculadora de rescisão completa (claude/plano-calculadora-rescisao.md): o básico (saldo, aviso, 13º, férias, multa)
// e o que costuma mudar o valor (aviso proporcional e a projeção, médias, adicionais, férias em dobro, faltas,
// afastamentos, banco de horas, doméstica, saque-aniversário, INSS e IR de 2026 verba por verba). É uma estimativa, e a
// página diz isso no topo, no resultado e no PDF.

const TITULO = `Calculadora de rescisão ${ANO_DAS_TABELAS}: o cálculo completo do seu acerto (CLT)`;
const DESCRICAO = `Calcule a rescisão com aviso prévio proporcional, médias de horas extras, férias vencidas e em dobro, 13º, FGTS e multa, INSS e IR de ${ANO_DAS_TABELAS} verba por verba. Grátis, sem cadastro e com a explicação de cada valor.`;

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRICAO,
  alternates: { canonical: "/calculadora-rescisao" },
  openGraph: { title: `${TITULO} · Publike`, description: DESCRICAO, url: "/calculadora-rescisao", type: "website" },
};

const PERGUNTAS = [
  {
    p: "Quanto recebo se for demitido sem justa causa?",
    r: "O saldo de salário, o aviso prévio (30 dias mais 3 por ano completo, até 90), o 13º e as férias proporcionais e vencidas com 1/3, contando os dias do aviso, e a multa de 40% do FGTS, além de sacar o saldo. Desconta INSS e IR só do que é salário.",
  },
  {
    p: "E se eu pedir demissão?",
    r: "Recebe o saldo de salário, o 13º proporcional e as férias vencidas e proporcionais com 1/3. Não tem multa nem saque do FGTS. Se não trabalhar os 30 dias do aviso, a empresa pode descontar um mês de remuneração, a não ser que libere você.",
  },
  {
    p: "Como funciona o aviso prévio proporcional?",
    r: "São 30 dias até 1 ano de empresa e mais 3 dias por ano completo, até 90 dias (Lei 12.506/2011). Quando é indenizado, esses dias contam como tempo de serviço e aumentam o 13º e as férias.",
  },
  {
    p: "Desconta INSS e imposto de renda na rescisão?",
    r: "Só do que é salário: saldo de salário, horas extras do mês e 13º (que tem cálculo próprio). Aviso prévio indenizado, férias indenizadas com 1/3, FGTS e multa não têm desconto de IR, e as férias e o aviso indenizados também não têm INSS.",
  },
  {
    p: "Quem tem saque-aniversário recebe o FGTS na demissão?",
    r: "Quem aderiu e foi demitido saca só a multa de 40% (ou 20% no acordo). O saldo fica na conta. Voltar ao saque-rescisão vale a partir do 25º mês depois do pedido.",
  },
  {
    p: "Qual o prazo para a empresa pagar a rescisão?",
    r: "10 dias corridos depois do fim do contrato (art. 477 da CLT). Se atrasar, a empresa paga uma multa de um salário.",
  },
  {
    p: "Como fica a rescisão no acordo?",
    r: "No acordo do art. 484-A, o aviso indenizado e a multa do FGTS caem pela metade (multa de 20%), você saca 80% do FGTS e as outras verbas vêm inteiras. Não há seguro-desemprego.",
  },
  {
    p: "A calculadora é exata?",
    r: "Não: é uma estimativa. Detalhes do contrato, da convenção coletiva da categoria ou uma informação que faltou mudam os valores. Use para conferir e tirar dúvidas; para o cálculo oficial, procure o sindicato, um advogado trabalhista ou a Justiça do Trabalho.",
  },
];

export default function PaginaCalculadoraRescisao() {
  return (
    <Container className="py-8 sm:py-10">
      <DadosEstruturados
        dados={[
          {
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: "Calculadora de rescisão do Publike",
            url: `${SITE_URL}/calculadora-rescisao`,
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
      <div className="max-w-3xl print:hidden">
        <h1 className="text-h2 sm:text-h1">Calculadora de rescisão</h1>
        <p className="mt-3 text-body-lg text-ink-muted">
          O cálculo completo do seu acerto: aviso prévio proporcional, médias de horas extras, férias vencidas e em
          dobro, 13º, FGTS e multa, com o INSS e o IR de {ANO_DAS_TABELAS} verba por verba. Cada valor vem com a conta.
        </p>
        <p className="mt-4 rounded-md border-l-4 border-ipe bg-surface-200 px-4 py-3 text-body">
          <strong>É uma estimativa, use como sugestão.</strong> Os resultados podem não ser precisos: qualquer detalhe
          do contrato de trabalho, da convenção coletiva da sua categoria ou uma informação que faltou aqui muda os
          valores. Use para conferir e tirar dúvidas, não como a verdade. Para o cálculo oficial, procure o sindicato,
          um advogado trabalhista ou a Justiça do Trabalho.
        </p>
      </div>

      <CalculadoraRescisao />

      <section aria-labelledby="por-caso" className="mt-14 max-w-3xl print:hidden">
        <h2 id="por-caso" className="text-h3">
          Calcule pelo seu caso
        </h2>
        <p className="mt-2 text-body text-ink-muted">
          Cada caso tem a calculadora já marcada, o que entra e o que não entra, e um exemplo resolvido.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {CASOS_RESCISAO.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/calculadora-rescisao/${c.slug}`}
                className="inline-flex min-h-11 items-center rounded-pill border border-line-strong px-4 text-body-sm hover:bg-surface-200"
              >
                {c.nome}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="fora" className="mt-10 max-w-3xl print:hidden">
        <h2 id="fora" className="text-h3">
          O que fica fora do cálculo
        </h2>
        <p className="mt-2 text-body text-ink-muted">
          Estabilidades (gestante, CIPA, acidente de trabalho, pré-aposentadoria), PDV, valores que a empresa já devia
          de meses anteriores (horas extras não pagas, desvio de função), danos morais, regras próprias da convenção
          coletiva (aviso maior, multas, abonos) e banco de horas negativo.
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
        <p className="mt-6 text-body">
          Foi demitido? Veja se tem direito ao{" "}
          <Link href="/seguro-desemprego" className="font-semibold underline underline-offset-2">
            seguro-desemprego
          </Link>
          , monte um{" "}
          <Link href="/curriculo-simples" className="font-semibold underline underline-offset-2">
            currículo grátis
          </Link>{" "}
          e procure a próxima vaga nas{" "}
          <Link href="/vagas/goiania/ultimos-3-dias" className="font-semibold underline underline-offset-2">
            vagas dos últimos 3 dias
          </Link>
          .
        </p>
        <p className="mt-4 text-body-sm text-ink-muted">
          Fontes: CLT (arts. 130, 137, 142, 146, 477, 479 a 481, 484, 484-A e 487), Lei 12.506/2011, Lei 8.036/1990, LC
          150/2015, Portaria Interministerial MPS/MF nº 13/2026 (INSS), Leis 15.191/2025 e 15.270/2025 (IR) e súmulas do
          TST.
        </p>
      </section>
    </Container>
  );
}
