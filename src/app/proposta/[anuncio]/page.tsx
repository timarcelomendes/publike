import { CircleCheck, FileSignature } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { ResponderProposta } from "@/components/proposta/responder-proposta";
import { ResumoDaProposta } from "@/components/proposta/proposta-na-ficha";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Container, Selo } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { caminhoConversa } from "@/lib/conversas";
import { dataEHora, SITUACOES_PROPOSTA } from "@/lib/proposta";
import { minhaProposta } from "@/lib/servidor/proposta";
import { exigirUsuario } from "@/lib/sessao";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Proposta de trabalho", robots: { index: false } };

// A proposta para o candidato (migração 20270110120000): ler, aceitar ou recusar; depois do aceite, o primeiro dia.

export default function PaginaDaProposta({ params }: PageProps<"/proposta/[anuncio]">) {
  return (
    <Container className="flex max-w-2xl flex-col gap-6 py-8">
      <Suspense fallback={<EsqueletoLista />}>
        {params.then(({ anuncio }) => (
          <Conteudo anuncio={anuncio} />
        ))}
      </Suspense>
    </Container>
  );
}

async function Conteudo({ anuncio }: { anuncio: string }) {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario(`/proposta/${anuncio}`);
  const p = UUID.test(anuncio) ? await minhaProposta(anuncio) : null;
  if (p === undefined) {
    return (
      <Aviso tipo="alerta" titulo="Ainda não disponível">
        Tente de novo em instantes.
      </Aviso>
    );
  }
  if (!p) {
    return (
      <Aviso tipo="info" titulo="Nenhuma proposta aqui">
        Quando uma empresa mandar uma proposta, ela aparece nesta página e você recebe o aviso.{" "}
        <Link href="/painel/curtidas" className="underline underline-offset-2">
          Ver as suas candidaturas
        </Link>
      </Aviso>
    );
  }
  const s = SITUACOES_PROPOSTA[p.situacao];
  return (
    <>
      <div className="flex flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 text-body-sm text-ink-muted">
          <FileSignature aria-hidden className="size-4" />
          Proposta de {p.empresa}
          <Selo variante="novo">Novo</Selo>
        </p>
        <h1 className="text-h1 break-words">{p.vaga}</h1>
      </div>
      {p.situacao === "aceita" && (
        <div className="flex items-start gap-3 rounded-lg border border-cerrado bg-cerrado/5 p-4">
          <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-cerrado-text" />
          <p className="text-body">
            Você aceitou em {dataEHora(p.respondida_em ?? p.enviada_em)}. Parabéns! Abaixo está o que levar e onde se
            apresentar no primeiro dia.
          </p>
        </div>
      )}
      {p.situacao === "recusada" && (
        <p className="text-body text-ink-muted">
          Você recusou esta proposta em {dataEHora(p.respondida_em ?? p.enviada_em)}.
        </p>
      )}
      <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-5 text-body">
        {p.situacao === "enviada" && <Selo variante={s.tom}>Espera a sua resposta</Selo>}
        <ResumoDaProposta p={p} />
      </section>
      {p.situacao === "enviada" && <ResponderProposta anuncioId={anuncio} empresa={p.empresa} />}
      <div className="flex flex-wrap gap-2">
        <BotaoLink href={caminhoConversa(p.empresa_id)} tamanho="sm" variante="secundario">
          Conversar com {p.empresa}
        </BotaoLink>
        <BotaoLink href={`/anuncio/${anuncio}`} tamanho="sm" variante="fantasma">
          Ver a vaga
        </BotaoLink>
      </div>
    </>
  );
}
