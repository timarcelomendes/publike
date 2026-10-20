import { ArrowLeft, Mailbox, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChamarCandidato, ListaDeConvites } from "@/components/convite-candidato/chamar-candidato";
import { LinhaDoCliente } from "@/components/painel/linha-do-cliente";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO, SITE_URL } from "@/lib/config";
import { DIAS_DO_CONVITE, situacaoNaLista } from "@/lib/convite-candidato";
import { ajudaDaIADisponivel, obterAnuncio } from "@/lib/dados";
import { plural } from "@/lib/formato";
import { convitesDaVaga } from "@/lib/servidor/convites-candidato";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Chamar candidato de fora" };

// Candidato de fora: quem publicou a vaga recebeu um currículo pelo WhatsApp, e-mail ou em mãos
// e chama a pessoa pelo link. Ela entra com o celular, confere o currículo e aceita.

export default function Convidar({ params }: PageProps<"/painel/anuncio/[id]/convidar">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      {params.then(({ id }) => (
        <Conteudo id={id} />
      ))}
    </Suspense>
  );
}

async function Conteudo({ id }: { id: string }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const usuario = await exigirUsuario(`/painel/anuncio/${id}/convidar`);
  const anuncio = await obterAnuncio(id);
  if (!anuncio || anuncio.autor_id !== usuario.id || anuncio.tipo !== "vaga") notFound();
  const agora = await agoraDaRequisicao();
  const [convites, comIA] = await Promise.all([convitesDaVaga(id), ajudaDaIADisponivel().catch(() => false)]);
  const noAr = anuncio.status === "ativo" && new Date(anuncio.expira_em).getTime() > agora && !anuncio.preenchida_em;
  const esperando = convites.filter((c) => situacaoNaLista(c, agora) === "valido").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/painel/anuncio/${id}/quadro`}
          className="inline-flex min-h-11 items-center gap-2 text-label text-ink-muted hover:text-ink"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Quadro de candidatos
        </Link>
        <h2 className="mt-1 text-h2">Chamar candidato de fora</h2>
        <p className="mt-1 text-body text-ink-muted">{anuncio.titulo}</p>
        {anuncio.autor_tipo === "agencia" && (
          <LinhaDoCliente anuncioId={anuncio.id} confidencial={anuncio.contratante_confidencial} />
        )}
      </div>

      <section
        aria-labelledby="chamar"
        className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-5 sm:p-6"
      >
        <div>
          <h3 id="chamar" className="flex items-center gap-2 text-h3">
            <UserPlus aria-hidden className="size-5 text-ink-muted" />
            Recebeu um currículo por fora?
          </h3>
          <p className="mt-1 text-body-sm text-ink-muted">
            Pelo WhatsApp, por e-mail ou em mãos: chame a pessoa para esta vaga. Ela recebe o link, entra com o celular,
            confere o currículo{comIA ? " que o Publike montou" : ""} e aceita. Só entra no quadro quem aceitar. O link
            vale {DIAS_DO_CONVITE} dias.
          </p>
        </div>
        {noAr ? (
          <ChamarCandidato
            anuncioId={id}
            usuarioId={usuario.id}
            site={SITE_URL}
            vaga={anuncio.titulo}
            quem={anuncio.autor_nome}
            comIA={comIA}
          />
        ) : (
          <Aviso tipo="alerta" titulo="A vaga não está no ar">
            Para chamar candidatos, ponha a vaga no ar de novo.{" "}
            <Link href={`/painel/anuncio/${id}`} className="text-label underline">
              Ver a vaga
            </Link>
          </Aviso>
        )}
      </section>

      <section aria-labelledby="convites" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="convites" className="text-h3">
            Convites desta vaga
          </h3>
          {esperando > 0 && (
            <p className="text-body-sm text-ink-muted">
              {plural(esperando, "esperando resposta", "esperando resposta")}
            </p>
          )}
        </div>
        {convites.length === 0 ? (
          <p className="flex items-center gap-2 text-body-sm text-ink-muted">
            <Mailbox aria-hidden className="size-4 shrink-0" />
            Ninguém chamado ainda. Os convites aparecem aqui, com a resposta de cada pessoa.
          </p>
        ) : (
          <ListaDeConvites
            anuncioId={id}
            convites={convites}
            site={SITE_URL}
            vaga={anuncio.titulo}
            quem={anuncio.autor_nome}
            agora={agora}
          />
        )}
        {convites.some((c) => c.aceito_em) && (
          <div>
            <BotaoLink href={`/painel/anuncio/${id}/quadro`} tamanho="sm" variante="fantasma">
              Ver no quadro quem aceitou
            </BotaoLink>
          </div>
        )}
      </section>
    </div>
  );
}
