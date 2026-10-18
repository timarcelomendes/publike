import { ArrowLeft, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Conversa } from "@/components/conversa/conversa";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Avatar, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { ETAPAS_CANDIDATO } from "@/lib/constantes";
import { obterConversa } from "@/lib/dados";
import { exigirUsuario } from "@/lib/sessao";

export const metadata: Metadata = { title: "Conversa" };

export default function PaginaConversa({ params }: PageProps<"/painel/conversas/[anuncio]/[outro]">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: PageProps<"/painel/conversas/[anuncio]/[outro]">["params"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const { anuncio, outro } = await params;
  const usuario = await exigirUsuario(`/painel/conversas/${anuncio}/${outro}`);
  const dados = await obterConversa(anuncio, outro);

  if (!dados) {
    return (
      <Vazio
        icone={ShieldAlert}
        titulo="Esta conversa não está disponível"
        acao={<BotaoLink href="/painel/conversas">Ver minhas conversas</BotaoLink>}
      >
        A conversa abre quando dá match e some se o match for desfeito.
      </Vazio>
    );
  }

  const { conversa: c, mensagens } = dados;
  const publiquei = c.papel === "publiquei";
  const etapa = ETAPAS_CANDIDATO[c.etapa];

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Link
        href="/painel/conversas"
        className="inline-flex min-h-11 items-center gap-2 self-start text-label text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Conversas
      </Link>
      <div className="flex items-center gap-3">
        <Avatar nome={c.outro_nome} foto={c.outro_foto} tamanho={48} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-h3">
            <Link href={`/perfil/${c.outro_id}`} className="underline-offset-2 hover:underline">
              {c.outro_nome}
            </Link>
          </h2>
          <p className="truncate text-body-sm text-ink-muted">
            {c.anuncio_tipo === "servico" ? (publiquei ? "Pediu" : "Serviço") : publiquei ? "Curtiu" : "Vaga"}:{" "}
            <Link
              href={publiquei ? `/painel/anuncio/${c.anuncio_id}` : `/anuncio/${c.anuncio_id}`}
              className="text-ink underline underline-offset-2"
            >
              {c.anuncio_titulo}
            </Link>
          </p>
        </div>
        {c.etapa !== "novo" && (
          <Selo
            variante={
              c.etapa === "contratado" || c.etapa === "concluido"
                ? "match"
                : c.etapa === "nao_seguiu"
                  ? "contorno"
                  : "aviso"
            }
          >
            {publiquei ? etapa.nome : etapa.paraQuemCurtiu}
          </Selo>
        )}
      </div>
      <Conversa
        anuncioId={c.anuncio_id}
        perfilId={c.perfil_id}
        euId={usuario.id}
        outroNome={c.outro_nome}
        iniciais={mensagens}
        vaga={c.anuncio_tipo === "vaga"}
      />
      <p className="text-body-sm text-ink-muted">
        Só vocês dois leem esta conversa. Nunca pague para conseguir trabalho e não mande senha nem foto de documento
        por aqui. Algo estranho?{" "}
        <Link
          href={publiquei ? "/sugerir" : `/anuncio/${c.anuncio_id}/denunciar`}
          className="underline underline-offset-2 hover:text-ink"
        >
          {publiquei ? "Avise a equipe" : "Denuncie"}
        </Link>
        .
      </p>
    </div>
  );
}
