import {
  Bus,
  CalendarClock,
  Check,
  ClipboardCheck,
  HandCoins,
  Heart,
  LayoutGrid,
  ListChecks,
  Lock,
  MapPin,
  Megaphone,
  MessagesSquare,
  Scale,
  Sparkles,
  Store,
  type LucideIcon,
  UserSearch,
  Video,
  Workflow,
  X,
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
    icone: Scale,
    titulo: "Saiba quanto pagar",
    texto:
      "Ao publicar, o Publike mostra quanto o mercado paga para a função com carteira na sua região, pelos dados do Ministério do Trabalho (Novo Caged).",
  },
  {
    icone: MessagesSquare,
    titulo: "O chat faz as primeiras perguntas",
    texto:
      "Deu match, o chat do Publike já pergunta CNH, horário e quando a pessoa pode começar, e você recebe o resumo das respostas.",
  },
  {
    icone: Lock,
    titulo: "Seu WhatsApp não fica exposto",
    texto:
      "O contato só aparece quando dá match, e só para as duas pessoas. Se preferir, a vaga pode ser só pelo chat do Publike.",
  },
  {
    icone: Check,
    titulo: "Quem mais combina vem primeiro",
    texto:
      "Cada candidato chega com a nota de aderência e o porquê, item por item: a experiência na função, o estudo, a distância, o horário. Falta a CNH ou a escolaridade que você pediu? A nota avisa.",
  },
  {
    icone: ListChecks,
    titulo: "Candidatos organizados",
    texto: "Acompanhe cada pessoa por etapa: novo, em análise, entrevista e contratado. A anotação fica só com você.",
  },
  {
    icone: HandCoins,
    titulo: "Grátis, sem limite de candidatos",
    texto: `Publicar, ver todos os candidatos e conversar no WhatsApp não custam nada: sem plano e sem pagar por currículo. Cada conta pode ter até ${LIMITES_CONTA.comum.noAr} vagas no ar de graça.`,
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
    o: "Perguntas para o candidato",
    la: "Só nos planos pagos",
    aqui: "Grátis, e no match o chat pergunta sozinho",
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
    titulo: "Aceite e converse",
    texto: "Deu match, o WhatsApp dos dois aparece. Marque a entrevista e acompanhe tudo pelo painel.",
  },
];

// Os recursos pagos, para quem contrata muito (claude/plano-pagina-empresas-novembro.md). Sem preço: ele fica em
// Admin › Pagamentos e muda.
const RECURSOS_PAGOS: Item[] = [
  {
    icone: Scale,
    titulo: "Consulta de salários",
    texto:
      "Para cada função: a faixa em Goiânia, Anápolis e Goiás, o que as vagas do Publike oferecem, quanto oferecer para fechar rápido e quantos talentos já trabalharam nela. Vem com 5 consultas grátis, e cada 5 vagas novas dão mais 2.",
  },
  {
    icone: Sparkles,
    titulo: "Triagem com IA",
    texto:
      "Lê todos os currículos e separa quem atende os requisitos da vaga, sem olhar nome, foto ou contato. Quem decide é você.",
  },
  {
    icone: ClipboardCheck,
    titulo: "Teste Prático",
    texto:
      "Currículo bonito não diz se a pessoa sabe fazer. O teste diz: o candidato responde um teste curto da função, e você vê se ficou acima, dentro ou abaixo do esperado.",
  },
  {
    icone: Video,
    titulo: "Entrevista em vídeo",
    texto:
      "Confirme que a pessoa sabe fazer, com as duas opções no mesmo recurso. Gravada: o candidato responde pelo celular no prazo que você escolher, e a IA transcreve e resume. Ao vivo: a chamada dentro do Publike, sem Zoom nem Meet, de 10 a 30 por mês, pelo plano.",
  },
  {
    icone: Workflow,
    titulo: "Automações personalizadas",
    texto:
      "Regras do tipo “quem mora a até 5 km e tem CNH vai para Em análise e recebe a mensagem”, sem ninguém precisar fazer na mão.",
  },
];

// O que vem só dentro do Plano Empresa e do Plano Agência (claude/plano-convite-automatico-30-dias-e-anual.md)
const SO_NOS_PLANOS: Item[] = [
  {
    icone: CalendarClock,
    titulo: "Mutirão de contratação",
    texto:
      "Um dia de entrevistas para contratar várias pessoas de uma vez: quem curtiu escolhe o horário, recebe o lembrete na véspera, e você marca quem chegou. O primeiro é grátis.",
  },
  {
    icone: Megaphone,
    titulo: "Convite automático",
    texto:
      "Chegou um currículo que combina com a vaga, o convite sai sozinho com o seu recado. Cada pessoa recebe no máximo 2 por semana.",
  },
  {
    icone: MapPin,
    titulo: "Mapa de talentos",
    texto:
      "Quantas pessoas de cada função moram a até 15, 30 e 45 minutos de ônibus da vaga, e em que bairros. Ninguém tem a casa mostrada.",
  },
  {
    icone: LayoutGrid,
    titulo: "Mosaico e Linha do tempo",
    texto:
      "Duas outras visões das suas vagas: quantos chegam por dia em cada uma e, numa linha, quando cada vaga entrou, sai do ar e tem entrevista. 15 dias grátis para testar.",
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
    r: `De graça, cada conta pode ter até ${comum.noAr} vagas no ar ao mesmo tempo e publicar até ${comum.porDia} por dia. Para mais de ${comum.noAr} no ar, é com um plano: o Plano Empresa vai até ${LIMITES_CONTA.comPlano.empresa}, e o Plano Agência, para agência com o CNPJ conferido pela equipe, até ${LIMITES_CONTA.comPlano.agencia}. Agência verificada também publica até ${LIMITES_CONTA.agenciaVerificada.porDia} por dia.`,
  },
  {
    p: "Quanto tempo a vaga fica no ar?",
    r: "Você escolhe ao publicar: 15, 30, 60, 90 dias, outro prazo ou sem prazo (fica até você encerrar). Contratou? Marque “Vaga preenchida”: a vaga continua no site com a marcação e quem curtiu recebe o aviso.",
  },
  {
    p: "O que é pago no Publike?",
    r: "Publicar, receber candidatos e conversar continuam grátis. São pagos só os recursos para quem contrata muito: Consulta de salários, Triagem com IA, Teste Prático, Entrevista em vídeo e Automações personalizadas. Cada um dá para experimentar de graça (15 dias, ou as consultas grátis no caso dos salários). O Plano Empresa junta todos, pelo número de vagas no ar, e traz também o mutirão de contratação, o convite automático e o mapa de talentos.",
  },
  {
    p: "Como funciona a nota de aderência dos candidatos?",
    r: "Ela compara o que a vaga pede com o currículo, o perfil e as respostas, e mostra o porquê item por item. Na vaga que pede experiência, a experiência na função pesa mais: conta o trabalho, uma área parecida, o estudo ou um curso dela. Na vaga que aceita quem está começando, quem não tem experiência não fica de fora. Se falta a escolaridade, a CNH ou o horário que você pediu, a nota avisa. A nota só ordena a lista: quem decide é você.",
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

        <section aria-labelledby="contrata-muito" className="mt-12">
          <h2 id="contrata-muito" className="flex flex-wrap items-center gap-2 text-h2">
            Para quem contrata muito
            <Selo variante="novo">Novo</Selo>
          </h2>
          <p className="mt-2 max-w-2xl text-body text-ink-muted">
            Publicar continua grátis. Para RH, agência e empresa com muitas vagas, estes recursos tiram o trabalho
            repetido. Cada um dá para experimentar de graça, e o Plano Empresa junta todos, pelo número de vagas no ar.
          </p>
          <ul className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {RECURSOS_PAGOS.map(({ icone: Icone, titulo, texto }) => (
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
          <p className="mt-4 text-body-sm text-ink-muted">
            15 dias grátis na Triagem, no Teste, na Entrevista em vídeo e nas Automações; na Consulta de salários, as
            consultas grátis. Depois, assine só o que usar ou o plano.
          </p>
          <h3 className="mt-8 text-h3">Só nos planos</h3>
          <ul className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {SO_NOS_PLANOS.map(({ icone: Icone, titulo, texto }) => (
              <li key={titulo} className="flex gap-4 rounded-lg border border-line bg-surface-200 p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-surface-300">
                  <Icone aria-hidden className="size-5 text-terra-text" />
                </span>
                <div>
                  <h4 className="text-label">{titulo}</h4>
                  <p className="mt-1 text-body-sm text-ink-muted">{texto}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-body-sm text-ink-muted">
            Pix ou cartão, sem fidelidade: dá para cancelar quando quiser, e o que já foi pago vale até o fim. Precisa
            de mais vagas no ar? Mude de faixa pagando só a diferença dos dias que faltam.
          </p>
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
