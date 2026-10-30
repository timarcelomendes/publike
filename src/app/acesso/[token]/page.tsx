import type { Metadata } from "next";
import { Suspense } from "react";
import { FormAcesso } from "@/components/form-acesso";
import { Aviso, Container, Esqueleto } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { criarClientePublico } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Acesso à sua conta", robots: { index: false, follow: false } };

// O link de acesso mandado pelo WhatsApp: a empresa coloca o e-mail e entra com ele.
export default function Acesso({ params }: PageProps<"/acesso/[token]">) {
  return (
    <Container className="max-w-xl py-10">
      <Suspense fallback={<Esqueleto className="h-80 w-full rounded-lg" />}>
        {params.then(({ token }) => (
          <Conteudo token={token} />
        ))}
      </Suspense>
    </Container>
  );
}

async function Conteudo({ token }: { token: string }) {
  const { data } = /^[0-9a-f]{64}$/.test(token)
    ? await criarClientePublico().rpc("acesso_do_link", { p_token: token })
    : { data: null };
  const a = data?.[0];
  if (!a || a.situacao !== "valido") {
    const textos: Record<string, { titulo: string; texto: string }> = {
      usado: {
        titulo: "Este link já foi usado",
        texto: "Entre com o e-mail que você colocou: o link de entrar chega nele.",
      },
      ja_tem_email: {
        titulo: "Sua conta já tem e-mail",
        texto: "Entre com o e-mail da conta: o link de entrar chega nele.",
      },
      expirado: { titulo: "Este link venceu", texto: "Peça um novo para quem mandou, pelo WhatsApp." },
    };
    const t = (a && textos[a.situacao]) ?? {
      titulo: "Este link não vale",
      texto: "Confira se copiou o link inteiro ou peça um novo para quem mandou.",
    };
    return (
      <div className="flex flex-col items-start gap-4">
        <Aviso tipo="alerta" titulo={t.titulo}>
          {t.texto}
        </Aviso>
        <BotaoLink href="/entrar?next=/painel" variante="primario">
          Entrar
        </BotaoLink>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h2">Olá, {a.nome}!</h1>
        <p className="mt-2 text-body text-ink-muted">
          {a.vaga
            ? `A vaga de ${a.vaga} já está no ar no Publike. Para ver os candidatos e cuidar da vaga, coloque o seu e-mail, o de quem vai cuidar da vaga (pode ser o seu Gmail). É por ele que você entra, sem senha: o link de entrar chega nele.`
            : "A sua conta no Publike já está pronta. Para cuidar dela (e colocar as fotos dos seus serviços), coloque o seu e-mail. É por ele que você entra, sem senha: o link de entrar chega nele."}
        </p>
      </div>
      <FormAcesso token={token} pessoal={!a.vaga} />
    </div>
  );
}
