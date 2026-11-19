import { CircleCheck, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Aviso, Container, Esqueleto } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { rascunhoValido } from "@/lib/convites";
import { formatarData, primeiro } from "@/lib/formato";
import { valorDaVagaLida } from "@/lib/leitura-de-vagas";
import { criarClientePublico } from "@/lib/supabase/servidor";
import { textoDoHorario } from "@/lib/vaga-extra";

export const metadata: Metadata = {
  title: "Vagas do anúncio",
  robots: { index: false, follow: false },
};

// Publicar pelo WhatsApp (19/11/2026; migração 20270806120000): o anúncio que a empresa mandou tinha mais de uma vaga.
// A resposta do WhatsApp traz este link: cada vaga com o seu "Conferir e publicar" (o publicar já preenchido) e, as já
// publicadas, com o link da vaga. Depois de publicar uma, o site volta para cá.
export default function VagasDoWhatsapp({ params, searchParams }: PageProps<"/publicar/whatsapp/[token]">) {
  return (
    <Container className="max-w-2xl py-8 sm:py-10">
      <Suspense fallback={<Esqueleto className="h-96 w-full rounded-lg" />}>
        {Promise.all([params, searchParams]).then(([{ token }, sp]) => (
          <Conteudo token={token} publicada={primeiro(sp.publicada) ?? null} />
        ))}
      </Suspense>
    </Container>
  );
}

type Lote = {
  empresa: string | null;
  criado_em: string;
  vagas: { token: string; ordem: number; rascunho: unknown; publicada: boolean; anuncio_id: string | null }[];
};

async function Conteudo({ token, publicada }: { token: string; publicada: string | null }) {
  const valido = /^[0-9a-f]{64}$/.test(token);
  const { data } = valido
    ? await criarClientePublico().rpc("lote_do_whatsapp", { p_token: token })
    : { data: null };
  const lote = data as unknown as Lote | null;
  if (!lote) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-h2">Este link venceu</h1>
        <p className="text-body text-ink-muted">
          O link das vagas do WhatsApp vale 30 dias. Mande o anúncio de novo pelo WhatsApp do Publike, ou publique pelo
          site: dá para mandar a foto ou colar o texto lá também.
        </p>
        <BotaoLink href="/publicar" className="self-start">
          Publicar vaga grátis
        </BotaoLink>
      </div>
    );
  }
  const vagas = lote.vagas
    .map((v) => ({ ...v, r: rascunhoValido(v.rascunho) }))
    .filter((v): v is typeof v & { r: NonNullable<typeof v.r> } => v.r !== null);
  const faltam = vagas.filter((v) => !v.publicada).length;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="flex items-center gap-1.5 text-body-sm text-ink-muted">
          <MessageCircle aria-hidden className="size-4" />
          Mandado pelo WhatsApp em {formatarData(lote.criado_em)}
          {lote.empresa ? ` · ${lote.empresa}` : ""}
        </p>
        <h1 className="mt-1 text-h2">As vagas do seu anúncio</h1>
        <p className="mt-2 text-body text-ink-muted">
          {faltam === 0
            ? "Todas já estão no ar. Os candidatos chegam no seu painel."
            : `Confira e publique cada uma: já vêm preenchidas com o anúncio. É grátis, sem plano e sem taxa.`}
        </p>
      </div>
      {publicada && (
        <Aviso tipo="sucesso" titulo="Vaga publicada!">
          {faltam > 0
            ? `${faltam === 1 ? "Falta 1 vaga" : `Faltam ${faltam} vagas`} do anúncio: é só tocar em Conferir e publicar.`
            : "Pronto: todas as vagas do anúncio estão no ar."}{" "}
          <Link href={`/anuncio/${publicada}`} className="underline underline-offset-2">
            Ver a vaga publicada
          </Link>
        </Aviso>
      )}
      <ul className="flex flex-col gap-3">
        {vagas.map((v) => {
          const horario = v.r.horario_detalhe ? textoDoHorario(v.r.horario_detalhe) : null;
          const linhas = [
            valorDaVagaLida(v.r),
            [v.r.bairro, v.r.cidade].filter(Boolean).join(", "),
            horario,
          ].filter(Boolean);
          return (
            <li
              key={v.token}
              className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <h2 className="text-h3">
                  {v.r.titulo}
                  {v.r.quantidade > 1 ? ` (${v.r.quantidade} vagas)` : ""}
                </h2>
                {linhas.length > 0 && <p className="mt-0.5 text-body-sm text-ink-muted">{linhas.join(" · ")}</p>}
              </div>
              {v.publicada ? (
                <span className="flex shrink-0 items-center gap-2 text-body-sm">
                  <CircleCheck aria-hidden className="size-5 text-cerrado" />
                  No ar
                  {v.anuncio_id && (
                    <Link href={`/anuncio/${v.anuncio_id}`} className="underline underline-offset-2">
                      Ver a vaga
                    </Link>
                  )}
                </span>
              ) : (
                <BotaoLink href={`/publicar?whatsapp=${v.token}`} className="shrink-0 self-start sm:self-center">
                  Conferir e publicar
                </BotaoLink>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
