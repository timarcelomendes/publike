import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "@/components/ui/basicos";
import { CONTATO_EMAIL } from "@/lib/config";

export const metadata: Metadata = {
  title: "Privacidade e regras",
  description: "Que dados o Publike guarda, quem vê o quê, seus direitos pela LGPD e as regras para publicar.",
};

function Secao({ id, titulo, children }: { id?: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-line pt-8">
      <h2 className="text-h2">{titulo}</h2>
      <div className="mt-3 flex flex-col gap-3 text-body text-ink">{children}</div>
    </section>
  );
}

function Lista({ itens }: { itens: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {itens.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-pill bg-ink" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Privacidade() {
  return (
    <Container className="max-w-3xl py-10">
      <h1 className="text-h1">Privacidade e regras</h1>
      <p className="mt-3 mb-8 text-body-lg text-ink-muted">
        Em palavras simples: o que guardamos, quem vê o quê e o que vale para todo mundo aqui. Atualizado em outubro de
        2026.
      </p>

      <div className="flex flex-col gap-8">
        <Secao titulo="Que dados guardamos">
          <Lista
            itens={[
              "Para entrar: seu e-mail, seu celular ou sua conta Google, Facebook ou LinkedIn. Dessas contas recebemos só o nome e o e-mail. Não publicamos nada nelas e não vemos seus amigos ou contatos.",
              "No perfil: nome, se você é pessoa, comércio, empresa ou agência de emprego, cidade, bairro, foto (opcional), o que você faz e uma apresentação. Agência informa também o CNPJ.",
              "Contato: seu WhatsApp e, se quiser, um e-mail.",
              "O que você faz no site: anúncios, curtidas, matches e denúncias.",
              "Se você preencher: o currículo (estudos, experiências, cursos, CNH, quando pode trabalhar) e o PDF que anexar.",
              "Localização dos anúncios: só a região, uma área de uns 500 metros. O endereço exato nunca é guardado.",
              "Quando você usa “Perto de mim”, a localização serve só para a busca e não fica salva no seu perfil.",
            ]}
          />
        </Secao>

        <Secao titulo="Quem vê o quê">
          <Lista
            itens={[
              "Qualquer pessoa vê seu perfil público e seus anúncios no ar.",
              "Quem publicou vê quem curtiu o anúncio, com o perfil e a mensagem. Numa vaga, vê também o currículo de quem preencheu.",
              "Seu WhatsApp e seu e-mail de contato só aparecem para a outra pessoa de um match.",
              "O CNPJ de uma agência de emprego aparece no perfil e nas vagas dela, para quem procura trabalho conferir na Receita.",
              "Denúncias só a moderação vê. Quem publicou não sabe quem denunciou.",
              "Não vendemos seus dados.",
            ]}
          />
        </Secao>

        <Secao id="curriculo" titulo="Seu currículo">
          <Lista
            itens={[
              "Não é público: não aparece no seu perfil, na busca nem no Google.",
              "Só vê quem anunciou uma vaga que você curtiu, e só enquanto a curtida existir. Desfez a curtida, deixou de ver.",
              "Se a vaga é de uma agência de emprego, a agência pode mostrar seu currículo à empresa contratante daquela vaga, só para a seleção.",
              "O PDF fica guardado num lugar fechado e só abre com um link que vale por uma hora.",
              "O PDF vai do jeito que você enviar. Se tiver telefone, e-mail ou endereço, quem anunciou a vaga vê esses dados.",
              "Você corrige ou apaga o currículo quando quiser, em Meu perfil > Meu currículo. Excluir a conta apaga junto.",
            ]}
          />
        </Secao>

        <Secao titulo="Para que usamos">
          <p>
            Para o Publike funcionar (mostrar anúncios, conectar quem deu match e avisar você) e para manter o site
            seguro (limites contra abuso, denúncias e moderação).
          </p>
          <p>
            Usamos serviços de terceiros só para isso: o Supabase (banco de dados, login e fotos), o OpenFreeMap, com
            dados do OpenStreetMap (mapas), o Zoho (envio dos e-mails de aviso), a OpenAI (a IA que revisa o texto
            dos anúncios e ajuda a escrever), a Cloudflare (a verificação contra robôs na hora de entrar) e, se você
            escolher entrar com eles, Google, Facebook ou LinkedIn.
          </p>
          <p>
            A IA recebe só o texto do anúncio (título, descrição, valor, horário, bairro e, na vaga de agência, o nome
            da empresa contratante), nunca seu contato. Quando ela acha um anúncio suspeito, ele sai do ar até uma
            pessoa da moderação olhar.
          </p>
          <p>
            Você recebe avisos por e-mail de curtidas, matches e moderação. Para não receber mais, desmarque a opção em{" "}
            <Link href="/perfil" className="underline">
              Meu perfil
            </Link>
            . Avisos sobre suspensão da conta são enviados mesmo assim.
          </p>
        </Secao>

        <Secao titulo="Por quanto tempo">
          <Lista
            itens={[
              "Anúncios saem das buscas depois de 30 dias, a não ser que você renove.",
              "Avisos (curtidas e matches) são apagados depois de 90 dias. O registro dos e-mails enviados, depois de 30 dias.",
              "Quando você exclui a conta, apagamos na hora seu perfil, contato, foto, currículo, anúncios, curtidas e matches.",
              "O registro do que a moderação fez (por exemplo, a remoção de um anúncio ou a suspensão de uma conta) fica guardado para a segurança do site, mesmo depois que a conta é excluída.",
            ]}
          />
        </Secao>

        <Secao titulo="Seus direitos (LGPD)">
          <p>
            Você pode ver e corrigir seus dados em{" "}
            <Link href="/perfil" className="underline">
              Meu perfil
            </Link>{" "}
            e excluir a conta a qualquer momento, no fim da mesma página.
            {CONTATO_EMAIL && (
              <>
                {" "}
                Dúvidas ou pedidos: <a href={`mailto:${CONTATO_EMAIL}`} className="underline">{CONTATO_EMAIL}</a>.
              </>
            )}
          </p>
        </Secao>

        <Secao id="apagar-dados" titulo="Como apagar seus dados">
          <Lista
            itens={[
              <>
                Entre no Publike, abra{" "}
                <Link href="/perfil" className="underline">
                  Meu perfil
                </Link>{" "}
                e toque em <strong>Excluir conta</strong>, no fim da página. Tudo é apagado na hora: perfil, contato,
                foto, anúncios, curtidas e matches.
              </>,
              "Se você entrou com Google, Facebook ou LinkedIn, também pode tirar o acesso do Publike nas configurações da própria conta (em “Apps e sites” ou “Apps conectados”). Isso não apaga seus dados aqui: para isso, use Excluir conta.",
              CONTATO_EMAIL
                ? `Não consegue entrar? Escreva para ${CONTATO_EMAIL} pedindo a exclusão.`
                : "Não consegue entrar? Fale com a gente pelo e-mail de contato do site pedindo a exclusão.",
            ]}
          />
        </Secao>

        <Secao id="regras" titulo="Regras do Publike">
          <Lista
            itens={[
              "É proibido cobrar qualquer valor de quem vai trabalhar para conseguir a vaga.",
              "Agências de emprego e RH publicam de graça, dizem para qual empresa é a vaga (ou que ela é confidencial) e não podem cobrar nada de quem se candidata: nem cadastro, nem entrevista, nem curso, nem exame. O currículo recebido serve só para a seleção daquela vaga.",
              "Nada de discriminação por cor, gênero, idade, religião, orientação sexual, deficiência ou origem.",
              "Vagas e serviços precisam ser reais, legais e com informação verdadeira. As fotos de trabalhos precisam ser de serviços que a pessoa fez.",
              "Não escreva telefone, e-mail ou links no anúncio: o contato aparece no match.",
              "Desfazer match: qualquer um dos dois pode desistir, dizendo o motivo e escrevendo uma justificativa. A outra pessoa vê só o motivo; a justificativa fica com a equipe, que pode usá-la para avaliar uma conta. O contato some para os dois na hora. Quem desfaz diz se toparia negociar de novo: se não, os dois deixam de conseguir curtir os anúncios um do outro.",
              "Avaliações: só avalia quem deu match com o serviço. Crítica honesta é bem-vinda, mesmo negativa. Ofensa, ameaça, discriminação ou dados pessoais de alguém não são publicados, e quem escreveu leva uma advertência.",
              "Nada de conteúdo ofensivo, spam ou anúncio repetido.",
              "Trabalho de menores de 16 anos é proibido, exceto como aprendiz a partir dos 14. Trabalho noturno, perigoso ou insalubre, só a partir dos 18.",
              "Quem não seguir as regras pode ter anúncios removidos e a conta suspensa por um tempo ou de vez. A pessoa recebe o motivo por e-mail.",
            ]}
          />
          <p className="text-body-sm text-ink-muted">
            O Publike aproxima as pessoas. O acordo de trabalho ou de serviço é entre quem contrata e quem trabalha.
          </p>
        </Secao>
      </div>
    </Container>
  );
}
