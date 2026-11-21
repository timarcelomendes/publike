import { Check, ChevronRight, MessageCircle, MonitorSmartphone, UserSearch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DadosEstruturados } from "@/components/dados-estruturados";
import { Container } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { SITE_URL } from "@/lib/config";
import { LIMITES_CONTA } from "@/lib/constantes";
import { formatarMoeda, formatarNumero } from "@/lib/formato";
import {
  caminhoDaBusca,
  caminhoDeAnunciar,
  caminhoDeHoje,
  cidadeDoSlug,
  CIDADES_PRINCIPAIS,
  slugDaCidade,
} from "@/lib/paginas-busca";
import { IMAGEM_DO_SITE } from "@/lib/seo";
import { contatoDasVagasPeloWhatsapp } from "@/lib/servidor/numero-do-publike";
import { resumoDoDia, type ResumoDoDia } from "@/lib/servidor/vagas-hoje";
import { TEXTO_PRONTO_DO_WHATSAPP } from "@/lib/vagas-pelo-whatsapp";

// Anunciar vaga grátis numa cidade (21/11/2026; Marcelo: "quero que o orgânico funcione melhor para pessoas que
// publicam vagas"; claude/organico-para-quem-contrata.md). Em 30 dias, quase toda conta que publicou veio de convite,
// de campanha paga ou do ChatGPT, e a busca de quem contrata ("onde anunciar vaga de emprego grátis") mal chegava ao
// site. Esta é a página dessa busca e das IAs, por cidade: o que é grátis, os dois jeitos de publicar (o site e a foto
// do cartaz no WhatsApp), o mercado da cidade hoje (os números de /vagas/<cidade>/hoje) e as perguntas de quem contrata.

export async function generateStaticParams() {
  return CIDADES_PRINCIPAIS.map((c) => ({ cidade: slugDaCidade(c) }));
}

function lerCidade(slug: string) {
  const cidade = cidadeDoSlug(slug);
  if (!cidade) notFound();
  return cidade;
}

const titulo = (cidade: string) => `Anunciar vaga de emprego grátis em ${cidade}`;

export async function generateMetadata({ params }: PageProps<"/anunciar-vaga/[cidade]">): Promise<Metadata> {
  const cidade = lerCidade((await params).cidade);
  const caminho = caminhoDeAnunciar(cidade);
  const descricao = `Publique a vaga de graça e receba candidatos que moram perto do seu negócio em ${cidade} (GO). Pelo site ou mandando a foto do cartaz no WhatsApp. Sem plano e sem limite de candidatos.`;
  return {
    title: titulo(cidade),
    description: descricao,
    alternates: { canonical: caminho },
    openGraph: { images: [IMAGEM_DO_SITE], title: `${titulo(cidade)} · Publike`, description: descricao, url: caminho, type: "website" },
  };
}

function perguntas(cidade: string, contato: { exibicao: string } | null, r: ResumoDoDia) {
  const { noAr } = LIMITES_CONTA.comum;
  const lista = [
    {
      p: `Quanto custa anunciar uma vaga em ${cidade}?`,
      r: `Nada. No Publike, publicar a vaga, ver todos os candidatos e conversar com eles no WhatsApp é grátis, sem plano e sem pagar por currículo. Cada conta pode ter até ${noAr} vagas no ar de graça; planos e recursos extras são opcionais.`,
    },
    contato && {
      p: "Dá para anunciar a vaga pelo WhatsApp?",
      r: `Dá: mande a foto do cartaz, o print, o PDF ou o texto da vaga para o WhatsApp do Publike, ${contato.exibicao}. A vaga volta pronta, com o botão “Conferir e publicar”: você confere e publica, de graça. Um anúncio com várias vagas vira uma vaga para cada cargo.`,
    },
    {
      p: "Quem vê a minha vaga?",
      r: `Quem procura emprego em ${cidade} e na região, no site e no aplicativo do Publike, com a distância e o tempo de ônibus até o seu negócio: quem mora perto vê primeiro. O Publike também faz anúncios pagos todos os dias no Instagram, no Facebook e no Google, por conta dele, para levar quem procura emprego até as vagas.`,
    },
    {
      p: "Como recebo os candidatos?",
      r: "Quem tem interesse curte a vaga: curtir é se candidatar. Você vê o perfil, o currículo e a nota de quanto a pessoa combina com a vaga, e aceita quem quiser. Aceitou, dá match e o WhatsApp dos dois aparece para vocês conversarem.",
    },
    {
      p: "O meu WhatsApp fica exposto no anúncio?",
      r: "Não. O contato só aparece quando dá match, e só para as duas pessoas. Se preferir, a conversa pode ser só pelo chat do Publike.",
    },
    {
      p: "Posso anunciar vaga temporária, de diária ou freela?",
      r: "Pode: com carteira assinada, temporária, intermitente, diária, freela, estágio, jovem aprendiz, comissão, autônomo e PJ. Ao publicar, você escolhe o tipo de contratação.",
    },
    {
      p: `Quanto pagar para a função em ${cidade}?`,
      r: `Ao publicar, o Publike mostra quanto o mercado paga para a função com carteira na sua região, pelos dados do Ministério do Trabalho (Novo Caged).${r.salarioMensal ? ` Hoje, nas ${formatarNumero(r.salarioMensal.vagas)} vagas do Publike em ${cidade} com salário por mês, o salário do meio é ${formatarMoeda(r.salarioMensal.mediana)}.` : ""}`,
    },
  ];
  return lista.filter((x): x is { p: string; r: string } => Boolean(x));
}

export default async function AnunciarVaga({ params }: PageProps<"/anunciar-vaga/[cidade]">) {
  const cidade = lerCidade((await params).cidade);
  const [r, contato] = await Promise.all([resumoDoDia(cidade), contatoDasVagasPeloWhatsapp()]);
  const faq = perguntas(cidade, contato, r);
  const whatsapp = contato ? `https://wa.me/${contato.numero}?text=${encodeURIComponent(TEXTO_PRONTO_DO_WHATSAPP)}` : null;
  const outras = CIDADES_PRINCIPAIS.filter((c) => c !== cidade);
  const funcoes = r.funcoes.slice(0, 8);

  return (
    <>
      <DadosEstruturados
        dados={[
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Início", item: SITE_URL },
              { "@type": "ListItem", position: 2, name: "Para empresas", item: `${SITE_URL}/empresas` },
              { "@type": "ListItem", position: 3, name: `Anunciar vaga em ${cidade}`, item: `${SITE_URL}${caminhoDeAnunciar(cidade)}` },
            ],
          },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faq.map((q) => ({ "@type": "Question", name: q.p, acceptedAnswer: { "@type": "Answer", text: q.r } })),
          },
        ]}
      />
      <section className="border-b border-line">
        <Container className="py-8 sm:py-12">
          <nav aria-label="Você está em" className="text-body-sm text-ink-muted">
            <ol className="flex flex-wrap items-center gap-1">
              <li>
                <Link href="/" className="hover:text-ink hover:underline">
                  Início
                </Link>
              </li>
              <ChevronRight aria-hidden className="size-4" />
              <li>
                <Link href="/empresas" className="hover:text-ink hover:underline">
                  Para empresas
                </Link>
              </li>
              <ChevronRight aria-hidden className="size-4" />
              <li aria-current="page">Anunciar vaga em {cidade}</li>
            </ol>
          </nav>
          <h1 className="mt-3 max-w-3xl text-h2 sm:text-h1">{titulo(cidade)}</h1>
          <p className="mt-4 max-w-2xl text-body-lg text-ink-muted">
            Publique a vaga de graça e receba candidatos que moram perto do seu negócio em {cidade}. Quem procura
            emprego vê a distância e o tempo de ônibus até você, e você escolhe com quem conversar.
          </p>
          <ul className="mt-5 flex flex-wrap gap-2" aria-label="O que é grátis">
            {["Sem plano", "Sem limite de candidatos", "WhatsApp sem pagar"].map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5 rounded-pill bg-surface-300 px-3 py-1.5 text-label">
                <Check aria-hidden className="size-4 text-cerrado-text" />
                {t}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <BotaoLink href="/publicar" variante="primario">
              Publicar vaga grátis
            </BotaoLink>
            {whatsapp && (
              <BotaoLink href={whatsapp} target="_blank" rel="noreferrer">
                Mandar a foto do cartaz no WhatsApp
              </BotaoLink>
            )}
          </div>
        </Container>
      </section>

      <Container className="py-10">
        <section aria-labelledby="jeitos" className="max-w-4xl">
          <h2 id="jeitos" className="text-h2">
            Dois jeitos de anunciar, os dois de graça
          </h2>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2">
            <li className="rounded-lg border border-line bg-surface-200 p-5">
              <MonitorSmartphone aria-hidden className="size-6 text-terra-text" />
              <h3 className="mt-2 text-h3">Pelo site, em uns dois minutos</h3>
              <p className="mt-1 text-body text-ink-muted">
                Escreva o cargo, o salário, o horário e o bairro. Com o CEP, o pino fica na porta do seu negócio, e o
                Publike mostra quanto o mercado paga para a função na região.
              </p>
              <Link href="/publicar" className="mt-3 inline-block text-label underline underline-offset-2 hover:text-terra-text">
                Publicar vaga grátis
              </Link>
            </li>
            {contato && whatsapp && (
              <li className="rounded-lg border border-line bg-surface-200 p-5">
                <MessageCircle aria-hidden className="size-6 text-cerrado-text" />
                <h3 className="mt-2 text-h3">Pelo WhatsApp, com a foto do cartaz</h3>
                <p className="mt-1 text-body text-ink-muted">
                  Mande a foto do cartaz, o print ou o texto da vaga para o {contato.exibicao}. A vaga volta pronta, com o
                  cargo, o salário, o horário e o bairro preenchidos: você confere e publica.
                </p>
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-label underline underline-offset-2 hover:text-terra-text"
                >
                  Abrir o WhatsApp do Publike
                </a>
              </li>
            )}
          </ul>
          <p className="mt-4 flex max-w-2xl items-start gap-2 text-body text-ink-muted">
            <UserSearch aria-hidden className="mt-0.5 size-5 shrink-0 text-terra-text" />
            <span>
              Ainda sem vaga aberta? Em{" "}
              <Link href="/talentos" className="text-ink underline underline-offset-2 hover:text-terra-text">
                Talentos
              </Link>
              , veja o currículo de quem mora perto e procura trabalho, e convide para conversar. Também é grátis.
            </span>
          </p>
        </section>

        {r.total > 0 && (
          <section aria-labelledby="mercado" className="mt-12 max-w-4xl">
            <h2 id="mercado" className="text-h2">
              Quem está contratando em {cidade} hoje
            </h2>
            <p className="mt-2 text-body text-ink-muted">
              Hoje o Publike tem {formatarNumero(r.total)}
              {r.noLimite ? " ou mais" : ""} {r.total === 1 ? "vaga aberta" : "vagas abertas"} em {cidade}
              {r.novas7d > 0 ? `, ${formatarNumero(r.novas7d)} publicadas nos últimos 7 dias` : ""}
              {r.salarioMensal ? `. O salário do meio das vagas com salário por mês é ${formatarMoeda(r.salarioMensal.mediana)}` : ""}.
            </p>
            {funcoes.length > 0 && (
              <>
                <h3 className="mt-5 text-h3">As funções com mais vagas</h3>
                <ol className="mt-2 grid gap-x-8 gap-y-2 text-body sm:grid-cols-2">
                  {funcoes.map((f) => (
                    <li key={f.nome} className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
                      {f.caminho ? (
                        <Link href={f.caminho} className="underline underline-offset-2 hover:text-terra-text">
                          {f.nome}
                        </Link>
                      ) : (
                        <span>{f.nome}</span>
                      )}
                      <span className="shrink-0 text-body-sm text-ink-muted tabular-nums">
                        {f.n === 1 ? "1 vaga" : `${formatarNumero(f.n)} vagas`}
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            )}
            <p className="mt-4 text-body">
              Veja{" "}
              <Link href={caminhoDeHoje(cidade)} className="font-semibold underline underline-offset-2">
                os números das vagas de hoje em {cidade}
              </Link>{" "}
              ou{" "}
              <Link href={caminhoDaBusca("vaga", cidade)} className="font-semibold underline underline-offset-2">
                todas as vagas
              </Link>
              , para comparar com a sua.
            </p>
          </section>
        )}

        <section aria-labelledby="perguntas" className="mt-12 max-w-3xl">
          <h2 id="perguntas" className="text-h2">
            Perguntas de quem contrata
          </h2>
          <dl className="mt-3 flex flex-col gap-4">
            {faq.map((q) => (
              <div key={q.p}>
                <dt className="text-label">{q.p}</dt>
                <dd className="mt-1 text-body text-ink-muted">{q.r}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 flex flex-wrap gap-3">
            <BotaoLink href="/publicar" variante="primario">
              Publicar vaga grátis
            </BotaoLink>
            <BotaoLink href="/empresas">Ver tudo o que é grátis</BotaoLink>
          </div>
        </section>

        <section aria-labelledby="outras-cidades" className="mt-12">
          <h2 id="outras-cidades" className="text-h3">
            Anunciar vaga em outras cidades
          </h2>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-body-sm">
            {outras.map((c) => (
              <li key={c}>
                <Link href={caminhoDeAnunciar(c)} className="underline underline-offset-2 hover:text-terra-text">
                  {c}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </Container>
    </>
  );
}
