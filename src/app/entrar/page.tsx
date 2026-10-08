import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FormEntrar } from "@/components/form-entrar";
import { Aviso, Container, Esqueleto, Simbolo } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { LOGIN_CELULAR, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { caminhoSeguro, primeiro } from "@/lib/formato";
import { REDES_ATIVAS } from "@/lib/login-social";
import { redesParaEntrar } from "@/lib/login-social-servidor";

/** Mensagens para ?erro= (vem de /auth/callback). */
const ERROS: Record<string, string> = {
  link: "O link de acesso venceu ou já foi usado. Peça outro.",
  cancelado: "Você cancelou a entrada. Tente de novo quando quiser.",
  "sem-email": "Essa conta não informou um e-mail confirmado. Entre de outro jeito ou confirme o e-mail nela.",
  social: "Não foi possível entrar com essa conta. Tente de novo ou use outro jeito.",
};

export const metadata: Metadata = {
  title: "Entrar",
  robots: { index: false },
};

export default function Entrar({ searchParams }: PageProps<"/entrar">) {
  return (
    <Container className="flex justify-center py-10">
      <div className="w-full max-w-md rounded-lg border border-line bg-surface-200 p-6 shadow-card sm:p-8">
        <Simbolo altura={44} />
        <h1 className="mt-4 text-h2">Entrar no Publike</h1>
        <p className="mt-1 mb-6 text-body text-ink-muted">{comoEntrar()}</p>
        <Suspense fallback={<Esqueleto className="h-64 w-full" />}>
          <Conteudo searchParams={searchParams} />
        </Suspense>
        <p className="mt-6 text-body-sm text-ink-muted">
          Ao entrar, você concorda com as{" "}
          <Link href="/privacidade" className="underline">
            regras e a política de privacidade
          </Link>
          .
        </p>
      </div>
    </Container>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/entrar">["searchParams"] }) {
  const sp = await searchParams;
  const proximo = caminhoSeguro(primeiro(sp.next), "/");

  if (MODO_DEMO) {
    return (
      <div className="flex flex-col gap-4">
        <Aviso tipo="alerta" titulo="O login funciona depois de conectar o Supabase">
          No modo demonstração não existem contas. Siga o passo a passo do README para criar o banco grátis no
          Supabase; leva uns 15 minutos.
        </Aviso>
        <BotaoLink href="/">Ver os anúncios de exemplo</BotaoLink>
      </div>
    );
  }

  if (await obterUsuario()) redirect(proximo);

  const codigoErro = primeiro(sp.erro);
  const erro = codigoErro
    ? Object.hasOwn(ERROS, codigoErro)
      ? ERROS[codigoErro]
      : "Não foi possível entrar. Tente de novo."
    : undefined;
  const redes = await redesParaEntrar();

  return <FormEntrar proximo={proximo} erroInicial={erro} redes={redes} celular={LOGIN_CELULAR} />;
}

function comoEntrar() {
  // Com redes sociais ou celular, os próprios botões mostram as opções.
  return REDES_ATIVAS.length > 0 || LOGIN_CELULAR ? "É grátis e sem senha." : "É grátis. Entre com seu e-mail, sem senha.";
}
