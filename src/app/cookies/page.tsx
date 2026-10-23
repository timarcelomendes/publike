import type { Metadata } from "next";
import { ConsentimentoPropaganda } from "@/components/consentimento-propaganda";
import { Lista, PaginaDoDocumento, Secao } from "@/components/documentos-legais";

export const metadata: Metadata = {
  title: "Cookies",
  description: "Os cookies que o Publike usa, para que servem e como ligar ou desligar os de propaganda.",
  alternates: { canonical: "/cookies" },
};

export default function Cookies() {
  return (
    <PaginaDoDocumento
      atual="/cookies"
      titulo="Cookies"
      resumo="O que o Publike guarda no seu navegador e para quê. Os de propaganda só com o seu aceite."
    >
      <Secao id="necessarios" titulo="Os necessários">
        <p>
          O Publike usa os cookies necessários para funcionar. Os de propaganda (do Google Ads) só entram se você tocar
          em “Aceitar” no aviso de cookies ou ligar mais abaixo, nesta página. Não usamos cookies de análise de audiência.
        </p>
        <Lista
          itens={[
            "Sessão (os cookies que começam com sb-): mantêm você conectado. Sem eles, não dá para entrar.",
            "publike_local: lembra a cidade, o bairro e, se você informou, o CEP de casa de quem está sem conta, por até um ano. “Esquecer onde moro” e sair da conta apagam.",
            "publike_perto: quando você toca em “Perto de mim” e o navegador deixa, guarda a sua posição aproximada (cerca de 100 metros, nunca a exata) por 24 horas, para as próximas visitas já contarem dali. Fica só no seu aparelho e não vai para o banco do Publike. Tocar de novo em “Perto de mim” ou escolher contar de casa apaga.",
            "publike_intencao: lembra o que você quer fazer no Publike (procurar trabalho, contratar, oferecer serviço). Sem conta, some quando você fecha o navegador; com conta, dura até um ano.",
            "publike_pediu_link: marca, por uma hora, que este navegador pediu um link de entrar por e-mail. Com ela, o link entra sozinho aqui; em outro aparelho, a página pergunta antes.",
            "publike_origem: quando você chega por um anúncio do Publike (no Google ou no Instagram, por exemplo), guarda só o nome da campanha, como google:servicos, por até 7 dias. Se você criar a conta nesse tempo, anotamos de qual campanha veio, para saber se o anúncio funciona. Não vai para o Google nem para ninguém.",
            "No próprio navegador, fora dos cookies: que você já viu o aviso de cookies e o que escolheu nele, se prefere a lista ou o mapa, se dispensou o convite para instalar o app e, até fechar a aba, a conversa do assistente, a sua última busca, se deixou para depois a pergunta de onde mora e se fechou o aviso de versão nova do site.",
            "Na tela de entrar: a verificação contra robôs da Cloudflare e o botão do Google (se você usar) podem gravar cookies desses serviços.",
            "publike_conversao: dura no máximo 10 minutos e guarda só o nome de um momento, como cadastro, currículo salvo, candidatura ou vaga publicada. Com o aceite, o navegador conta esse momento ao Google Ads; sem o aceite, só apaga.",
          ]}
        />
      </Secao>

      <Secao id="propaganda" titulo="Os de propaganda (só com o seu aceite)">
        <p>
          Com o aceite, o site carrega o código do Google Ads. O Google grava cookies dele para saber se quem clicou num
          anúncio do Publike chegou a criar a conta, salvar o currículo, se candidatar ou publicar uma vaga. O Google
          recebe só o momento e a página, nunca o seu nome, telefone, e-mail ou currículo. Sem o aceite, o código do
          Google não carrega.
        </p>
        <ConsentimentoPropaganda />
      </Secao>

      <Secao id="apagar" titulo="Apagar os cookies">
        <p>
          Dá para apagar os cookies nas configurações do navegador. Aí você sai da conta e o site esquece suas escolhas.
        </p>
      </Secao>
    </PaginaDoDocumento>
  );
}
