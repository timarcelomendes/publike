import { ArrowLeft, Handshake, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Conversa } from "@/components/conversa/conversa";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Avatar, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { etapaParaMim, linkDaPessoa, vagaDoCurriculo, type VagaDaConversa } from "@/lib/conversas";
import { conversaCom } from "@/lib/servidor/conversas";
import { exigirUsuario } from "@/lib/sessao";

export const metadata: Metadata = { title: "Conversa", robots: { index: false } };

// A conversa com uma pessoa: uma só, com o que veio das vagas em comum e da conexão. O alto mostra
// de onde vem a conversa (cada vaga com a etapa, e a conexão).

export default function PaginaConversa({ params }: PageProps<"/painel/conversas/[outro]">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

/** "Vaga: Repositor" (quem curtiu) ou "Curtiu: Repositor" (quem publicou), com a etapa. */
function DeOnde({ v }: { v: VagaDaConversa }) {
  const publiquei = v.papel === "publiquei";
  const rotulo = v.tipo === "servico" ? (publiquei ? "Pediu" : "Serviço") : publiquei ? "Curtiu" : "Vaga";
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="min-w-0 truncate text-body-sm text-ink-muted">
        {rotulo}:{" "}
        <Link
          href={publiquei ? `/painel/anuncio/${v.anuncio_id}` : `/anuncio/${v.anuncio_id}`}
          className="text-ink underline underline-offset-2"
        >
          {v.titulo}
        </Link>
      </span>
      {v.etapa !== "novo" && (
        <Selo
          variante={
            v.etapa === "contratado" || v.etapa === "concluido"
              ? "match"
              : v.etapa === "nao_seguiu"
                ? "contorno"
                : "aviso"
          }
        >
          {etapaParaMim(v)}
        </Selo>
      )}
    </li>
  );
}

async function Conteudo({ params }: { params: PageProps<"/painel/conversas/[outro]">["params"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const { outro } = await params;
  const usuario = await exigirUsuario(`/painel/conversas/${outro}`);
  const dados = await conversaCom(outro);

  if (dados === undefined) {
    return (
      <Aviso tipo="alerta" titulo="Não deu para abrir a conversa agora">
        Tente de novo em instantes.
      </Aviso>
    );
  }
  if (!dados) {
    return (
      <Vazio
        icone={ShieldAlert}
        titulo="Esta conversa não está disponível"
        acao={<BotaoLink href="/painel/conversas">Ver minhas conversas</BotaoLink>}
      >
        A conversa abre quando dá match ou quando a conexão é aceita, e some se vocês não tiverem mais nenhum dos dois.
      </Vazio>
    );
  }

  const { conversa: c, conversaId, mensagens } = dados;
  // denunciar: o anúncio da outra pessoa (quem curtiu denuncia a vaga); sem ele, avisar a equipe
  const daOutra = c.vagas.find((v) => v.papel === "curti");

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Link
        href="/painel/conversas"
        className="inline-flex min-h-11 items-center gap-2 self-start text-label text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Conversas
      </Link>
      <div className="flex items-start gap-3">
        <Avatar nome={c.outro_nome} foto={c.outro_foto} tamanho={48} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="truncate text-h3">
            <Link href={linkDaPessoa(c)} className="underline-offset-2 hover:underline">
              {c.outro_nome}
            </Link>
          </h2>
          <ul aria-label="De onde vem a conversa" className="flex flex-col gap-1">
            {c.vagas.map((v) => (
              <DeOnde key={v.anuncio_id} v={v} />
            ))}
            {c.conectados && (
              <li className="flex flex-wrap items-center gap-2 text-body-sm text-ink-muted">
                <Handshake aria-hidden className="size-4 shrink-0" />
                <span>Conectados</span>
                <Link
                  href={`/painel/conexoes/${c.outro_id}`}
                  className="text-ink underline underline-offset-2 hover:text-ink"
                >
                  Ver a conexão e os contatos
                </Link>
              </li>
            )}
          </ul>
        </div>
      </div>
      <Conversa
        outroId={c.outro_id}
        conversaId={conversaId}
        euId={usuario.id}
        outroNome={c.outro_nome}
        iniciais={mensagens}
        vagaDoCurriculo={vagaDoCurriculo(c)}
        conexao={c.vagas.length === 0}
      />
      <p className="text-body-sm text-ink-muted">
        Só vocês dois leem esta conversa. Nunca pague para conseguir trabalho e não mande senha nem foto de documento
        por aqui. Algo estranho?{" "}
        <Link
          href={daOutra ? `/anuncio/${daOutra.anuncio_id}/denunciar` : "/sugerir"}
          className="underline underline-offset-2 hover:text-ink"
        >
          {daOutra ? "Denuncie" : "Avise a equipe"}
        </Link>
        .
      </p>
    </div>
  );
}
