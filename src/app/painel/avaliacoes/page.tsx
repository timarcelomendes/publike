import { ArrowLeft, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Estrelas, NotaDoProfissional } from "@/components/avaliacoes";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { ResponderAvaliacao } from "@/components/painel/responder-avaliacao";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Avatar, Selo, Vazio } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { listarAvaliacoesRecebidas, obterNotaDoProfissional } from "@/lib/dados";
import { tempoRelativo } from "@/lib/formato";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Avaliações recebidas" };

export default function AvaliacoesRecebidas() {
  return (
    <div className="max-w-3xl">
      <Link
        href="/painel/servicos"
        className="inline-flex min-h-11 items-center gap-2 text-label text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Meus serviços
      </Link>
      <h2 className="mt-1 text-h2">Avaliações recebidas</h2>
      <p className="mt-2 mb-6 text-body text-ink-muted">
        Quem contratou você pelo Publike pode avaliar depois do match. Você pode responder cada avaliação uma vez; a
        resposta aparece junto, no seu perfil.
      </p>
      <Suspense fallback={<EsqueletoLista />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

const SITUACAO_RESPOSTA: Record<string, string> = {
  pendente: "Na revisão automática",
  retida: "Não publicada (com a equipe)",
  removida: "Removida pela equipe",
};

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  const usuario = await exigirUsuario("/painel/avaliacoes");
  const [avaliacoes, nota, agora] = await Promise.all([
    listarAvaliacoesRecebidas(),
    obterNotaDoProfissional(usuario.id),
    agoraDaRequisicao(),
  ]);

  if (avaliacoes.length === 0) {
    return (
      <Vazio icone={Star} titulo="Nenhuma avaliação ainda">
        Quando alguém que contratou você avaliar, ela aparece aqui e você recebe um aviso.
      </Vazio>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p>
        <NotaDoProfissional media={nota.media} total={nota.total} />
        {nota.total < 3 && <span className="text-body-sm text-ink-muted"> · a nota média aparece a partir de 3</span>}
      </p>
      <ul className="flex flex-col gap-4">
        {avaliacoes.map((a) => (
          <li
            key={a.id}
            className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5"
          >
            <div className="flex gap-3">
              <Avatar nome={a.autor_nome} foto={a.autor_foto} tamanho={44} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-label">{a.autor_nome}</span>
                  <Estrelas nota={a.nota} tamanho={14} />
                  <span className="text-body-sm text-ink-muted">{tempoRelativo(a.criado_em, agora)}</span>
                </p>
                <p className="text-body-sm text-ink-muted">{a.titulo_servico}</p>
              </div>
              {a.denunciada && <Selo variante="contorno">Com a equipe</Selo>}
            </div>
            {a.comentario && <p className="text-body whitespace-pre-line">{a.comentario}</p>}
            {a.resposta && (
              <div className="rounded-md bg-surface-300 p-3 text-body-sm">
                <p className="flex flex-wrap items-center gap-2 text-label">
                  Sua resposta
                  {a.resposta_status && a.resposta_status !== "publicada" && (
                    <Selo variante="contorno">{SITUACAO_RESPOSTA[a.resposta_status] ?? a.resposta_status}</Selo>
                  )}
                </p>
                <p className="mt-1 whitespace-pre-line">{a.resposta}</p>
              </div>
            )}
            {(!a.resposta || !a.denunciada) && (
              <div className="border-t border-line pt-3">
                <ResponderAvaliacao id={a.id} podeResponder={!a.resposta} denunciada={a.denunciada} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
