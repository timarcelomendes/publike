import { ArrowLeft, BadgeCheck, Heart } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BotoesContato } from "@/components/contato";
import { AcoesInteressado } from "@/components/painel/acoes";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Avatar, Selo, Vazio } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { STATUS_ANUNCIO } from "@/lib/constantes";
import { listarInteressados, obterAnuncio } from "@/lib/dados";
import { formatarLugar, formatarMesAno, rotuloConta, tempoRelativo } from "@/lib/formato";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { StatusAnuncio } from "@/lib/tipos";

export default function Interessados({ params }: PageProps<"/painel/anuncio/[id]">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: PageProps<"/painel/anuncio/[id]">["params"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const { id } = await params;
  const usuario = await exigirUsuario(`/painel/anuncio/${id}`);
  const anuncio = await obterAnuncio(id);
  if (!anuncio || anuncio.autor_id !== usuario.id) notFound();
  const interessados = await listarInteressados(id);
  const agora = await agoraDaRequisicao();
  const status = anuncio.status as StatusAnuncio;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/painel" className="inline-flex min-h-11 items-center gap-2 text-label text-ink-muted hover:text-ink">
          <ArrowLeft aria-hidden className="size-4" />
          Meus anúncios
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Selo variante={status === "ativo" ? "match" : "contorno"}>{STATUS_ANUNCIO[status]?.nome ?? status}</Selo>
        </div>
        <h2 className="mt-2 text-h2">{anuncio.titulo}</h2>
        <p className="mt-1 text-body-sm text-ink-muted">
          <Link href={`/anuncio/${anuncio.id}`} className="underline">
            Ver anúncio
          </Link>{" "}
          ·{" "}
          <Link href={`/painel/anuncio/${anuncio.id}/editar`} className="underline">
            Editar
          </Link>
        </p>
      </div>

      {(status === "em_analise" || status === "removido") && (
        <Aviso tipo="alerta" titulo="Este anúncio está com a moderação">
          Enquanto isso, não dá para curtir de volta e os contatos ficam escondidos.
        </Aviso>
      )}

      {interessados.length === 0 ? (
        <Vazio icone={Heart} titulo="Ninguém curtiu ainda">
          Quando alguém curtir, você recebe um aviso e a pessoa aparece aqui. Compartilhar o anúncio no WhatsApp ajuda a
          chegar em mais gente.
        </Vazio>
      ) : (
        <>
          <p className="text-body text-ink-muted">
            Curta de volta quem combina com o que você precisa. Na hora do match, o WhatsApp dos dois aparece.
          </p>
          <ul className="flex flex-col gap-4">
            {interessados.map((p) => {
              const primeiroNome = p.nome.split(" ")[0];
              return (
                <li
                  key={p.perfil_id}
                  className={`flex flex-col gap-3 rounded-lg border bg-surface-200 p-4 shadow-card sm:p-5 ${
                    p.status === "match" ? "border-cerrado" : "border-line"
                  } ${p.status === "dispensada" ? "opacity-70" : ""}`}
                >
                  <div className="flex gap-3">
                    <Avatar nome={p.nome} foto={p.foto} tamanho={56} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 font-display text-h3">
                        <Link href={`/perfil/${p.perfil_id}`} className="truncate underline-offset-2 hover:underline">
                          {p.nome}
                        </Link>
                        {p.verificado && <BadgeCheck aria-label="Perfil verificado" className="size-4 shrink-0 text-cerrado-text" />}
                      </p>
                      <p className="text-body-sm text-ink-muted">
                        {rotuloConta(p.tipo)} · {formatarLugar(p.bairro, p.cidade)} · no Publike desde{" "}
                        {formatarMesAno(p.membro_desde)}
                      </p>
                      <p className="text-body-sm text-ink-muted">Curtiu {tempoRelativo(p.curtido_em, agora)}</p>
                    </div>
                    {p.status === "match" && <Selo variante="match">Deu match</Selo>}
                    {p.status === "dispensada" && <Selo variante="contorno">Dispensado</Selo>}
                  </div>
                  {p.mensagem && <blockquote className="rounded-md bg-surface-300 p-3 text-body-sm">“{p.mensagem}”</blockquote>}
                  {p.servicos.length > 0 && (
                    <div className="flex flex-wrap gap-1.5" aria-label="O que faz">
                      {p.servicos.map((s) => (
                        <Selo key={s} variante="contorno">
                          {s}
                        </Selo>
                      ))}
                    </div>
                  )}
                  {p.sobre && <p className="line-clamp-3 text-body-sm text-ink-muted">{p.sobre}</p>}
                  <div className="border-t border-line pt-3">
                    {p.status === "match" ? (
                      <BotoesContato
                        whatsapp={p.whatsapp}
                        email={p.email}
                        mensagem={`Olá, ${primeiroNome}! Vi que você curtiu “${anuncio.titulo}” no Publike. Vamos conversar?`}
                      />
                    ) : (
                      <AcoesInteressado anuncioId={anuncio.id} perfilId={p.perfil_id} status={p.status} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
