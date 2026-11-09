import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { DemoMatch } from "@/components/demo-match";
import { FormEntrar } from "@/components/form-entrar";
import { Aviso, Container, Esqueleto } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { LOGIN_CELULAR, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { caminhoSeguro, primeiro } from "@/lib/formato";
import { contexto, type Contexto } from "@/lib/contexto-de-entrar";
import { REDES_ATIVAS } from "@/lib/login-social";
import { redesParaEntrar } from "@/lib/login-social-servidor";
import { COOKIE_ORIGEM, origemValida } from "@/lib/origem";
import { emailValido } from "@/lib/email-valido";

/** Mensagens para ?erro= (vem de /auth/callback). */
const ERROS: Record<string, string> = {
  link: "O link de acesso venceu ou já foi usado. Peça outro.",
  cancelado: "Você cancelou a entrada. Tente de novo quando quiser.",
  "sem-email": "Essa conta não informou um e-mail confirmado. Entre de outro jeito ou confirme o e-mail nela.",
  social: "Não foi possível entrar com essa conta. Tente de novo ou use outro jeito.",
  suspensa: "Esta conta está suspensa e não pode entrar agora. Se achar que é um engano, responda o e-mail de aviso que você recebeu.",
};

export const metadata: Metadata = {
  title: "Entrar",
  robots: { index: false },
};

export default function Entrar({ searchParams }: PageProps<"/entrar">) {
  return (
    <Container className="grid gap-4 pt-6 pb-12 sm:gap-6 sm:pt-10 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-12 lg:items-center lg:gap-12 lg:py-12">
      <Suspense fallback={<EsqueletoEntrar />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/entrar">["searchParams"] }) {
  const sp = await searchParams;
  const proximo = caminhoSeguro(primeiro(sp.next), "/");
  const ctx = contexto(proximo);

  if (MODO_DEMO) {
    return (
      <Colunas ctx={ctx}>
        <CabecalhoEntrar />
        <div className="flex flex-col gap-4">
          <Aviso tipo="alerta" titulo="O login funciona depois de conectar o Supabase">
            No modo demonstração não existem contas. Siga o passo a passo do README para criar o banco grátis no
            Supabase; leva uns 15 minutos.
          </Aviso>
          <BotaoLink href="/">Ver os anúncios de exemplo</BotaoLink>
        </div>
      </Colunas>
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
  // chegou por uma campanha: ela vai no link de entrar (quem abre o e-mail em outro navegador não perde)
  const origem = (await cookies()).get(COOKIE_ORIGEM)?.value;
  // veio do link de acesso (/acesso/<token>): o e-mail já ficou ligado à conta
  const emailPedido = primeiro(sp.email)?.trim().slice(0, 200);
  const emailInicial = emailValido(emailPedido) ? emailPedido : undefined;

  return (
    <Colunas ctx={ctx}>
      {primeiro(sp.acesso) === "1" && emailInicial && (
        <Aviso tipo="sucesso" titulo="Pronto: o e-mail ficou ligado à conta" className="mb-6">
          Agora toque em receber o link: ele chega em {emailInicial} e entra na conta da empresa.
        </Aviso>
      )}
      <FormEntrar
        proximo={proximo}
        origem={origemValida(origem) ? origem : undefined}
        erroInicial={erro}
        redes={redes}
        celular={LOGIN_CELULAR}
        cabecalho={<CabecalhoEntrar />}
        emailInicial={emailInicial}
      />
    </Colunas>
  );
}

/** Computador: o porquê e o exemplo à esquerda, o cartão de entrar à direita. Celular: só o necessário. */
function Colunas({ ctx, children }: { ctx: Contexto; children: ReactNode }) {
  return (
    <>
      <div className="lg:col-span-6 lg:col-start-1">
        <h1 className="text-h2 sm:text-h1 lg:text-display">{ctx.titulo}</h1>
        <p className={`mt-2 max-w-xl text-body text-ink-muted sm:text-body-lg lg:mt-4 ${ctx.padrao ? "hidden sm:block" : ""}`}>
          {ctx.texto}
        </p>
        <div className="mt-12 hidden lg:block">
          <DemoMatch lado={ctx.demo ?? (ctx.publica ? "quem-publica" : "quem-faz")} />
        </div>
      </div>

      <section
        aria-label="Entrar ou criar conta"
        className="lg:col-span-5 lg:col-start-8 lg:rounded-lg lg:border lg:border-line lg:bg-surface-200 lg:p-8 lg:shadow-card"
      >
        {children}
        <p className="mt-6 text-body-sm text-ink-muted">
          Ao entrar, você aceita as{" "}
          <Link href="/regras" className="underline underline-offset-2 hover:text-ink">
            regras
          </Link>{" "}
          e a{" "}
          <Link href="/privacidade" className="underline underline-offset-2 hover:text-ink">
            política de privacidade
          </Link>
          .
        </p>
      </section>
    </>
  );
}

/** Título do cartão. Some quando o e-mail já foi enviado (quem decide é o FormEntrar). */
function CabecalhoEntrar() {
  return (
    <div className="mb-6">
      <h2 className="sr-only text-h3 lg:not-sr-only">Entre ou crie sua conta</h2>
      <p className="text-body text-ink-muted lg:mt-1">{comoEntrar()}</p>
    </div>
  );
}

function EsqueletoEntrar() {
  return (
    <>
      <div className="lg:col-span-6">
        <Esqueleto className="h-10 w-3/4 lg:h-16" />
        <Esqueleto className="mt-4 h-6 w-2/3" />
      </div>
      <div className="lg:col-span-5 lg:col-start-8">
        <Esqueleto className="h-96 w-full rounded-lg" />
      </div>
    </>
  );
}

function comoEntrar() {
  // Com redes sociais ou celular, os próprios botões mostram as opções.
  return REDES_ATIVAS.length > 0 || LOGIN_CELULAR
    ? "Grátis. Entre sem senha ou com a senha que você criou. Na primeira vez, a conta é criada na hora."
    : "Grátis: você recebe um link no e-mail, ou entra com a senha que criou. Na primeira vez, a conta é criada na hora.";
}
