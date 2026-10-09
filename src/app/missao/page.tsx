import { Building2, Bus, HandHeart, House, Lock, MapPin, Store } from "lucide-react";
import type { Metadata } from "next";
import { Container } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";

export const metadata: Metadata = {
  title: "Nossa missão",
  description:
    "O Publike é uma ferramenta do povo para gerar emprego em Goiânia e região: trabalho perto de casa, menos tempo no ônibus e empresas de todos os tamanhos achando gente boa no bairro. De graça.",
};

const PILARES = [
  {
    icone: House,
    titulo: "Trabalho perto de casa",
    texto:
      "Cada hora a menos no ônibus é uma hora a mais com a família, para estudar ou para descansar. Por isso o Publike mostra primeiro o que está perto de você, com a distância e o tempo de ônibus de cada vaga.",
  },
  {
    icone: Store,
    titulo: "Empresas de todos os tamanhos",
    texto:
      "Do MEI à grande empresa, qualquer um publica vagas e acha profissionais de graça. O comércio do bairro, a pequena e a média empresa, que não têm setor de RH, contratam com a mesma facilidade de uma grande.",
  },
  {
    icone: HandHeart,
    titulo: "Melhores condições para quem trabalha",
    texto:
      "Quem contrata gente que mora perto gasta menos com vale-transporte e costuma ter uma equipe mais pontual, que fica mais tempo no emprego. Essa economia pode virar salário, benefício ou um horário melhor.",
  },
  {
    icone: Lock,
    titulo: "Grátis, de verdade",
    texto:
      "Sem plano pago, sem taxa para se candidatar e sem venda de dados. Ninguém pode cobrar para você conseguir trabalho, nem pelo Publike nem fora dele.",
  },
];

const LOCAL = [
  {
    icone: Building2,
    titulo: "Endereço certo da empresa",
    texto:
      "Comércio, empresa e agência informam o CEP e o número. O pino fica na porta, o endereço aparece na vaga e quem procura vê o caminho de ônibus.",
  },
  {
    icone: MapPin,
    titulo: "Casa de quem procura, sem expor ninguém",
    texto:
      "Quem procura pode informar o CEP de casa. Guardamos só um ponto arredondado, de uns 300 metros, que ninguém mais vê. Ele serve só para medir a distância até cada vaga.",
  },
  {
    icone: Bus,
    titulo: "Tempo de ônibus em cada vaga",
    texto:
      "Com o CEP de casa, cada vaga mostra quanto tempo leva de ônibus, e dá para buscar só o que fica a até 30 minutos, por exemplo.",
  },
];

export default function Missao() {
  return (
    <>
      <section className="border-b border-line">
        <Container className="py-10 sm:py-14">
          <p className="text-caption text-ink-muted uppercase">Nossa missão</p>
          <h1 className="mt-2 max-w-3xl text-h1 sm:text-display">Uma ferramenta do povo para gerar emprego em Goiânia.</h1>
          <p className="mt-4 max-w-2xl text-body-lg text-ink-muted">
            O Publike existe para pôr Goiânia e região para trabalhar perto de casa. Quem procura acha vaga, bico ou
            freelance no próprio bairro. Empresas de qualquer tamanho, do comércio da esquina à indústria, acham
            profissionais que moram perto e podem oferecer melhores condições de trabalho. Tudo de graça.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <BotaoLink href="/descobrir" variante="primario">
              Ver vagas perto de mim
            </BotaoLink>
            <BotaoLink href="/publicar">Publicar uma vaga grátis</BotaoLink>
          </div>
        </Container>
      </section>

      <Container className="py-10">
        <h2 className="text-h2">No que acreditamos</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {PILARES.map(({ icone: Icone, titulo, texto }) => (
            <section key={titulo} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-6 shadow-card">
              <span className="flex size-11 items-center justify-center rounded-pill bg-surface-300">
                <Icone aria-hidden className="size-5 text-terra-text" />
              </span>
              <h3 className="text-h3">{titulo}</h3>
              <p className="text-body text-ink-muted">{texto}</p>
            </section>
          ))}
        </div>

        <section className="mt-12" aria-labelledby="local">
          <h2 id="local" className="text-h2">
            Por que o local precisa ser certo
          </h2>
          <p className="mt-2 max-w-2xl text-body text-ink-muted">
            “Perto” só funciona quando o lugar da vaga e o de quem procura estão certos no mapa. Por isso o Publike usa o
            CEP dos dois lados, e cada lado mostra só o que precisa.
          </p>
          <ul className="mt-6 grid gap-4 md:grid-cols-3">
            {LOCAL.map(({ icone: Icone, titulo, texto }) => (
              <li key={titulo} className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-5">
                <Icone aria-hidden className="size-6 text-terra-text" />
                <h3 className="text-label">{titulo}</h3>
                <p className="text-body-sm text-ink-muted">{texto}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-body-sm text-ink-muted">
            Vaga publicada por pessoa física (uma família que procura diarista, por exemplo) e vaga de empresa confidencial
            mostram só uma área de uns 500 metros, sem endereço.
          </p>
        </section>

        <section className="mt-12 rounded-lg bg-surface-300 p-6 sm:p-8">
          <h2 className="text-h2">Faça parte</h2>
          <p className="mt-2 max-w-2xl text-body">
            Tem um comércio, uma empresa ou uma obra? Publique a vaga com o endereço certo e quem mora perto vê primeiro.
            Procura trabalho? Informe o CEP de casa e veja o que está a poucos minutos de você.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <BotaoLink href="/publicar">Publicar vaga grátis</BotaoLink>
            <BotaoLink href="/?casa=1#busca">Informar meu CEP</BotaoLink>
          </div>
        </section>
      </Container>
    </>
  );
}
