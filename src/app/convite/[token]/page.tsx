import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AvisoConvite } from "@/components/aviso-convite";
import { Container, Esqueleto } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { obterUsuario } from "@/lib/dados";
import { formatarValor } from "@/lib/formato";
import { conviteDoLink } from "@/lib/servidor/convite-do-link";
import { PRACA_PADRAO } from "@/lib/pracas";

export const metadata: Metadata = { title: "Sua vitrine no Publike", robots: { index: false, follow: false } };

// O link do convite ao prestador de serviço: mostra a vitrine que já veio pronta do anúncio dele e
// leva para entrar (pelo e-mail) e salvar em "Meus serviços". Salvar por lá é o aceite.
export default function ConviteDoPrestador({ params }: PageProps<"/convite/[token]">) {
  return (
    <Container className="max-w-xl py-10">
      <Suspense fallback={<Esqueleto className="h-96 w-full rounded-lg" />}>
        {params.then(({ token }) => (
          <Conteudo token={token} />
        ))}
      </Suspense>
    </Container>
  );
}

async function Conteudo({ token }: { token: string }) {
  const convite = await conviteDoLink(token);
  if (!convite) notFound();
  // convite de empresa: a vaga se publica em /publicar
  if (convite.tipo !== "prestador") redirect(`/publicar?convite=${token}`);
  const destino = `/painel/servicos?convite=${token}`;
  // já entrou: direto para a vitrine pronta
  if (await obterUsuario()) redirect(destino);

  const r = convite.rascunho;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h2">Olá, {convite.nome}!</h1>
        <p className="mt-2 text-body text-ink-muted">
          No Publike, quem precisa do seu serviço perto de casa te encontra e chama. É grátis: sem plano, sem taxa e sem
          comissão. Seu WhatsApp só aparece para quem você aceitar.
        </p>
      </div>
      <AvisoConvite token={token} nome={convite.nome}>
        {r
          ? "Sua vitrine já veio pronta com o seu anúncio. Entre com o e-mail (sem senha), confira e toque em Salvar."
          : "Entre com o e-mail (sem senha), escreva o seu serviço e toque em Salvar."}
      </AvisoConvite>
      {r && (
        <section
          aria-label="Prévia do serviço"
          className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-4 shadow-card"
        >
          <p className="text-label text-ink-muted">Assim seu serviço aparece na busca</p>
          <h2 className="text-h3">{r.titulo}</h2>
          <p className="text-label">{formatarValor(r.salario, r.unidade || null, null, true)}</p>
          {r.descricao && <p className="text-body-sm text-ink-muted">{r.descricao}</p>}
          {r.bairro && (
            <p className="flex items-center gap-1.5 text-body-sm text-ink-muted">
              <MapPin aria-hidden className="size-4" />
              {r.bairro}, {r.cidade || PRACA_PADRAO.cidade}
            </p>
          )}
        </section>
      )}
      <BotaoLink href={`/entrar?next=${encodeURIComponent(destino)}`} variante="primario" className="self-start">
        Entrar e conferir minha vitrine
      </BotaoLink>
    </div>
  );
}
