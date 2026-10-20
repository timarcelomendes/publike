import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "@/components/ui/basicos";
import { CONTATO_EMAIL } from "@/lib/config";
import { VERSAO_TERMOS } from "@/lib/constantes";

export const metadata: Metadata = {
  title: "Privacidade e regras",
  description: "Que dados o Publike guarda, quem vê o quê, cookies, seus direitos pela LGPD e as regras para publicar.",
};

// "2026-10-13" -> "13 de outubro de 2026"
const DATA_DA_VERSAO = new Date(`${VERSAO_TERMOS}T12:00:00Z`).toLocaleDateString("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Onde mandar pedidos sobre os dados: o e-mail de contato ou, sem ele, a página de sugestões. */
function CanalDePedidos() {
  return CONTATO_EMAIL ? (
    <a href={`mailto:${CONTATO_EMAIL}`} className="underline">
      {CONTATO_EMAIL}
    </a>
  ) : (
    <Link href="/sugerir" className="underline">
      Sugestões e erros
    </Link>
  );
}

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
        Em palavras simples: o que guardamos, quem vê o quê e o que vale para todo mundo aqui. Versão de{" "}
        {DATA_DA_VERSAO}.
      </p>

      <div className="flex flex-col gap-8">
        <Secao titulo="Que dados guardamos">
          <Lista
            itens={[
              "Para entrar: seu e-mail, seu celular ou sua conta Google, Facebook ou LinkedIn. Dessas contas recebemos só o nome e o e-mail. Não publicamos nada nelas e não vemos seus amigos ou contatos.",
              "No perfil: nome, se você é pessoa, comércio, empresa ou agência de emprego, cidade, bairro, foto (opcional), o que você faz e uma apresentação. Agência informa também o CNPJ; comércio e empresa podem informar.",
              "Contato: seu WhatsApp e, se quiser, um e-mail.",
              "O que você faz no site: anúncios, curtidas, matches, denúncias e, no Descobrir, as vagas que salvou ou passou e o que escreveu em “O que você procura?” (só você vê).",
              "Se você preencher: o currículo (o que você faz, habilidades, estudos, experiências, cursos, CNH, quando pode trabalhar) e o PDF que anexar.",
              "Localização dos anúncios: comércio, empresa e agência podem informar o CEP e o endereço, que aparecem na vaga com o ponto exato, como uma fachada. Vaga de pessoa física e de empresa confidencial guardam só a região, uma área de uns 500 metros, sem endereço.",
              "CEP de casa (opcional, em “Onde você mora?”): guardamos o CEP e um ponto arredondado, de uns 300 metros, só para medir a distância e o tempo de ônibus até as vagas. Ninguém mais vê. Sem conta, fica só no seu navegador. “Esquecer onde moro” apaga.",
              "Quando você usa “Perto de mim”, a localização serve só para a busca e não fica salva no seu perfil.",
            ]}
          />
        </Secao>

        <Secao titulo="Quem vê o quê">
          <Lista
            itens={[
              "Qualquer pessoa vê seu perfil público e seus anúncios no ar.",
              "Quem publicou vê quem curtiu o anúncio, com o perfil e a mensagem. Numa vaga, vê também o currículo de quem preencheu.",
              "Quem publicou pode marcar em que etapa cada pessoa está (numa vaga: em análise, entrevista, contratado, não seguiu; num serviço: orçamento enviado, agendado, concluído, não seguiu). Quem curtiu vê a etapa e recebe um aviso quando ela muda. Quem publicou também pode escrever uma anotação, que fica só com ele, e baixar a lista de uma vaga numa planilha, só para organizar a seleção. Na planilha, o WhatsApp e o e-mail só aparecem depois do match, como na tela.",
              "Depois do match, os dois podem conversar pelo Publike. Só vocês dois leem a conversa; ela some para os dois se o match for desfeito e é apagada junto com a conta. O aviso de mensagem nova (no site e por e-mail) não leva o texto da mensagem.",
              "Seu WhatsApp e seu e-mail de contato só aparecem para a outra pessoa de um match.",
              "Recomendações que escrevem para você só aparecem no seu perfil depois que você aprova, e você pode esconder qualquer uma depois.",
              "O CNPJ de agência, comércio ou empresa aparece no perfil e nos anúncios, para quem usa o site conferir na Receita.",
              "Denúncias só a moderação vê. Quem publicou não sabe quem denunciou.",
              "Seu CEP de casa ninguém vê: nem quem publica, nem a moderação pelo site.",
              "Para achar o CEP no mapa, o site consulta a BrasilAPI, o ViaCEP e o OpenStreetMap só com o CEP e o número, sem seu nome.",
              "Não vendemos seus dados.",
            ]}
          />
        </Secao>

        <Secao id="curriculo" titulo="Seu currículo">
          <Lista
            itens={[
              "Não aparece no seu perfil público nem no Google. Na busca, só se você ligar “Aparecer na aba Talentos” (veja abaixo).",
              "Só vê quem anunciou uma vaga que você curtiu, e só enquanto a curtida existir. Desfez a curtida, deixou de ver.",
              "Se a vaga é de uma agência de emprego, a agência pode mostrar seu currículo à empresa contratante daquela vaga, só para a seleção. Pelo link de finalistas do Publike, a empresa vê o currículo e o parecer da agência, sem o seu telefone, o e-mail nem o PDF, e você recebe um aviso.",
              "A agência pode ter uma equipe: pessoas com login próprio que cuidam das vagas dela. Elas veem o mesmo que a agência vê das candidaturas às vagas dela, e o que cada uma faz fica anotado para a agência.",
              "Se você ligar “Deixar as empresas me encontrarem”, quem tem vaga na sua cidade vê o currículo em Talentos, com o nome encurtado e sem telefone nem e-mail, e pode convidar você para a vaga. Desligou, sumiu da lista.",
              "Se você ligar “Aparecer na aba Talentos”, qualquer visitante vê um resumo na aba Talentos da busca: o nome encurtado, o bairro, o que você faz, as habilidades, os cursos, os estudos e os cargos, sem o nome das empresas. Empresas, comércios e agências que entraram veem o currículo completo e a foto, e podem convidar você para uma vaga. Telefone, e-mail e o PDF continuam escondidos, e a aba fica fora do Google. Desligou, saiu da aba na hora.",
              "Conexões: quem está na aba Talentos e as empresas, comércios e agências podem pedir conexão um com o outro, mesmo sem vaga. Antes do sim, a empresa vê só o nome encurtado, sem foto. Se o outro lado aceitar, o nome inteiro, o WhatsApp e o e-mail dos dois aparecem e vocês conversam pelo Publike (só vocês dois leem). Qualquer um desfaz quando quiser: os contatos deixam de aparecer e, sem um match numa vaga, a conversa some para os dois.",
              "O PDF fica guardado num lugar fechado e só abre com um link que vale por uma hora.",
              "O PDF vai do jeito que você enviar. Se tiver telefone, e-mail ou endereço, quem anunciou a vaga vê esses dados.",
              "Se você usar “Tem a arte da vaga?” ao publicar, a imagem vai para a IA só para preencher os campos da vaga. Nada é publicado antes de você conferir, e a imagem não fica guardada no Publike.",
              "Se você usar “Já tem currículo pronto?”, o PDF ou as fotos vão para a IA só para preencher os campos, e nada é salvo antes de você conferir. Telefone, e-mail e endereço não entram nos campos. As fotos não ficam guardadas no Publike; o PDF fica anexado ao currículo, e você pode tirar.",
              "Se você mandou seu currículo por fora (WhatsApp, e-mail ou em mãos) para quem publicou uma vaga, essa pessoa ou agência pode chamar você pelo Publike. A IA lê o PDF ou a foto só para montar os campos do currículo, sem telefone nem e-mail, e o arquivo não fica guardado. O que foi lido fica no convite até você aceitar e salvar o seu, dizer que não tem interesse ou o convite vencer (14 dias). Você só entra na vaga se aceitar.",
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
            Usamos serviços de terceiros só para isso: a Vercel (onde o site fica hospedado), o Supabase (banco de
            dados, login e fotos), o OpenFreeMap, com dados do OpenStreetMap (mapas), o Zoho (envio dos e-mails de
            aviso), a OpenAI (a IA que revisa o texto dos anúncios, ajuda a escrever e lê o currículo que você enviar),
            a Cloudflare (a verificação contra robôs na hora de entrar), a BrasilAPI (que traz os dados públicos do CNPJ
            na Receita para preencher o perfil; só enviamos o número do CNPJ) e, se você escolher entrar com eles,
            Google, Facebook ou LinkedIn.
          </p>
          <p>
            A IA recebe só o texto do anúncio (título, descrição, valor, horário, bairro e, na vaga de agência, o nome
            da empresa contratante), nunca seu contato. Quando ela acha um anúncio suspeito, ele sai do ar até uma
            pessoa da moderação olhar. No Descobrir, a IA recebe o que você escreveu em “O que você procura?”, o que
            você faz, as habilidades, as experiências, os cursos, a CNH e os horários do currículo, e o texto das vagas,
            só para pôr primeiro as que combinam com você; nunca seu nome ou contato. Se quem publicou a vaga que você
            curtiu pedir o resumo da IA, ela recebe a vaga, o currículo, as respostas e o recado, para apontar pontos
            fortes e o que conferir; nunca seu nome, foto ou contato, e ela não decide nada: quem decide é a pessoa. No
            “Já tem currículo pronto?”, a IA recebe o PDF ou as fotos do currículo que você enviou, só para preencher os
            campos do seu currículo; no convite de quem publicou uma vaga, o currículo que você mandou para ela, só para
            isso também. No assistente de ajuda, a IA recebe as mensagens da conversa e, se você entrou, seu primeiro
            nome e o bairro que você escolheu; nunca seu contato. A conversa fica só no seu navegador, não no Publike. O
            que você manda em Sugestões e erros fica guardado para a equipe ler, com o e-mail, se você informar.
          </p>
          <p>
            Você recebe avisos por e-mail de curtidas, matches e moderação. Para não receber mais, desmarque a opção em{" "}
            <Link href="/perfil" className="underline">
              Meu perfil
            </Link>
            . Avisos sobre suspensão da conta são enviados mesmo assim.
          </p>
        </Secao>

        <Secao id="bases-legais" titulo="Com que base na lei">
          <Lista
            itens={[
              "Para o Publike funcionar para você (conta, anúncios, curtidas, match, conversa, currículo e avisos): é o uso do site que você pediu, a execução do contrato (LGPD, art. 7º, V).",
              "Para manter o site seguro (limites contra abuso, moderação, denúncias e o registro do que a equipe fez): o legítimo interesse do Publike e de quem usa o site (art. 7º, IX) e a defesa em processo, se precisar (art. 7º, VI).",
              "O que é opcional (o CEP de casa, a localização do “Perto de mim” e o que você escreve em “O que você procura?”): seu consentimento, que você retira quando quiser apagando a informação (art. 7º, I).",
            ]}
          />
        </Secao>

        <Secao id="fora-do-brasil" titulo="Dados fora do Brasil">
          <p>
            Alguns dos serviços acima guardam ou processam dados em servidores fora do Brasil, como nos Estados Unidos
            (por exemplo, a Vercel, a OpenAI e a Cloudflare). Mandamos para cada um só o necessário para a parte dele
            no trabalho, e eles seguem regras de segurança e privacidade próprias.
          </p>
        </Secao>

        <Secao id="cookies" titulo="Cookies">
          <p>
            O Publike usa só cookies necessários. Não usamos cookies de propaganda, de análise de audiência nem de
            rastreamento entre sites.
          </p>
          <Lista
            itens={[
              "Sessão (os cookies que começam com sb-): mantêm você conectado. Sem eles, não dá para entrar.",
              "publike_local: lembra a cidade, o bairro e, se você informou, o CEP de casa de quem está sem conta, por até um ano. “Esquecer onde moro” e sair da conta apagam.",
              "publike_intencao: lembra o que você quer fazer no Publike (procurar trabalho, contratar, oferecer serviço). Sem conta, some quando você fecha o navegador; com conta, dura até um ano.",
              "publike_pediu_link: marca, por uma hora, que este navegador pediu um link de entrar por e-mail. Com ela, o link entra sozinho aqui; em outro aparelho, a página pergunta antes.",
              "publike_origem: quando você chega por um anúncio do Publike (no Google ou no Instagram, por exemplo), guarda só o nome da campanha, como google:servicos, por até 7 dias. Se você criar a conta nesse tempo, anotamos de qual campanha veio, para saber se o anúncio funciona. Não vai para o Google nem para ninguém.",
              "No próprio navegador, fora dos cookies: que você já viu o aviso de cookies, se prefere a lista ou o mapa, se dispensou o convite para instalar o app e, até fechar a aba, a conversa do assistente, a sua última busca, se deixou para depois a pergunta de onde mora e se fechou o aviso de versão nova do site.",
              "Na tela de entrar: a verificação contra robôs da Cloudflare e o botão do Google (se você usar) podem gravar cookies desses serviços.",
            ]}
          />
          <p className="text-body-sm text-ink-muted">
            Dá para apagar os cookies nas configurações do navegador. Aí você sai da conta e o site esquece suas
            escolhas.
          </p>
        </Secao>

        <Secao titulo="Por quanto tempo">
          <Lista
            itens={[
              "Anúncios saem das buscas no fim do prazo escolhido ao publicar (30 dias, se nada foi escolhido), a não ser que você renove. Vaga “sem prazo” fica até ser encerrada.",
              "Avisos (curtidas e matches) são apagados depois de 90 dias. O registro dos e-mails enviados, depois de 30 dias.",
              "Quando você exclui a conta, apagamos na hora seu perfil, contato, foto, currículo, anúncios, curtidas e matches.",
              "O registro do que a moderação fez (por exemplo, a remoção de um anúncio ou a suspensão de uma conta) fica guardado para a segurança do site, mesmo depois que a conta é excluída.",
            ]}
          />
        </Secao>

        <Secao id="direitos" titulo="Seus direitos (LGPD)">
          <Lista
            itens={[
              <>
                Saber se guardamos dados seus e ver quais são: quase tudo está em{" "}
                <Link href="/perfil" className="underline">
                  Meu perfil
                </Link>
                . Para receber uma cópia de tudo, é só pedir.
              </>,
              "Corrigir dados incompletos ou errados, em Meu perfil, a qualquer hora.",
              "Apagar seus dados: Excluir conta apaga na hora (veja abaixo).",
              "Pedir a anonimização ou o bloqueio de dados desnecessários e a portabilidade (uma cópia para levar a outro serviço).",
              "Saber com quem compartilhamos: a lista está em “Para que usamos”.",
              "Retirar o consentimento do que é opcional: “Esquecer onde moro” e apagar o que você escreveu em “O que você procura?”.",
              <>
                Reclamar na Autoridade Nacional de Proteção de Dados (ANPD), em{" "}
                <a href="https://www.gov.br/anpd" className="underline" target="_blank" rel="noopener noreferrer">
                  gov.br/anpd
                </a>
                .
              </>,
            ]}
          />
          <p>
            O Publike (publike.org) é o responsável pelos seus dados, o controlador, como diz a LGPD. Pedidos e dúvidas
            sobre os seus dados: <CanalDePedidos />. Respondemos em até 15 dias.
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
      </div>
    </Container>
  );
}
