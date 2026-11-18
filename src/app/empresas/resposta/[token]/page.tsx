import { MailX } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { RespostaEmailEmpresas } from "@/components/email-empresas/resposta";
import { Container, Esqueleto, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { primeiro } from "@/lib/formato";
import { criarClientePublico } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Publicar as vagas no Publike", robots: { index: false } };

// O botão do e-mail às empresas (18/11/2026; migração 20270722120000): o sim, com onde estão as vagas, ou o "não
// quero receber". O token do link diz de quem é; nada muda só por abrir (a primeira abertura fica registrada).

export default function PaginaResposta({ params, searchParams }: PageProps<"/empresas/resposta/[token]">) {
  return (
    <Container className="max-w-xl py-10">
      <Suspense fallback={<Esqueleto className="h-96 w-full rounded-lg" />}>
        <Conteudo params={params} searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Conteudo({
  params,
  searchParams,
}: {
  params: PageProps<"/empresas/resposta/[token]">["params"];
  searchParams: PageProps<"/empresas/resposta/[token]">["searchParams"];
}) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const valido = /^[0-9a-f]{64}$/.test(token);
  const { data, error } =
    valido && !MODO_DEMO
      ? await criarClientePublico().rpc("email_empresas_ver", { p_token: token })
      : { data: null, error: null };
  if (error) console.error(`Publike: a página do e-mail às empresas não leu o link: ${error.message}`);
  const envio = data as { nome: string; situacao: string; link_vagas: string | null } | null;
  if (!envio) {
    return (
      <Vazio
        icone={MailX}
        titulo="Este link não vale mais"
        acao={<BotaoLink href="/publicar">Publicar uma vaga</BotaoLink>}
      >
        Publicar vagas no Publike é de graça. Se preferir, responda o e-mail que recebeu.
      </Vazio>
    );
  }
  return (
    <RespostaEmailEmpresas
      token={token}
      empresa={envio.nome}
      jaDisse={envio.situacao === "sim" || envio.situacao === "nao" ? envio.situacao : null}
      linkInicial={envio.link_vagas}
      sair={primeiro(sp.sair) === "1"}
    />
  );
}
