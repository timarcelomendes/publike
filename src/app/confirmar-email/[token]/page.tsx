import type { Metadata } from "next";
import { Suspense } from "react";
import { Aviso, Container, Esqueleto } from "@/components/ui/basicos";
import { Botao, BotaoLink } from "@/components/ui/botao";
import {
  confirmarEmailDoWhatsapp,
  lerEmailAConfirmar,
} from "@/lib/acoes/confirmar-email";

export const metadata: Metadata = {
  title: "Confirmar e-mail",
  robots: { index: false, follow: false },
};

// O e-mail que a empresa escreveu no WhatsApp do Publike (migração 20271012120000): o toque confirma e põe o e-mail no
// login. Abrir não confirma (o leitor de links do e-mail abre a página sozinho).

export default function ConfirmarEmail({
  params,
  searchParams,
}: PageProps<"/confirmar-email/[token]">) {
  return (
    <Container className="max-w-xl py-8 sm:py-10">
      <Suspense fallback={<Esqueleto className="h-64 w-full rounded-lg" />}>
        {Promise.all([params, searchParams]).then(([{ token }, busca]) => (
          <Conteudo
            token={token}
            r={typeof busca.r === "string" ? busca.r : null}
          />
        ))}
      </Suspense>
    </Container>
  );
}

async function Conteudo({ token, r }: { token: string; r: string | null }) {
  if (r === "ok")
    return (
      <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-5 shadow-card sm:p-7">
        <h1 className="text-h2">E-mail confirmado ✅</h1>
        <p className="text-body text-ink-muted">
          Os avisos dos candidatos chegam também por e-mail. Para entrar no
          Publike, use este e-mail ou escreva “entrar” no WhatsApp do Publike.
        </p>
        <BotaoLink href="/painel" variante="primario" className="self-start">
          Ver minhas vagas
        </BotaoLink>
      </section>
    );
  if (r === "de_outra")
    return (
      <Aviso tipo="alerta" titulo="Esse e-mail já é de outra conta no Publike">
        Se a conta é sua, entre com esse e-mail no site. Se preferir, mande
        outro e-mail no WhatsApp do Publike.
      </Aviso>
    );
  const e = await lerEmailAConfirmar(token);
  if (!e || e.situacao === "nao_achou")
    return (
      <Aviso
        tipo="alerta"
        titulo={
          r === "erro" ? "Não deu para confirmar agora" : "Este link não vale"
        }
      >
        {r === "erro"
          ? "Tente de novo em instantes."
          : "Confira se abriu o link inteiro do e-mail. Se precisar, escreva o e-mail de novo no WhatsApp do Publike."}
      </Aviso>
    );
  if (e.situacao === "usado")
    return (
      <Aviso tipo="info" titulo="Este e-mail já foi confirmado">
        Os avisos dos candidatos já chegam em {e.email}.
      </Aviso>
    );
  if (e.situacao === "vencido")
    return (
      <Aviso tipo="alerta" titulo="Este link venceu">
        O link vale por 7 dias. Escreva o e-mail de novo no WhatsApp do Publike
        que eu mando outro.
      </Aviso>
    );
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-5 shadow-card sm:p-7">
      <h1 className="text-h2">Confirmar o e-mail</h1>
      <p className="text-body text-ink-muted">
        <strong className="text-ink">{e.email}</strong> vai receber os avisos
        dos candidatos e serve para entrar no Publike.
      </p>
      {r === "erro" ? (
        <Aviso tipo="alerta">
          Não deu para confirmar agora. Tente de novo em instantes.
        </Aviso>
      ) : null}
      <form action={confirmarEmailDoWhatsapp}>
        <input type="hidden" name="token" value={token} />
        <Botao type="submit" variante="primario">
          Confirmar e-mail
        </Botao>
      </form>
    </section>
  );
}
