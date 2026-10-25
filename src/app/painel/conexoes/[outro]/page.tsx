import { ArrowLeft, Handshake, MessagesSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DesfazerConexao, ResponderConexao } from "@/components/conexoes/acoes-conexao";
import { linkDoOutro, QuemConexao } from "@/components/conexoes/quem";
import { BotoesContato } from "@/components/contato";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SemLinhaDoPainel } from "@/components/painel/sem-linha-do-painel";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { pedirDeNovoEm } from "@/lib/conexoes";
import { caminhoConversa } from "@/lib/conversas";
import { formatarDataCurta } from "@/lib/formato";
import { conexaoCom } from "@/lib/servidor/conexoes";
import { exigirUsuario } from "@/lib/sessao";

export const metadata: Metadata = { title: "Conexão", robots: { index: false } };

// A conexão com uma conta: o pedido (para responder ou esperando), ou, aceita, os contatos e o
// caminho para a conversa (uma por pessoa, em Conversas, junto com as vagas em comum).

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

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Link
        href="/painel/conexoes"
        className="inline-flex min-h-11 items-center gap-2 self-start text-label text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Conexões
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <QuemConexao c={c} titulo />
        <Selo variante={c.status === "aceita" ? "match" : c.status === "recusada" ? "contorno" : "aviso"}>
          {c.status === "aceita" ? "Conectados" : c.status === "recusada" ? "Não aceito" : "Pedido de conexão"}
        </Selo>
      </div>

      {c.status === "pendente" && !c.pedi && (
        <section
          aria-label="Pedido de conexão"
          className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5"
        >
          <p className="text-body">
            {c.outro_nome} quer se conectar com {pessoa ? "a sua empresa" : "você"}. Aceitando, aparecem o WhatsApp e o
            e-mail dos dois e vocês conversam por aqui.
          </p>
          {c.mensagem && (
            <blockquote className="rounded-md bg-surface-300 px-3 py-2 text-body whitespace-pre-line">
              {c.mensagem}
            </blockquote>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ResponderConexao id={c.id} />
            <Link href={linkDoOutro(c)} className="text-body-sm underline underline-offset-2 hover:text-ink">
              {pessoa ? "Ver o currículo" : "Ver a página"}
            </Link>
          </div>
        </section>
      )}

      {c.status === "pendente" && c.pedi && (
        <Aviso tipo="info" titulo="Pedido enviado">
          <p>
            Esperando {primeiroNome} responder. Avisamos quando {pessoa ? "aceitar" : "aceitarem"}: aí aparecem os
            contatos e a conversa.
          </p>
          {c.mensagem && <p className="mt-2 text-ink-muted">Seu recado: “{c.mensagem}”</p>}
          <div className="mt-2">
            <DesfazerConexao id={c.id} rotulo="Cancelar pedido" />
          </div>
        </Aviso>
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
