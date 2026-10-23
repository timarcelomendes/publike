import type { Metadata } from "next";
import { Lista, PaginaDoDocumento, Secao } from "@/components/documentos-legais";

export const metadata: Metadata = {
  title: "Regras do Publike",
  description:
    "O que vale para todo mundo no Publike: vagas e serviços reais, nada de cobrar de quem vai trabalhar, sem discriminação.",
  alternates: { canonical: "/regras" },
};

export default function Regras() {
  return (
    <PaginaDoDocumento
      atual="/regras"
      titulo="Regras do Publike"
      resumo="O que vale para todo mundo aqui: quem publica, quem procura e quem contrata."
    >
      <Secao id="regras" titulo="O que vale para todos">
        <Lista
          itens={[
            "É proibido cobrar qualquer valor de quem vai trabalhar para conseguir a vaga.",
            "Agências de emprego e RH publicam de graça, dizem para qual empresa é a vaga (ou que ela é confidencial) e não podem cobrar nada de quem se candidata: nem cadastro, nem entrevista, nem curso, nem exame. O currículo recebido serve só para a seleção daquela vaga.",
            "Nada de discriminação por cor, gênero, idade, religião, orientação sexual, deficiência ou origem.",
            "Vagas e serviços precisam ser reais, legais e com informação verdadeira. As fotos de trabalhos precisam ser de serviços que a pessoa fez.",
            "Não escreva telefone, e-mail ou links no anúncio: o contato aparece no match.",
            "Desfazer match: qualquer um dos dois pode desistir, dizendo o motivo e escrevendo uma justificativa. A outra pessoa vê só o motivo; a justificativa fica com a equipe, que pode usá-la para avaliar uma conta. O contato some para os dois na hora. Depois, os dois podem tentar de novo enquanto o anúncio estiver no ar. Qualquer um dos dois pode dizer que não quer mais negociar com o outro: aí o outro não consegue mais curtir os anúncios de quem bloqueou nem dar match com ele. Dá para desbloquear quando quiser.",
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
    </PaginaDoDocumento>
  );
}
