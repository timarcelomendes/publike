import { MailX } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfirmarSaida } from "@/components/avisos/confirmar-saida";
import { Container, Esqueleto, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { nomeDoQueSai } from "@/lib/avisos";
import { primeiro } from "@/lib/formato";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Parar de receber por e-mail", robots: { index: false } };

// O link do rodapé dos e-mails: desliga este tipo de aviso no e-mail sem precisar entrar (a chave do
// link diz de quem é). Pede para confirmar: leitores de link abrem o endereço sozinhos.

export default function PaginaSair({ searchParams }: PageProps<"/avisos/sair">) {
  return (
    <Container className="max-w-xl py-10">
      <Suspense fallback={<Esqueleto className="h-72 w-full rounded-lg" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/avisos/sair">["searchParams"] }) {
  const sp = await searchParams;
  const chave = (primeiro(sp.c) ?? "").trim();
  const grupo = (primeiro(sp.g) ?? "todos").trim();
  const nome = nomeDoQueSai(grupo);
  if (!UUID.test(chave) || !nome) {
    return (
      <Vazio
        icone={MailX}
        titulo="Este link não vale mais"
        acao={<BotaoLink href="/perfil/avisos">Escolher os avisos</BotaoLink>}
      >
        Entre na sua conta para escolher o que chega no e-mail e no celular.
      </Vazio>
    );
  }
  return <ConfirmarSaida chave={chave} grupo={grupo} nome={nome} />;
}
