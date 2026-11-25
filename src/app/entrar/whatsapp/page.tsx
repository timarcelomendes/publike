import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Container, Esqueleto } from "@/components/ui/basicos";
import { obterUsuario } from "@/lib/dados";
import { naContaDoNumero, numeroEscondido, verLinkDeEntrar } from "@/lib/servidor/entrar-pelo-whatsapp";
import { linkDoEntrar } from "@/lib/whatsapp-oficial";

export const metadata: Metadata = { title: "Entrar com o WhatsApp", robots: { index: false, follow: false } };

// O link de entrar com um toque, mandado na conversa do WhatsApp (migração 20270920120000) e no botão dos avisos
// (migração 20271002120000). A página não gasta o link (a Meta abre os links para a prévia): só o botão gasta. Vale uma
// vez, só para aquele número: 24 horas o da conversa, 7 dias o do aviso.
//
// Quem já está dentro, na conta do número, vai direto ao destino, valendo ou não. O link usado ou vencido pede outro
// pela conversa: "entrar" no WhatsApp do Publike manda um novo na hora, para o mesmo lugar (a mensagem da pessoa abre
// as 24 horas da Meta, que o código pelo site precisa).

export default function EntrarPeloWhatsapp({ searchParams }: PageProps<"/entrar/whatsapp">) {
  return (
    <Container className="flex max-w-md flex-col gap-6 py-10">
      <Suspense fallback={<Esqueleto className="h-72 w-full rounded-lg" />}>
        {searchParams.then((sp) => (
          <Conteudo token={typeof sp.t === "string" ? sp.t : ""} erro={typeof sp.erro === "string"} />
        ))}
      </Suspense>
    </Container>
  );
}

async function Conteudo({ token, erro }: { token: string; erro: boolean }) {
  const visto = await verLinkDeEntrar(token);
  if (visto && naContaDoNumero((await obterUsuario())?.telefone, visto.link.numero)) redirect(visto.link.destino);
  if (!visto?.vale || erro) return <LinkVencido destino={visto?.link.destino ?? null} />;
  return (
    <form
      method="post"
      action="/api/auth/entrar-whatsapp"
      className="flex flex-col gap-5 rounded-lg border border-line bg-surface-100 p-6 shadow-card"
    >
      <input type="hidden" name="t" value={token} />
      <div className="flex flex-col gap-2">
        <h1 className="text-h2">Entrar no Publike</h1>
        <p className="text-body text-ink-muted">
          Você vai entrar com o WhatsApp <strong className="text-ink">{numeroEscondido(visto.link.numero)}</strong>, sem
          digitar código. Se ainda não tem conta, ela é criada com este número.
        </p>
      </div>
      <button
        type="submit"
        className="inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-pill bg-cerrado px-4 text-label text-white transition-colors hover:bg-cerrado/90"
      >
        <MessageCircle aria-hidden className="size-5" />
        Entrar com este WhatsApp
      </button>
      <p className="text-center text-caption text-ink-muted">
        Ao continuar, você aceita as{" "}
        <Link href="/regras" className="underline underline-offset-2 hover:text-ink">
          regras
        </Link>{" "}
        e a{" "}
        <Link href="/privacidade" className="underline underline-offset-2 hover:text-ink">
          política de privacidade
        </Link>
        . O link vale uma vez e só para este número.
      </p>
    </form>
  );
}

/** O link usado ou vencido: outro pela conversa (o principal) ou o código, que leva ao mesmo destino. */
function LinkVencido({ destino }: { destino: string | null }) {
  const peloCodigo = destino ? `/entrar?de=whatsapp&next=${encodeURIComponent(destino)}` : "/entrar?de=whatsapp";
  return (
    <div className="flex flex-col gap-5 rounded-lg border border-line bg-surface-100 p-6 shadow-card">
      <div className="flex flex-col gap-2">
        <h1 className="text-h2">Este link já foi usado ou venceu</h1>
        <p className="text-body text-ink-muted">
          Por segurança, cada link de entrar vale uma vez só e tem prazo. Peça outro na conversa do Publike: é só
          enviar <strong className="text-ink">entrar</strong>, e o link novo chega na hora, a qualquer momento.
        </p>
      </div>
      <a
        href={linkDoEntrar()}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-pill bg-cerrado px-4 text-label text-white transition-colors hover:bg-cerrado/90"
      >
        <MessageCircle aria-hidden className="size-5" />
        Pedir um link novo no WhatsApp
      </a>
      <Link
        href={peloCodigo}
        className="text-center text-label text-ink-muted underline underline-offset-2 hover:text-ink"
      >
        Entrar com o código
      </Link>
    </div>
  );
}
