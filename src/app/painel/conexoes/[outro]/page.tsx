import { Handshake, MessagesSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DesfazerConexao, ResponderConexao } from "@/components/conexoes/acoes-conexao";
import { BotaoLiberarContato, OfertaContatoNoConvite } from "@/components/conexoes/contato-no-convite";
import { linkDoOutro, QuemConexao } from "@/components/conexoes/quem";
import { BotoesContato } from "@/components/contato";
import { LinkVoltar } from "@/components/painel/cabecalho-da-pagina";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SemLinhaDoPainel } from "@/components/painel/sem-linha-do-painel";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { pedirDeNovoEm } from "@/lib/conexoes";
import { dataCurta } from "@/lib/recursos-pagos";
import { caminhoConversa } from "@/lib/conversas";
import { formatarDataCurta } from "@/lib/formato";
import { conexaoCom } from "@/lib/servidor/conexoes";
import { acessoAoContatoNoConvite, contatoNoConviteDe } from "@/lib/servidor/contato-no-convite";
import { exigirUsuario } from "@/lib/sessao";

export const metadata: Metadata = { title: "Conexão", robots: { index: false } };

// A conexão com uma conta: o pedido (para responder ou esperando), ou, aceita, os contatos e o
// caminho para a conversa (uma por pessoa, em Conversas, junto com as vagas em comum). No pedido de
// uma empresa com plano a um talento, o contato e a conversa já vêm no pedido (migração 20270626120000).

export default function PaginaConexao({ params }: PageProps<"/painel/conexoes/[outro]">) {
  return (
    <>
      {/* uma página das Mensagens: no celular, sem a linha do menu do painel */}
      <SemLinhaDoPainel />
      <Suspense fallback={<EsqueletoLista />}>
        <Conteudo params={params} />
      </Suspense>
    </>
  );
}

async function Conteudo({ params }: { params: PageProps<"/painel/conexoes/[outro]">["params"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const { outro } = await params;
  await exigirUsuario(`/painel/conexoes/${outro}`);
  const c = await conexaoCom(outro);

  if (c === undefined) {
    return (
      <Aviso tipo="alerta" titulo="Não deu para abrir a conexão agora">
        Tente de novo em instantes.
      </Aviso>
    );
  }
  if (!c) {
    return (
      <Vazio
        icone={Handshake}
        titulo="Esta conexão não está disponível"
        acao={<BotaoLink href="/painel/conexoes">Ver minhas conexões</BotaoLink>}
      >
        O pedido pode ter sido cancelado ou a conexão desfeita.
      </Vazio>
    );
  }

  const pessoa = c.outro_tipo === "pessoa";
  const primeiroNome = pessoa ? c.outro_nome.split(" ")[0] : c.outro_nome;
  const pedirDeNovo = c.status === "recusada" ? pedirDeNovoEm(c.respondida_em) : null;
  // o meu pedido a um talento, ainda sem o contato: dá para ver agora (com o plano) ou a oferta (sem ele)
  const esperandoTalento = c.status === "pendente" && c.pedi && !c.contato_liberado && pessoa;
  const [acesso, doTalento] = esperandoTalento
    ? await Promise.all([acessoAoContatoNoConvite(), contatoNoConviteDe(c.outro_id)])
    : [null, null];
  const conversarEContatos = (mensagem: string) => (
    <div className="flex flex-wrap gap-2">
      <BotaoLink href={caminhoConversa(c.outro_id)} variante="primario" tamanho="sm">
        <MessagesSquare aria-hidden />
        Conversar
        {c.nao_lidas > 0 && (
          <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-pill bg-like px-1.5 text-caption text-on-like">
            {c.nao_lidas}
            <span className="sr-only"> {c.nao_lidas === 1 ? "mensagem nova" : "mensagens novas"}</span>
          </span>
        )}
      </BotaoLink>
      <BotoesContato whatsapp={c.whatsapp} email={c.email} mensagem={mensagem} />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <LinkVoltar href="/painel/conexoes">Conexões</LinkVoltar>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <QuemConexao c={c} titulo />
        <Selo variante={c.status === "aceita" ? "match" : c.status === "recusada" ? "contorno" : "aviso"}>
          {c.status === "aceita"
            ? "Conectados"
            : c.status === "recusada"
              ? "Não aceito"
              : c.contato_liberado
                ? "Contato liberado"
                : "Pedido de conexão"}
        </Selo>
      </div>

      {c.status === "pendente" && !c.pedi && (
        <section
          aria-label="Pedido de conexão"
          className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5"
        >
          <p className="text-body">
            {c.contato_liberado
              ? `${c.outro_nome} quer se conectar com você e, pelo plano do Publike, já vê o seu WhatsApp e e-mail. Vocês já podem conversar por aqui, e o contato de ${primeiroNome} está embaixo. Aceite para manter a conexão; recusando, a conversa fecha.`
              : `${c.outro_nome} quer se conectar com ${pessoa ? "a sua empresa" : "você"}. Aceitando, aparecem o WhatsApp e o e-mail dos dois e vocês conversam por aqui.`}
          </p>
          {c.mensagem && (
            <blockquote className="rounded-md bg-surface-300 px-3 py-2 text-body whitespace-pre-line">
              {c.mensagem}
            </blockquote>
          )}
          {c.contato_liberado && conversarEContatos(`Olá! Vi o seu pedido de conexão no Publike.`)}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ResponderConexao id={c.id} principal={!c.contato_liberado} />
            <Link href={linkDoOutro(c)} className="text-body-sm underline underline-offset-2 hover:text-ink">
              {pessoa ? "Ver o currículo" : "Ver a página"}
            </Link>
          </div>
          {c.contato_liberado && (
            <p className="text-body-sm text-ink-muted">
              Não quer que empresas com plano vejam o seu contato no pedido?{" "}
              <Link href="/perfil/curriculo#contato-no-convite" className="underline underline-offset-2 hover:text-ink">
                Mude em Quem vê seu currículo
              </Link>
              .
            </p>
          )}
        </section>
      )}

      {c.status === "pendente" && c.pedi && c.contato_liberado && (
        <section
          aria-label="Contato liberado"
          className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5"
        >
          <p className="text-body">
            O contato de {primeiroNome} veio no pedido, pelo seu plano. {primeiroNome} ainda não aceitou a conexão:
            chame no WhatsApp, por e-mail ou pela conversa no Publike.
          </p>
          {c.mensagem && <p className="text-body-sm text-ink-muted">Seu recado: “{c.mensagem}”</p>}
          {conversarEContatos(`Olá, ${primeiroNome}! Vi o seu currículo no Publike.`)}
          <div className="border-t border-line pt-2">
            <DesfazerConexao id={c.id} rotulo="Cancelar pedido" />
          </div>
        </section>
      )}

      {c.status === "pendente" && c.pedi && !c.contato_liberado && (
        <Aviso tipo="info" titulo="Pedido enviado">
          <p>
            Esperando {primeiroNome} responder. Avisamos quando {pessoa ? "aceitar" : "aceitarem"}: aí aparecem os
            contatos e a conversa.
          </p>
          {c.mensagem && <p className="mt-2 text-ink-muted">Seu recado: “{c.mensagem}”</p>}
          {acesso?.liberado && doTalento === "sim" && (
            <div className="mt-3">
              <BotaoLiberarContato conexaoId={c.id} />
            </div>
          )}
          <div className="mt-2">
            <DesfazerConexao id={c.id} rotulo="Cancelar pedido" />
          </div>
        </Aviso>
      )}
      {esperandoTalento && acesso?.disponivel && !acesso.liberado && (doTalento === "sim" || doTalento === "aviso") && (
        <OfertaContatoNoConvite
          primeiroNome={primeiroNome}
          testou={acesso.testou}
          esperando
          aPartirDe={doTalento === "aviso" && acesso.valeEm ? dataCurta(acesso.valeEm) : undefined}
        />
      )}

      {c.status === "recusada" && (
        <Aviso tipo="info" titulo="Pedido não aceito">
          {pedirDeNovo
            ? `Dá para pedir de novo a partir de ${formatarDataCurta(pedirDeNovo)}.`
            : "Dá para pedir de novo depois de 30 dias."}
        </Aviso>
      )}

      {c.status === "aceita" && (
        <>
          <section
            aria-label="Conversa"
            className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5"
          >
            <p className="text-body">
              Converse com {primeiroNome} pelo Publike, sem trocar número. É uma conversa só: se vocês também tiverem
              uma vaga em comum, fica tudo junto.
            </p>
            {c.ultima_texto && (
              <p className="truncate text-body-sm text-ink-muted">
                {c.ultima_minha ? "Você: " : `${primeiroNome}: `}
                {c.ultima_texto}
              </p>
            )}
            <BotaoLink href={caminhoConversa(c.outro_id)} variante="primario" className="self-start">
              <MessagesSquare aria-hidden />
              Conversar
              {c.nao_lidas > 0 && (
                <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-pill bg-like px-1.5 text-caption text-on-like">
                  {c.nao_lidas}
                  <span className="sr-only"> {c.nao_lidas === 1 ? "mensagem nova" : "mensagens novas"}</span>
                </span>
              )}
            </BotaoLink>
          </section>
          <section aria-label="Contatos" className="flex flex-col gap-2">
            <BotoesContato
              whatsapp={c.whatsapp}
              email={c.email}
              mensagem={`Olá, ${primeiroNome}! Nos conectamos pelo Publike.`}
            />
          </section>
          <div className="border-t border-line pt-3">
            <DesfazerConexao
              id={c.id}
              rotulo="Desfazer conexão"
              confirmar={`Desfazer a conexão com ${c.outro_nome}? Os contatos deixam de aparecer e a conversa só continua se vocês tiverem um match numa vaga.`}
            />
          </div>
        </>
      )}
    </div>
  );
}
