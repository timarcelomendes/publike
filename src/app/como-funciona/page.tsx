import { Heart, Lock, Megaphone, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import { PassosComoFunciona } from "@/components/inicio";
import { Container } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { LIMITES_CONTA } from "@/lib/constantes";

export const metadata: Metadata = {
  title: "Como funciona",
  description:
    "Quem contrata publica a vaga, quem trabalha mostra os serviços. Quando dá match, o WhatsApp aparece. Veja como usar o Publike e as dicas de segurança.",
};

const CONTRATA = [
  "Publique a vaga: com carteira, temporária, diária ou freelance (um reboco, uma faxina, um conserto).",
  "Ou procure um profissional: pedreiro, diarista, eletricista… Veja fotos dos trabalhos e o preço, e peça para contratar.",
  "Informe o CEP e o número: o pino fica na porta e quem mora perto vê primeiro, com o tempo de ônibus até aí. (Vaga de pessoa física mostra só uma área de uns 500 m.)",
  "Empresa de qualquer tamanho pode publicar: do MEI e do comércio do bairro à indústria. Contratar gente que mora perto ajuda a oferecer melhores condições e a manter a equipe.",
  "Veja quem curtiu a vaga e o que cada pessoa faz. Curta de volta quem combina com você.",
  "A vaga fica 30 dias no ar e pode ser renovada. Dá para pausar ou encerrar quando quiser.",
  "É agência de emprego ou RH? Crie a conta como “Agência / RH”, com o CNPJ, e publique as vagas das empresas que você atende. Também é grátis.",
];

const TRABALHA = [
  "Veja vagas e freelances perto de você, no mapa ou em lista. Curta o que combina.",
  "Informe o CEP de casa em “Onde você mora?”: cada vaga mostra a distância e o tempo de ônibus, e dá para buscar só o que fica a até 30 minutos. Ninguém vê seu CEP.",
  "Vai atrás de vaga com carteira ou estágio? Preencha “Meu currículo” uma vez: quem anunciou a vaga que você curtiu vê junto com seu perfil.",
  "Oferece serviços? Monte sua vitrine em “Meus serviços”: o que você faz, o preço, fotos e onde atende.",
  "Quando alguém quiser contratar você, chega um aviso. Aceitou, deu match: o WhatsApp aparece no painel.",
  "Seu número nunca fica público no site. Os serviços ficam 90 dias no ar, e salvar de novo renova.",
];

const SEGURANCA = [
  "Ninguém pode cobrar para você conseguir trabalho: nada de taxa de cadastro, curso, uniforme ou exame pago antes de contratar. Vale também para agência de emprego.",
  "Desconfie de salário muito acima do normal ou de pressa para fechar negócio.",
  "Não mande foto de documento, senha ou códigos que chegam por SMS.",
  "Na entrevista ou no primeiro serviço, prefira lugares movimentados e avise alguém de confiança.",
  "Combinou um serviço? Deixe valor e prazo por escrito no WhatsApp.",
  "Viu algo estranho? Denuncie. Três denúncias tiram o anúncio do ar até a moderação analisar.",
];

const PERGUNTAS = [
  {
    p: "É grátis mesmo?",
    r: "Sim. Publicar, curtir e conversar é de graça para quem trabalha, para o comércio do bairro e para quem presta serviço.",
  },
  {
    p: "Como funcionam as avaliações?",
    r: "Quem contratou um profissional pelo Publike avalia depois do match, com nota de 1 a 5 e um comentário. A nota média aparece a partir de 3 avaliações, e o profissional pode responder uma vez. Os textos passam por uma revisão automática: crítica honesta é publicada; ofensa, ameaça ou dados pessoais, não.",
  },
  {
    p: "Quem vê meu currículo?",
    r: "Só quem anunciou uma vaga que você curtiu, enquanto a curtida existir. Se a vaga pede currículo, o match só acontece depois que você preencher o seu. Ele não aparece no seu perfil público nem na busca. Você corrige ou apaga quando quiser, em Meu perfil.",
  },
  {
    p: "O que é match?",
    r: "É quando os dois lados topam: você curte uma vaga e quem publicou curte você de volta, ou você pede um serviço e o profissional aceita. Aí o WhatsApp dos dois aparece.",
  },
  {
    p: "E se eu quiser desistir de um match?",
    r: "Toque em “Desfazer match” no painel ou no anúncio. Escolha o motivo e escreva uma justificativa: a outra pessoa recebe um aviso só com o motivo, e a justificativa vai para a equipe do Publike. O WhatsApp some para os dois. Você também diz se toparia negociar em outro momento: se sim, dá para dar match de novo mais para frente; se não, vocês não conseguem mais curtir os anúncios um do outro.",
  },
  {
    p: "Por que o telefone não aparece no anúncio?",
    r: "Para evitar golpes e spam. O contato só aparece quando dá match, e só para as duas pessoas.",
  },
  {
    p: "Quem pode publicar?",
    r: "Qualquer pessoa, comércio, empresa ou agência de emprego de Goiânia e região, com um WhatsApp no perfil.",
  },
  {
    p: "Sou agência de emprego ou RH. Posso usar?",
    r: `Pode, e de graça. Crie a conta como “Agência / RH” e informe o CNPJ: ele aparece no seu perfil e nas suas vagas, para os candidatos conferirem na Receita. Em cada vaga, diga para qual empresa ela é ou marque “Empresa confidencial”. Depois que a equipe do Publike confere o CNPJ, a agência pode ter até ${LIMITES_CONTA.agenciaVerificada.noAr} vagas no ar e publicar ${LIMITES_CONTA.agenciaVerificada.porDia} por dia. A agência não pode cobrar nada de quem se candidata.`,
  },
  {
    p: "Quanto tempo o anúncio fica no ar?",
    r: "30 dias, e pode ser renovado de 30 em 30 dias. Quando estiver perto de vencer, ou depois que vencer, é só tocar em “Renovar por 30 dias” no seu painel.",
  },
  {
    p: "Como denunciar?",
    r: "Abra o anúncio e toque em “Denunciar anúncio”. Quem publicou não fica sabendo quem denunciou.",
  },
];

export default function ComoFunciona() {
  return (
    <>
      <section className="border-b border-line">
        <Container className="py-10 sm:py-14">
          <h1 className="max-w-3xl text-h1 sm:text-display">Quem precisa publica. Quem faz curte.</h1>
          <p className="mt-4 max-w-2xl text-body-lg text-ink-muted">
            O Publike é uma ferramenta do povo para gerar emprego em Goiânia e região: vagas com carteira, diárias,
            freelances e serviços, organizados pela distância e pelo tempo de ônibus de casa. De graça para quem procura e
            para empresas de qualquer tamanho.
          </p>
        </Container>
      </section>

      <Container className="py-10">
        <PassosComoFunciona />

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {[
            { titulo: "Para quem contrata", icone: Megaphone, itens: CONTRATA },
            { titulo: "Para quem trabalha", icone: Heart, itens: TRABALHA },
          ].map(({ titulo, icone: Icone, itens }) => (
            <section key={titulo} className="rounded-lg border border-line bg-surface-200 p-6">
              <h2 className="flex items-center gap-3 text-h2">
                <Icone aria-hidden className="size-6 text-terra-text" />
                {titulo}
              </h2>
              <ul className="mt-4 flex flex-col gap-3 text-body">
                {itens.map((i) => (
                  <li key={i} className="flex gap-3">
                    <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-pill bg-ink" />
                    {i}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <section id="seguranca" className="mt-12 scroll-mt-24 rounded-lg bg-terra-soft p-6 sm:p-8">
          <h2 className="flex items-center gap-3 text-h2">
            <ShieldAlert aria-hidden className="size-6 text-terra-text" />
            Dicas de segurança
          </h2>
          <ul className="mt-4 flex flex-col gap-3 text-body">
            {SEGURANCA.map((s) => (
              <li key={s} className="flex gap-3">
                <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-pill bg-terra-text" />
                {s}
              </li>
            ))}
          </ul>
          <p className="mt-6 flex gap-3 text-body-sm">
            <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
            Vaga de pessoa física mostra só a região, uma área de uns 500 metros, sem endereço. Comércio e empresa podem
            mostrar o endereço, como uma fachada. Seu CEP de casa ninguém vê.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-h2">Perguntas frequentes</h2>
          <div className="mt-4 flex flex-col gap-2">
            {PERGUNTAS.map(({ p, r }) => (
              <details key={p} className="group rounded-md border border-line bg-surface-200 px-5 py-4">
                <summary className="cursor-pointer list-none text-label marker:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {p}
                    <span aria-hidden className="text-h3 text-ink-muted transition-transform group-open:rotate-45">
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-3 text-body text-ink-muted">{r}</p>
              </details>
            ))}
          </div>
        </section>

        <div className="mt-12 flex flex-wrap gap-3">
          <BotaoLink href="/">Ver oportunidades</BotaoLink>
          <BotaoLink href="/publicar">Publicar grátis</BotaoLink>
        </div>
      </Container>
    </>
  );
}
