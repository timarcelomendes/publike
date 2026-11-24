import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Container, Esqueleto } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { numeroEscondido, TOKEN_ENTRADA } from "@/lib/servidor/entrar-pelo-whatsapp";
import { acessoFila } from "@/lib/servidor/filas";

export const metadata: Metadata = { title: "Entrar com o WhatsApp", robots: { index: false, follow: false } };

// O link de entrar com um toque, mandado na conversa do WhatsApp (migração 20270920120000). A página não gasta o link
// (a Meta abre os links para a prévia): só o botão gasta. Vale 24 horas, uma vez, só para aquele número.

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
  const acesso = acessoFila();
  let numero: string | null = null;
  if (!MODO_DEMO && acesso && TOKEN_ENTRADA.test(token)) {
    const { data } = await acesso.cliente.rpc("servidor_ver_entrada_whatsapp", { p_chave: acesso.chave, p_token: token });
    const v = (data ?? null) as { numero?: string } | null;
    numero = v?.numero ?? null;
  }
  if (!numero || erro) {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-100 p-6 shadow-card">
        <h1 className="text-h2">Este link já foi usado ou venceu</h1>
        <p className="text-body text-ink-muted">
          O link de entrar vale uma vez, por 24 horas. Para receber outro, escreva <strong>entrar</strong> na conversa
          do Publike no WhatsApp. Ou entre com o código, que chega no seu WhatsApp.
        </p>
        <Link
          href="/entrar?de=whatsapp"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-pill bg-cerrado px-4 text-label text-white hover:bg-cerrado/90"
        >
          <MessageCircle aria-hidden className="size-5" />
          Entrar com o código no WhatsApp
        </Link>
      </div>
    );
  }
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
          Você vai entrar com o WhatsApp <strong className="text-ink">{numeroEscondido(numero)}</strong>, sem digitar
          código. Se ainda não tem conta, ela é criada com este número.
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
