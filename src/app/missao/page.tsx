import {
  BadgeCheck,
  Bell,
  Bus,
  ClipboardList,
  FileText,
  HandHeart,
  Heart,
  House,
  KeyRound,
  Layers,
  Lock,
  MapPin,
  Megaphone,
  MessageCircleQuestion,
  ShieldCheck,
  Star,
  Store,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";

export const metadata: Metadata = {
  title: "Nossa missão",
  description:
    "O Publike é uma ferramenta do povo para gerar emprego em Goiânia e região: vagas, freelances e serviços perto de casa, com o tempo de ônibus de cada vaga, contato só depois do match e tudo de graça.",
};

type Item = { icone: LucideIcon; titulo: string; texto: string };

const PILARES: Item[] = [
  {
    icone: House,
    titulo: "Trabalho perto de casa",
    texto:
      "Cada hora a menos no ônibus é uma hora a mais com a família, para estudar ou para descansar. O Publike mostra primeiro o que está perto de você.",
  },
  {
    icone: Store,
    titulo: "Empresas de todos os tamanhos",
    texto:
      "Do MEI à indústria, qualquer um publica e acha gente boa de graça. O comércio do bairro, sem setor de RH, contrata com a mesma facilidade de uma grande empresa.",
  },
  {
    icone: HandHeart,
    titulo: "Melhores condições para quem trabalha",
    texto:
      "Quem contrata gente que mora perto gasta menos com vale-transporte e tem uma equipe mais pontual. Essa economia pode virar salário, benefício ou um horário melhor.",
  },
  {
    icone: Lock,
    titulo: "Grátis, de verdade",
    texto:
      "Sem plano pago, sem taxa para se candidatar, sem pagar por contato e sem venda de dados. Ninguém pode cobrar para você conseguir trabalho, nem pelo Publike nem fora dele.",
  },
];

const PROCURA: Item[] = [
  {
    icone: MapPin,
    titulo: "Busca por perto",
    texto:
      "Diga o CEP de casa uma vez e veja vagas com carteira, diárias, freelances e serviços do mais perto ao mais longe, na lista ou no mapa.",
  },
  {
    icone: Bus,
    titulo: "Tempo de ônibus em cada vaga",
    texto:
      "Cada vaga mostra quanto tempo leva de ônibus (ou a pé) da sua casa, e dá para buscar só o que fica a até 30 minutos, por exemplo.",
  },
  {
    icone: Layers,
    titulo: "Descobrir, uma vaga por vez",
    texto:
      "Deslize as vagas como cartões: para a direita curte, para a esquerda passa. Cada cartão diz quanto a vaga combina com você e por quê.",
  },
  {
    icone: Heart,
    titulo: "Curtir e dar match",
    texto:
      "Curtiu uma vaga? Quem publicou vê seu perfil e curte de volta. Só aí o WhatsApp dos dois aparece. Ninguém recebe seu telefone sem você querer.",
  },
  {
    icone: FileText,
    titulo: "Currículo simples",
    texto:
      "Estudos, experiências, CNH e horários, preenchidos no celular. Só vê quem publicou uma vaga que você curtiu.",
  },
  {
    icone: Bell,
    titulo: "Avisos na hora",
    texto: "O sino e o e-mail avisam quando alguém curte seu anúncio e quando dá match, para você não perder a vez.",
  },
];

const CONTRATA: Item[] = [
  {
    icone: Megaphone,
    titulo: "Publicar em poucos minutos",
    texto:
      "O CEP e o número levam o pino até a porta e preenchem o bairro. A ajuda da IA melhora o texto da vaga, se você quiser.",
  },
  {
    icone: ClipboardList,
    titulo: "Organizar os candidatos",
    texto:
      "Marque a etapa de cada pessoa (novo, em análise, entrevista, contratado, não seguiu), anote o que combinou e baixe a lista numa planilha.",
  },
  {
    icone: BadgeCheck,
    titulo: "Agências e RH",
    texto:
      "Conta de agência com CNPJ conferido pela equipe, selo de verificada, vaga de empresa confidencial e até 200 vagas no ar.",
  },
  {
    icone: Star,
    titulo: "Serviços com avaliação",
    texto:
      "Diarista, pedreiro, eletricista e outros profissionais anunciam o que fazem. Quem contrata avalia depois do match, e a nota ajuda o próximo cliente.",
  },
];

const CUIDADOS: Item[] = [
  {
    icone: ShieldCheck,
    titulo: "Moderação",
    texto:
      "Cada anúncio novo passa por uma revisão automática que tira do ar golpe, cobrança, discriminação e trabalho infantil. Algumas denúncias de pessoas diferentes também tiram, até a equipe olhar.",
  },
  {
    icone: KeyRound,
    titulo: "Contato protegido",
    texto:
      "Telefone, e-mail e link de WhatsApp no texto do anúncio são bloqueados. O contato só aparece depois do match, e qualquer lado pode desfazer o match.",
  },
  {
    icone: Lock,
    titulo: "Seus dados são seus",
    texto:
      "Do CEP de casa guardamos só um ponto arredondado, de uns 300 metros, que ninguém vê. Excluir a conta apaga tudo na hora.",
  },
  {
    icone: MessageCircleQuestion,
    titulo: "Ajuda e escuta",
    texto:
      "O botão Ajuda tira dúvidas a qualquer hora, e qualquer pessoa pode mandar um erro, uma sugestão ou um elogio. A gente lê tudo.",
  },
];

function Cartoes({ itens, colunas = "md:grid-cols-2" }: { itens: Item[]; colunas?: string }) {
  return (
    <ul className={`mt-6 grid gap-4 ${colunas}`}>
      {itens.map(({ icone: Icone, titulo, texto }) => (
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
  );
}

export default function Missao() {
  return (
    <>
      <section className="border-b border-line">
        <Container className="py-10 sm:py-14">
          <p className="text-caption text-ink-muted uppercase">Nossa missão</p>
          <h1 className="mt-2 max-w-3xl text-h1 sm:text-display">Pôr Goiânia para trabalhar perto de casa.</h1>
          <p className="mt-4 max-w-2xl text-body-lg text-ink-muted">
            O Publike é uma ferramenta do povo para gerar emprego em Goiânia e região. Quem procura acha vaga com
            carteira, diária, freelance ou cliente para o seu serviço no próprio bairro. Quem contrata, do comércio da
            esquina à indústria, acha gente boa que mora perto. Tudo de graça, para os dois lados.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <BotaoLink href="/#busca" variante="primario">
              Ver o que é perto de mim
            </BotaoLink>
            <BotaoLink href="/publicar">Publicar grátis</BotaoLink>
          </div>
        </Container>
      </section>

      <Container className="py-10">
        <section aria-labelledby="problema" className="max-w-3xl">
          <h2 id="problema" className="text-h2">
            Por que o Publike existe
          </h2>
          <div className="mt-3 flex flex-col gap-3 text-body text-ink-muted">
            <p>
              Hoje, quem procura trabalho em Goiânia pula entre sites de emprego feitos para a cidade inteira, grupos de
              WhatsApp e Facebook cheios de golpe e aplicativos que cobram do profissional para ver o contato do
              cliente. Muita vaga boa fica a duas horas de ônibus, e muita vaga perto de casa nem chega a ser vista.
            </p>
            <p>
              O Publike junta tudo num lugar só, organizado pela distância e pelo tempo de ônibus, com o contato
              protegido até os dois lados quererem conversar.
            </p>
          </div>
        </section>

        <section aria-labelledby="crencas" className="mt-12">
          <h2 id="crencas" className="text-h2">
            No que acreditamos
          </h2>
          <Cartoes itens={PILARES} />
        </section>

        <section aria-labelledby="procura" className="mt-12">
          <h2 id="procura" className="text-h2">
            Para quem procura trabalho
          </h2>
          <p className="mt-2 max-w-2xl text-body text-ink-muted">
            Sem senha para lembrar: o link de entrar chega no seu e-mail.
          </p>
          <Cartoes itens={PROCURA} colunas="md:grid-cols-2 lg:grid-cols-3" />
        </section>

        <section aria-labelledby="contrata" className="mt-12">
          <h2 id="contrata" className="text-h2">
            Para quem contrata
          </h2>
          <p className="mt-2 max-w-2xl text-body text-ink-muted">
            Comércio, empresa, agência, família ou profissional autônomo: publicar é grátis, e a vaga aparece primeiro
            para quem mora perto.
          </p>
          <Cartoes itens={CONTRATA} />
        </section>

        <section aria-labelledby="local" className="mt-12">
          <h2 id="local" className="text-h2">
            O lugar certo, sem expor ninguém
          </h2>
          <p className="mt-2 max-w-2xl text-body text-ink-muted">
            “Perto” só funciona quando a vaga e a casa de quem procura estão certas no mapa. Por isso o Publike usa o
            CEP dos dois lados, e cada lado mostra só o que precisa. Comércio, empresa e agência mostram o endereço, com
            o pino na porta e o link do caminho de ônibus. Vaga de pessoa física (uma família que procura diarista, por
            exemplo) e de empresa confidencial mostram só uma área de uns 500 metros.
          </p>
        </section>

        <section aria-labelledby="cuidados" className="mt-12">
          <h2 id="cuidados" className="text-h2">
            Cuidado com quem usa
          </h2>
          <Cartoes itens={CUIDADOS} />
          <p className="mt-4 text-body-sm text-ink-muted">
            Os detalhes estão em{" "}
            <Link href="/como-funciona" className="underline underline-offset-2 hover:text-ink">
              Como funciona
            </Link>{" "}
            e na{" "}
            <Link href="/privacidade" className="underline underline-offset-2 hover:text-ink">
              página de privacidade
            </Link>
            .
          </p>
        </section>

        <section className="mt-12 rounded-lg bg-surface-300 p-6 sm:p-8">
          <h2 className="text-h2">Faça parte</h2>
          <p className="mt-2 max-w-2xl text-body">
            Tem um comércio, uma empresa ou uma obra? Publique a vaga com o endereço certo e quem mora perto vê
            primeiro. Procura trabalho ou clientes? Diga o CEP de casa e veja o que está a poucos minutos de você. E
            conte para o vizinho: quanto mais gente do bairro no Publike, mais vaga perto de casa.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <BotaoLink href="/publicar" variante="primario">
              Publicar grátis
            </BotaoLink>
            <BotaoLink href="/?casa=1#busca">Informar meu CEP</BotaoLink>
          </div>
        </section>
      </Container>
    </>
  );
}
